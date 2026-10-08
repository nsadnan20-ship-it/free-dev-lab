import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReportExecutionStage } from '../report-execution/checkpoint';
import { SupabaseReportExecutionStore } from '../report-execution/durable-worker-adapter.ts';
import { runDurableProductionLifecycle } from '../report-execution/durable-production-runner.ts';
import type { CanonicalImportEntityType, ReconciledCanonicalImportRow } from './canonical-truth-boundary';
import { commitImportBatch } from './canonical-commit.ts';
import { detectReportArchetype, getReportArchetype } from '../report-intelligence/archetype-registry.ts';
import { matchCanonicalField, type CanonicalField } from '../report-intelligence/canonical-schema.ts';

export interface DurableCanonicalImportInput {
  importId: string;
  fileName: string;
  sourceHash: string;
  entityType: CanonicalImportEntityType;
  rows: ReconciledCanonicalImportRow[];
  qualityScore: number;
  qualityApproved: boolean;
  repairExistingSource?: boolean;
}

export interface CanonicalImportExecutionOptions {
  serverExecution?: boolean;
  workerClient?: SupabaseClient;
  dataClient?: SupabaseClient;
  companyId?: string;
  requestedBy?: string;
}

interface EnqueuedJob {
  id: string;
  company_id: string;
  status: string;
  checkpoint: unknown;
  attempt: number;
  max_attempts: number;
}

function rowKey(entityType: DurableCanonicalImportInput['entityType'], row: ReconciledCanonicalImportRow): string {
  if (entityType.startsWith('generic:')) {
    return `${entityType}:${row.provenance.lineageId}`;
  }
  const value = entityType === 'products'
    ? row.data.sku
    : entityType === 'sales_invoices'
      ? row.data.invoice_number
      : (row.data.code ?? row.data.name);
  const key = String(value ?? '').trim();
  if (!key) throw new Error(`IMPORT_ROW_BUSINESS_KEY_REQUIRED:${row.rowNumber}`);
  return `${entityType}:${key.toLowerCase()}`;
}

function assertUniqueBusinessKeys(entityType: DurableCanonicalImportInput['entityType'], rows: ReconciledCanonicalImportRow[]): void {
  const seen = new Set<string>();
  for (const row of rows) {
    const key = rowKey(entityType, row);
    if (seen.has(key)) throw new Error(`IMPORT_DUPLICATE_BUSINESS_KEY:${key}`);
    seen.add(key);
  }
}

function assertSourceHash(rows: ReconciledCanonicalImportRow[], sourceHash: string): void {
  if (!/^sha256:[0-9a-fA-F]{64}$/.test(sourceHash)) throw new Error('IMPORT_SOURCE_HASH_INVALID');
  for (const row of rows) {
    if (row.provenance.sourceHash !== sourceHash) throw new Error(`CANONICAL_SOURCE_HASH_MISMATCH:${row.rowNumber}`);
  }
}

interface CanonicalServerExecutionResult { jobId?: string; importId: string; sourceHash: string; [key: string]: unknown }

type PersistedArchetype = {
  id: string | null;
  version: number | null;
  state: string;
  reason: string;
};

type RenderedOutput = Record<string, unknown> & {
  archetypeId?: string | null;
  archetypeVersion?: number | null;
  profileVersion?: number | null;
  archetypeState?: string;
  archetypeReason?: string;
};

const DOMAIN_OUTPUTS: Record<string, { path: string; label: string }> = {
  sales: { path: '/reports/sales', label: 'تقرير المبيعات' },
  purchases: { path: '/reports/purchases', label: 'تقرير المشتريات' },
  inventory: { path: '/reports/inventory', label: 'تقرير المخزون' },
  payments: { path: '/analytics/liquidity', label: 'تحليل السيولة والمدفوعات' },
  receivables: { path: '/reports/receivables', label: 'تقرير الذمم المدينة' },
  profitability: { path: '/reports/profitability', label: 'تقرير الربحية' },
};

function normalizeKeys(rows: ReconciledCanonicalImportRow[]): Set<string> {
  const keys = new Set<string>();
  for (const row of rows.slice(0, 100)) {
    for (const key of Object.keys(row.data)) keys.add(key.toLowerCase().replace(/[\s_\-]+/g, ''));
  }
  return keys;
}

function inferSpecialty(entityType: CanonicalImportEntityType, rows: ReconciledCanonicalImportRow[], sourcePath = ''): string | null {
  if (entityType.startsWith('generic:')) {
    const explicit = entityType.slice('generic:'.length);
    if (explicit && explicit !== 'source-data') return explicit;
  }
  const keys = normalizeKeys(rows);
  const has = (...tokens: string[]) => tokens.some(token => [...keys].some(key => key.includes(token)));
  if (has('supplier', 'مورد') && has('quantity', 'qty', 'netamount', 'شراء')) return 'purchases';
  if (has('customer', 'عميل', 'ذمم', 'receivable', 'credit') && has('balance', 'الرصيد', 'amount', 'netamount')) return 'receivables';
  if (has('customer', 'عميل') && has('invoice', 'فاتورة') && has('total', 'amount', 'netamount', 'اجمالي')) return 'sales';
  if (has('payment', 'payments', 'دائن', 'مدين', 'cash', 'تحصيل')) return 'payments';
  if (has('quantity', 'qty', 'netamount', 'sales', 'مبيعات')) return 'sales';
  if (has('stock', 'inventory', 'مخزون', 'currentstock', 'sellingprice', 'costprice', 'سعر')) return 'inventory';

  // Filename is a fallback signal only after the structural/content pass above.
  // It never creates canonical fields or financial truth by itself.
  const path = sourcePath.normalize('NFKC').toLowerCase();
  if (/ذمم|ديون|تحصيل|receivable|aging/.test(path)) return 'receivables';
  if (/مشتريات|شراء|purchase/.test(path)) return 'purchases';
  if (/مبيعات|بيع|sales/.test(path)) return 'sales';
  if (/مخزون|اصناف|أصناف|inventory|stock/.test(path)) return 'inventory';
  if (/مدفوع|دفعات|payments|liquidity/.test(path)) return 'payments';
  return null;
}

type SourceReportMetrics = {
  totalAmount: number | null;
  uniqueInvoiceCount: number | null;
  missingCustomerRows: number | null;
  missingInvoiceNumberRows: number | null;
  missingInvoiceTypeRows: number | null;
  receivableCandidate: number | null;
  asOfStart: string | null;
  asOfEnd: string | null;
  fieldAvailability: {
    total: boolean;
    invoiceNumber: boolean;
    customer: boolean;
    invoiceType: boolean;
    date: boolean;
  };
};

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizedValue(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[ً-ْ]/g, '')
    .replace(/\s+/g, ' ');
}

function buildSourceReportMetrics(rows: ReconciledCanonicalImportRow[]): SourceReportMetrics {
  const data = rows.map((row) => row.data);
  const hasField = (field: string) => data.some((record) => Object.prototype.hasOwnProperty.call(record, field));
  const fieldAvailability = {
    total: hasField('total'),
    invoiceNumber: hasField('invoice_number'),
    customer: hasField('customer_name'),
    invoiceType: hasField('invoice_type'),
    date: hasField('date'),
  };

  const totalValues = fieldAvailability.total
    ? data.map((record) => finiteNumber(record.total)).filter((value): value is number => value !== null)
    : [];
  const invoiceValues = fieldAvailability.invoiceNumber
    ? data.map((record) => String(record.invoice_number ?? '').trim()).filter(Boolean)
    : [];
  const dates = fieldAvailability.date
    ? data.map((record) => String(record.date ?? '').trim()).filter(Boolean).sort()
    : [];

  let receivableCandidate: number | null = null;
  if (fieldAvailability.total && fieldAvailability.invoiceType) {
    let total = 0;
    let matched = 0;
    for (const record of data) {
      const amount = finiteNumber(record.total);
      const type = normalizedValue(record.invoice_type);
      if (amount !== null && (type === 'آجل' || type === 'اجل' || type.includes('credit'))) {
        total += amount;
        matched += 1;
      }
    }
    receivableCandidate = matched > 0 ? total : null;
  }

  return {
    totalAmount: totalValues.length ? totalValues.reduce((sum, value) => sum + value, 0) : null,
    uniqueInvoiceCount: invoiceValues.length ? new Set(invoiceValues).size : null,
    missingCustomerRows: fieldAvailability.customer
      ? data.filter((record) => !String(record.customer_name ?? '').trim()).length
      : null,
    missingInvoiceNumberRows: fieldAvailability.invoiceNumber
      ? data.filter((record) => !String(record.invoice_number ?? '').trim()).length
      : null,
    missingInvoiceTypeRows: fieldAvailability.invoiceType
      ? data.filter((record) => !String(record.invoice_type ?? '').trim()).length
      : null,
    receivableCandidate,
    asOfStart: dates.length ? dates[0] : null,
    asOfEnd: dates.length ? dates[dates.length - 1] : null,
    fieldAvailability,
  };
}

export function buildRenderedOutput(input: DurableCanonicalImportInput, rows = input.rows): RenderedOutput {
  const specialty = inferSpecialty(input.entityType, rows, input.fileName);
  const domain = specialty ? DOMAIN_OUTPUTS[specialty] : null;
  const outputs = [
    { key: 'executive', path: '/reports/executive', label: 'التقرير التنفيذي', stage: 'DECISION OUTPUT' },
    { key: 'evidence', path: '/trust', label: 'الثقة والأدلة', stage: 'EVIDENCE OUTPUT' },
    { key: 'decision', path: '/decision-experience', label: 'مساحة القرار', stage: 'DECISION SURFACE' },
    { key: 'work-center', path: '/work-center', label: 'مركز العمل', stage: 'ACTION SURFACE' },
    ...(domain ? [{ key: 'domain-' + specialty, path: domain.path, label: domain.label, stage: 'DOMAIN OUTPUT', specialty }] : []),
  ].map((surface) => ({
    ...surface,
    importId: input.importId,
    rendered: true,
    sourceHash: input.sourceHash,
    sourceBound: true,
    eligibility: 'EVIDENCE_REQUIRED',
  }));

  const availableFields = [...new Set(rows.slice(0, 250).flatMap((row) => Object.keys(row.data)))] as Parameters<typeof detectReportArchetype>[0]['availableFields'];
  const archetype = detectReportArchetype({
    sourcePath: input.fileName,
    specialty,
    availableFields,
  });

  const canonicalFieldSet = new Set<CanonicalField>(
    availableFields
      .map((field) => matchCanonicalField(field))
      .filter((field): field is CanonicalField => Boolean(field)),
  );
  const invoiceDetailProfile = input.entityType === 'sales_invoices'
    ? getReportArchetype('sales.invoice-detail')
    : specialty
      ? getReportArchetype(`${specialty}.invoice-detail`)
      : null;
  const invoiceDetailSignalCount = ['unitPrice', 'grossAmount', 'discount', 'cost']
    .filter((field) => canonicalFieldSet.has(field as CanonicalField))
    .length;
  const persistedResolution =
    archetype.profile
      ? archetype
      : invoiceDetailProfile &&
          canonicalFieldSet.has('documentNo') &&
          canonicalFieldSet.has('documentDate') &&
          canonicalFieldSet.has('netAmount') &&
          invoiceDetailSignalCount >= 2
        ? {
            profile: invoiceDetailProfile,
            state: 'SUPPORTED' as const,
            reason: 'INVOICE_DETAIL_CANONICAL_CLUSTER',
          }
        : archetype;

  const persistedArchetype: PersistedArchetype = {
    id: persistedResolution.profile?.id ?? null,
    version: persistedResolution.profile?.version ?? null,
    state: persistedResolution.state,
    reason: persistedResolution.reason,
  };

  return {
    outputs,
    importId: input.importId,
    entityType: input.entityType,
    sourceHash: input.sourceHash,
    sourceBound: true,
    renderedAt: new Date().toISOString(),
    rowCount: rows.length,
    sourceSpecialty: specialty,
    archetypeId: persistedArchetype.id,
    archetypeVersion: persistedArchetype.version,
    profileVersion: persistedArchetype.version,
    archetypeState: persistedArchetype.state,
    archetypeReason: persistedArchetype.reason,
    sourceMetrics: buildSourceReportMetrics(rows),
    trustState: input.qualityScore >= 75 ? 'TRUSTED' : input.qualityScore >= 50 ? 'REVIEW' : 'BLOCKED',
    qualityScore: input.qualityScore,
    evidenceStatus: 'AWAITING_EVIDENCE_SNAPSHOT',
    decisionStatus: 'NO_DECISION_COMMITTED',
    actionStatus: 'NO_ACTION_COMMITTED',
    outcomeStatus: 'NOT_AVAILABLE',
    learningStatus: 'NOT_AVAILABLE',
    benchmarkStatus: 'INSUFFICIENT_SAMPLE',
    replayStatus: 'NOT_AVAILABLE',
    contractVersion: '2026-09-30-report-output-v1',
  };
}

async function assertCanonicalCommitReadback(
  client: SupabaseClient,
  authoritativeCompanyId: string,
  sourceHash: string,
  expectedRows: number,
): Promise<void> {
  const { data, error } = await client
    .from('canonical_import_commits')
    .select('committed_count')
    .eq('company_id', authoritativeCompanyId)
    .eq('source_hash', sourceHash)
    .order('committed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data || Number(data.committed_count) !== expectedRows) {
    throw new Error('CANONICAL_IMPORT_COMMIT_READBACK_MISMATCH');
  }
}

async function finalizeImportJobIfOpen(
  client: SupabaseClient,
  input: DurableCanonicalImportInput,
  authoritativeCompanyId: string,
  summary: Record<string, unknown>,
): Promise<void> {
  const { data: current, error: currentError } = await client
    .from('import_jobs')
    .select('id,status,total_rows')
    .eq('id', input.importId)
    .eq('company_id', authoritativeCompanyId)
    .single();

  if (currentError || !current) throw currentError ?? new Error('IMPORT_JOB_NOT_FOUND_OR_FORBIDDEN');
  if (current.status === 'completed') return;
  if (['partial', 'failed', 'cancelled'].includes(current.status)) throw new Error('IMPORT_JOB_ALREADY_TERMINAL:' + current.status);

  if (Number(current.total_rows ?? 0) !== input.rows.length) {
    const { error: reconcileError } = await client
      .from('import_jobs')
      .update({
        total_rows: input.rows.length,
        result_summary: {
          ...summary,
          canonical_row_count_reconciled: true,
          previous_total_rows: Number(current.total_rows ?? 0),
        },
      })
      .eq('id', input.importId)
      .eq('company_id', authoritativeCompanyId)
      .in('status', ['queued', 'processing']);
    if (reconcileError) throw new Error('IMPORT_JOB_TOTAL_ROW_RECONCILIATION_FAILED:' + reconcileError.message);
  }

  const { error } = await client.rpc('import_finish_job', {
    p_job_id: input.importId,
    p_status: 'completed',
    p_result_summary: summary,
    p_error_message: null,
  });
  if (!error) return;

  const { data: recheck, error: recheckError } = await client
    .from('import_jobs')
    .select('status')
    .eq('id', input.importId)
    .eq('company_id', authoritativeCompanyId)
    .single();
  if (!recheckError && recheck?.status === 'completed') return;
  throw error;
}


async function executeThroughServerBoundary(input: DurableCanonicalImportInput, mode: 'execute' | 'finalize-source' = 'execute'): Promise<CanonicalServerExecutionResult> {
  const { supabase } = await import('../supabase');
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (sessionError || !accessToken) throw new Error('AUTHENTICATED_USER_REQUIRED');

  const response = await fetch('/api/canonical-import-execute', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...input, mode, serverSourceAuthority: mode === 'execute' }),
  });

  const text = await response.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { /* preserve sanitized transport error below */ }

  if (!response.ok) {
    const detail = typeof payload?.detail === 'string' ? payload.detail : typeof payload?.error === 'string' ? payload.error : `HTTP_${response.status}`;
    throw new Error(`CANONICAL_IMPORT_SERVER_EXECUTION_FAILED:${detail.slice(0, 512)}`);
  }
  if (!payload?.importId || !payload?.sourceHash || (mode === 'execute' && !payload?.jobId)) {
    throw new Error('CANONICAL_IMPORT_SERVER_EXECUTION_RESPONSE_INVALID');
  }
  return payload;
}

export async function runCanonicalImportThroughDurableRunner(
  input: DurableCanonicalImportInput,
  options: CanonicalImportExecutionOptions = {},
) {
  if (!input.rows.length) throw new Error('CANONICAL_IMPORT_REQUIRES_ROWS');
  if (typeof input.qualityApproved !== 'boolean') throw new Error('CANONICAL_IMPORT_QUALITY_APPROVAL_REQUIRED');
  if (!input.importId.trim()) throw new Error('CANONICAL_IMPORT_REQUIRES_IMPORT_ID');
  if (!input.fileName.trim()) throw new Error('CANONICAL_IMPORT_REQUIRES_SOURCE_PATH');
  if (!Number.isFinite(input.qualityScore) || input.qualityScore < 0 || input.qualityScore > 100) throw new Error('CANONICAL_IMPORT_INVALID_QUALITY');
  if (input.qualityScore < 50) throw new Error('CANONICAL_IMPORT_QUALITY_REJECTED');
  if (input.qualityScore < 75 && !input.qualityApproved) throw new Error('CANONICAL_IMPORT_REVIEW_APPROVAL_REQUIRED');

  if (typeof window !== 'undefined' && !options.serverExecution) {
    return executeThroughServerBoundary(input);
  }

  let workerClient = options.workerClient;
  let dataClient = options.dataClient;
  let authoritativeCompanyId = options.companyId;
  if (!workerClient || !dataClient || !authoritativeCompanyId) {
    if (typeof window === 'undefined') throw new Error('SERVER_CLIENTS_REQUIRED');
    const browser = await import('../supabase');
    workerClient ??= browser.supabase;
    dataClient ??= browser.supabase;
    authoritativeCompanyId ??= (await browser.resolveCurrentCompanyId()) ?? undefined;
  }
  if (!authoritativeCompanyId) throw new Error('TENANT_CONTEXT_REQUIRED');

  assertSourceHash(input.rows, input.sourceHash);
  assertUniqueBusinessKeys(input.entityType, input.rows);

  let requestedBy = options.requestedBy;
  if (!requestedBy) {
    const { data: userData, error: userError } = await dataClient.auth.getUser();
    if (userError) throw userError;
    requestedBy = userData.user?.id;
  }
  if (!requestedBy) throw new Error('AUTHENTICATED_USER_REQUIRED');

  const jobKey = `canonical-import:${input.entityType}:${input.sourceHash}`;
  const activeWorkerClient = workerClient;
  const activeDataClient = dataClient;
  if (!activeWorkerClient || !activeDataClient) throw new Error('SUPABASE_CLIENTS_REQUIRED');
  const enqueueArgs: Record<string, unknown> = {
    p_company_id: authoritativeCompanyId,
    p_job_key: jobKey,
    p_source_path: input.fileName,
    p_source_hash: input.sourceHash,
    p_evidence_keys: [
      `source:${input.sourceHash}`,
      `import:${input.importId}`,
      `entity:${input.entityType}`,
      `rows:${input.rows.length}`,
    ],
    p_max_attempts: 3,
  };
  if (input.repairExistingSource === true) {
    enqueueArgs.p_force_reprocess = true;
  }

  const { data: enqueueData, error: enqueueError } = input.repairExistingSource === true
    ? await activeWorkerClient.rpc('enqueue_report_execution_job', enqueueArgs)
    : await activeWorkerClient.rpc('enqueue_report_execution_job', enqueueArgs);
  if (enqueueError) throw enqueueError;
  if (!enqueueData || typeof enqueueData !== 'object') throw new Error('REPORT_EXECUTION_JOB_ENQUEUE_EMPTY');

  const job = enqueueData as EnqueuedJob;
  if (!job.id || job.company_id !== authoritativeCompanyId) throw new Error('REPORT_EXECUTION_JOB_TENANT_MISMATCH');
  if (job.status === 'cancelled' || job.status === 'dead_letter') throw new Error('IMPORT_DURABLE_JOB_NOT_RETRYABLE');
  if (job.status === 'succeeded' || job.status === 'completed') {
    await assertCanonicalCommitReadback(activeDataClient, authoritativeCompanyId, input.sourceHash, input.rows.length);
    const renderedOutput = buildRenderedOutput(input);
    await finalizeImportJobIfOpen(activeDataClient, input, authoritativeCompanyId, {
      companyId: authoritativeCompanyId,
      importId: input.importId,
      jobId: job.id,
      sourceHash: input.sourceHash,
      committed: input.rows.length,
      invalidRows: 0,
      rendered_output: renderedOutput,
      recovered_from_completed_durable_job: true,
    });
    return {
      importId: input.importId,
      sourceHash: input.sourceHash,
      jobId: job.id,
      authoritativeRowCount: input.rows.length,
      authoritativeQualityScore: input.qualityScore,
      renderedOutput,
      recoveredFromCompletedDurableJob: true,
    };
  }
  const store = new SupabaseReportExecutionStore(activeWorkerClient);
  if (job.status === 'running' || job.status === 'leased' || job.status === 'processing') {
    const currentLease = await store.require(job.id);
    const leaseExpiresAt = currentLease.leaseExpiresAt ? Date.parse(currentLease.leaseExpiresAt) : 0;
    if (Number.isFinite(leaseExpiresAt) && leaseExpiresAt > Date.now()) {
      throw new Error('IMPORT_DURABLE_JOB_ALREADY_RUNNING');
    }
    // Expired/no lease: allow runDurableProductionLifecycle() to reclaim it atomically.
  }
  if (job.status === 'failed') await store.retry(job.id, authoritativeCompanyId);

  const observedAt = new Date().toISOString();
  const quality = input.qualityScore / 100;
  const currentRows = input.rows.map((row) => ({
    key: rowKey(input.entityType, row),
    hash: `${input.sourceHash}:${row.rowNumber}`,
    value: row.data,
  }));
  const sourceCandidates = currentRows.map((row) => ({
    businessKey: row.key,
    sourceId: input.sourceHash,
    precedence: 0,
    observedAt,
    value: row.value,
  }));

  const result = await runDurableProductionLifecycle({
    jobId: job.id,
    workerId: `canonical-import-server:${crypto.randomUUID()}`,
    sourceHash: input.sourceHash,
    rows: input.rows.map((row) => row.data),
    request: {
      reportId: jobKey,
      tenantId: authoritativeCompanyId,
      requestedBy,
      parameters: { entityType: input.entityType, importId: input.importId, rowCount: input.rows.length },
      formats: ['web'],
      idempotencyKey: jobKey,
    },
    lifecycle: {
      previousRows: [],
      currentRows,
      sourceCandidates,
      scenarioOptions: [{ key: jobKey, expectedImpact: input.rows.length, risk: 1, liquidityRequired: 0, serviceLevel: 1 }],
      riskBudget: { maxRisk: 1, protectedLiquidity: input.rows.length, minimumServiceLevel: 0 },
      portfolioCandidates: [{ key: jobKey, materiality: 0.5, confidence: quality, urgency: 0.5, risk: 1 }],
      autonomy: { trustHealthy: false, evidenceQuality: quality, confidence: quality, riskBudgetValid: true, criticalDrift: false, rollbackVerified: false, isolationVerified: false },
      evidence: input.rows.map((row) => ({
        key: row.provenance.evidenceId,
        source: row.provenance.sourceId,
        observedAt,
        quality,
        details: {
          tenantId: row.provenance.tenantId,
          sourceHash: row.provenance.sourceHash,
          sourceDocumentId: row.provenance.sourceDocumentId,
          lineageId: row.provenance.lineageId,
          rowNumber: row.rowNumber,
        },
      })),
    },
    executeStage: async (stage: ReportExecutionStage) => {
      if (stage === 'fingerprinted' && input.sourceHash.length !== 71) throw new Error('IMPORT_SOURCE_HASH_INVALID');
      if (stage === 'extracted' && input.rows.length === 0) throw new Error('IMPORT_EXTRACTION_EMPTY');
      if (stage === 'canonicalized') {
        for (const row of input.rows) if (!row.data || typeof row.data !== 'object') throw new Error(`IMPORT_CANONICALIZATION_INVALID_ROW:${row.rowNumber}`);
      }
      if (stage === 'validated') {
        for (const row of input.rows) if (row.rowNumber < 1) throw new Error(`IMPORT_VALIDATION_INVALID_ROW_NUMBER:${row.rowNumber}`);
      }
      if (stage === 'analyzed' && !currentRows.length) throw new Error('IMPORT_ANALYSIS_EMPTY');
      if (stage === 'decisioned' && !input.rows.length) throw new Error('IMPORT_DECISION_EMPTY');
      if (stage === 'committed') await commitImportBatch(input.entityType, input.rows, input.sourceHash, { client: activeDataClient, companyId: authoritativeCompanyId, importJobId: input.importId, repairExistingSource: input.repairExistingSource === true });
      if (stage === 'rendered') return buildRenderedOutput(input);
    },
  }, store);

  const renderedOutput = (result as { renderedOutput?: RenderedOutput }).renderedOutput ?? buildRenderedOutput(input);
  await finalizeImportJobIfOpen(activeDataClient, input, authoritativeCompanyId, {
    companyId: authoritativeCompanyId,
    importId: input.importId,
    jobId: job.id,
    sourceHash: input.sourceHash,
    committed: input.rows.length,
    invalidRows: 0,
    rendered_output: renderedOutput,
    recovered_from_completed_durable_job: false,
  });

  return { ...result, jobId: job.id, importId: input.importId, authoritativeRowCount: input.rows.length, authoritativeQualityScore: input.qualityScore, renderedOutput };
}

export async function finalizeCanonicalImportSource(input: Pick<DurableCanonicalImportInput, 'importId' | 'fileName' | 'sourceHash' | 'entityType'>): Promise<{ importId: string; sourceHash: string }> {
  return executeThroughServerBoundary({ ...input, rows: [], qualityScore: 0, qualityApproved: false }, 'finalize-source');
}
