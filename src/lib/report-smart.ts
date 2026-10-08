import { supabase, resolveCurrentCompanyId } from './supabase.ts';
import { deriveReportIntelligence, type ReportIntelligence } from './report-intelligence/report-smart-insights.ts';
import { buildGenericFileIntelligence } from './file-engine/generic-intelligence.ts';
import type { ColumnProfile, Dataset } from './file-engine/types.ts';
import { resolveReportEvidenceStatus } from './report-smart-evidence-status.ts';
import { detectReportArchetype, runReportArchetype } from './report-intelligence/archetype-registry.ts';

export type ReportRequestOptions = { signal?: AbortSignal };

function maybeAbort<T>(query: T, signal?: AbortSignal): T {
  if (!signal) return query;
  return (query as T & { abortSignal: (value: AbortSignal) => T }).abortSignal(signal);
}

export type SmartReportCatalogItem = {
  jobId: string;
  sourcePath: string;
  sourceHash: string;
  entityType: string;
  rowCount: number | null;
  qualityScore: number | null;
  trustState: string | null;
  reportVerificationState: string | null;
  specialty: string | null;
  evidenceStatus: string | null;
  archetypeId: string | null;
  archetypeVersion: number | null;
  archetypeState: string | null;
  recommendationStatus: string | null;
  decisionStatus: string | null;
  approvalStatus: string | null;
  actionStatus: string | null;
  outcomeStatus: string | null;
  learningStatus: string | null;
  completedAt: string | null;
};

export type SmartReportDetail = SmartReportCatalogItem & {
  tenantId: string;
  importId: string | null;
  checkpointStage: string | null;
  renderedOutput: Record<string, unknown>;
  sourceAnalysis: {
    id: string;
    importJobId: string | null;
    sourceFormat: string | null;
    analysisStatus: string | null;
    qualityScore: number | null;
    rowCount: number | null;
    columnCount: number | null;
    createdAt: string | null;
    datasets: unknown[];
  } | null;
  stages: Array<{
    ordinal: number;
    stage: string;
    status: string;
    attempt: number;
    startedAt: string | null;
    completedAt: string | null;
    lastError: Record<string, unknown>;
    evidence: Record<string, unknown>;
  }>;
  authoritativeCurrentRowCount: number | null;
  canonicalCommitGap: number | null;
  canonicalCommitCount: number;
  canonicalCommitVerified: boolean;
  canonicalAnalysisScope: 'FULL_SOURCE' | 'PARTIAL_FETCH_CEILING' | 'PARTIAL_FETCH_ERROR';
  sourceTrustState: string | null;
  reportVerificationState: string;
  canonicalRows: Array<{ row_number: number; data: Record<string, unknown> }>;
  intelligence: ReportIntelligence;
  runtimeWarnings?: string[];
};

function renderedOutputOf(evidence: unknown): Record<string, unknown> | null {
  if (!evidence || typeof evidence !== 'object') return null;
  const value = (evidence as Record<string, unknown>).renderedOutput;
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function entityTypeFrom(jobKey: string): string {
  const parts = jobKey.split(':');
  if (parts[0] === 'canonical-import' && parts[1] === 'generic' && parts[2]) return `generic:${parts[2]}`;
  if (parts[0] === 'canonical-import' && parts[1]) return parts[1];
  return parts.length >= 3 ? parts.slice(2).join(':') : jobKey;
}

function isReportSourcePath(path: string): boolean {
  return /\.(xlsx|xls|xlsm|csv|tsv|ods|pdf|docx|doc|rtf|json|jsonl|txt|md|markdown|jpg|jpeg|png|webp|tiff|bmp)$/i.test(path);
}

type AnalysisSnapshotLike = {
  datasets?: unknown;
};

function isExtractionArtifactHeader(value: unknown): boolean {
  const key = String(value ?? '').trim();
  return /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(key) || /^20\d{2}-?$/.test(key);
}

function normalizeBusinessField(value: unknown, specialty?: string | null): string | null {
  const key = String(value ?? '').trim().toLowerCase().normalize('NFKC').replace(/[\s_-]+/g, '');
  if (specialty === 'inventory' && ['الرصيد','الرصيدالحالي','المخزونالحالي','الكميةالمتوفرة','الكميةالمتاحة','currentstock','onhand'].includes(key)) return 'current_stock';
  const aliases: Array<[string,string[]]> = [
    ['date',['date','التاريخ','تاريخالفاتورة','التاريخ2026']],
    ['invoice_number',['invoice_number','invoice number','رقمالفاتورة','رقمالفاتوره']],
    ['invoice_type',['invoice_type','invoice type','نوعالفاتورة','نوعالفاتوره']],
    ['customer_name',['customer_name','customer','اسم العميل','العميل']],
    ['supplier_name',['supplier_name','supplier','اسم المورد','المورد']],
    ['product_name',['product_name','product','item_name','item','اسم الصنف','اسم المنتج','الصنف']],
    ['sku',['sku','product_code','productcode','item_code','رمز الصنف','كود الصنف','رقم الصنف']],
    ['total',['total','total_amount','الإجمالي','الاجمالي','اجماليالفاتورة','اجماليالفاتوره']],
    ['net_amount',['net_amount','مبلغالصافيبالمحلي','مبلغصافالمحلي','الصافيبالمحلي']],
    ['paid_amount',['paid_amount','paid','المدفوع']],
    ['balance',['balance','الرصيد','الرصيدالمستحق','outstanding_balance']],
    ['current_stock',['current_stock','currentstock','stock','on_hand','onhand','الرصيدالحالي','المخزونالحالي','الكميةالمتوفرة','الكميةالمتاحة']],
    ['credit',['credit','دائن']],
    ['debit',['debit','مدين']],
    ['quantity',['quantity','qty','الكمية','العدد']],
    ['daily_sales_rate',['daily_sales_rate','dailysalesrate','معدل البيع اليومي','معدل البيع ليومي','معدل البيعيومي','متوسط البيع اليومي']],
    ['annual_sales_rate',['annual_sales_rate','annualsalesrate','معدل البيع العام','معدل البيع السنوي']],
    ['sales_qty',['sales_qty','salesqty','كمية المبيعات','الكميةالمباعة','صافي المبيعات','صافيالمبيعات']],
    ['stockout_days',['stockout_days','stockoutdays','أيام النفاد','فترة النفاد','الفترة المتوقعة لنفاد الكمية','الفترةالمتوقعةلنفادالكمية']],
    ['stock_age_days',['stock_age_days','stockagedays','عمر المخزون','عمرالمخزون']],
    ['stock_age_period_days',['stock_age_period_days','stockageperioddays','عمر المخزون للفترة','عمرالمخزونللفترة']],
    ['opening_stock',['opening_stock','openingstock','الرصيد الافتتاحي','الرصيدالإفتتاحي','المخزون الافتتاحي']],
    ['incoming',['incoming','inbound','الوارد','الـوارد']],
    ['net_inbound',['net_inbound','netinbound','صافي الوارد','صافيوارد']],
    ['transfers_pending',['transfers_pending','pending_transfer','تحويل غير مستلم','تحويلغيرمستلم']],
  ];
  for (const [canonical, candidates] of aliases) {
    if (candidates.some((candidate) => candidate.toLowerCase().normalize('NFKC').replace(/[\s_-]+/g,'') === key)) return canonical;
  }
  return null;
}

function sourceColumnDescriptors(analysis: AnalysisSnapshotLike | null | undefined, canonicalRows: Array<{data:Record<string,unknown>}> = [], specialty?: string | null) {
  const output = new Map<string, Record<string, unknown>>();
  const datasets = Array.isArray(analysis?.datasets) ? analysis.datasets : [];
  for (const dataset of datasets) {
    if (!dataset || typeof dataset !== 'object') continue;
    const columns = Array.isArray((dataset as Record<string, unknown>).columns) ? (dataset as Record<string, unknown>).columns as unknown[] : [];
    for (const column of columns) {
      if (column && typeof column === 'object') {
        const item = column as Record<string, unknown>;
        const name = String(item.name ?? item.mappedField ?? '').trim();
        if (!name || isExtractionArtifactHeader(name)) continue;
        const declaredMapped = String(item.mappedField ?? '').trim();
        const semanticMapped = normalizeBusinessField(name, specialty);
        const mapped = String(semanticMapped ?? declaredMapped ?? '').trim();
        const originalQualityIssues = Array.isArray(item.qualityIssues)
          ? item.qualityIssues.map(String)
          : [];
        const qualityIssues = semanticMapped
          ? originalQualityIssues.filter((issue) => issue !== 'لم يتم تعريف العمود')
          : originalQualityIssues;
        const requiresReview = semanticMapped
          ? Boolean(item.requiresReview) && qualityIssues.length > 0
          : Boolean(item.requiresReview);
        output.set(mapped || name, {
          ...item,
          name,
          mappedField: mapped || null,
          qualityIssues,
          requiresReview,
          mappingConfidence: semanticMapped
            ? Math.max(Number(item.mappingConfidence ?? 0), 85)
            : item.mappingConfidence,
          mappingEvidence: semanticMapped
            ? {
                ...(item.mappingEvidence && typeof item.mappingEvidence === 'object'
                  ? item.mappingEvidence as Record<string, unknown>
                  : {}),
                semanticMapped: true,
                originalMappedField: item.mappedField ?? null,
              }
            : item.mappingEvidence,
        });
      } else {
        const name = String(column ?? '').trim();
        if (!name || isExtractionArtifactHeader(name)) continue;
        const mapped = normalizeBusinessField(name, specialty);
        output.set(mapped || name, { name, mappedField: mapped, mappingConfidence: mapped ? 85 : 0 });
      }
    }
  }
  for (const row of canonicalRows.slice(0, 500)) {
    for (const name of Object.keys(row.data ?? {})) {
      const mapped = normalizeBusinessField(name, specialty);
      if (mapped && !output.has(mapped)) output.set(mapped, { name, mappedField: mapped, mappingConfidence: 80 });
    }
  }
  return [...output.values()];
}

function inferSpecialtyFromAnalysis(analysis: AnalysisSnapshotLike | null | undefined): string | null {
  const datasets = Array.isArray(analysis?.datasets) ? analysis.datasets : [];
  const fields: Array<{ name: string; mapped: string }> = [];

  for (const dataset of datasets) {
    if (!dataset || typeof dataset !== 'object') continue;
    const row = dataset as Record<string, unknown>;
    const columns = Array.isArray(row.columns) ? row.columns : [];
    for (const column of columns) {
      if (column && typeof column === 'object') {
        const item = column as Record<string, unknown>;
        const name = String(item.name ?? '').trim().toLowerCase().normalize('NFKC');
        const semanticMapped = normalizeBusinessField(name);
        const mapped = String(semanticMapped ?? item.mappedField ?? '').trim().toLowerCase().normalize('NFKC');
        if (name || mapped) fields.push({ name, mapped });
      } else {
        const name = String(column ?? '').trim().toLowerCase().normalize('NFKC');
        const mapped = String(normalizeBusinessField(name) ?? '').trim().toLowerCase().normalize('NFKC');
        if (name || mapped) fields.push({ name, mapped });
      }
    }
  }

  if (!fields.length) return null;

  const score = (tokens: string[]) => {
    const normalizedTokens = tokens.map((token) => token.toLowerCase().normalize('NFKC').replace(/[\s_-]+/g, ''));
    return fields.reduce((sum, field) => {
      const mappedKey = field.mapped.replace(/[\s_-]+/g, '');
      const nameKey = field.name.replace(/[\s_-]+/g, '');
      return sum
        + normalizedTokens.reduce((inner, token) => {
          if (!token) return inner;
          if (mappedKey === token) return inner + 3;
          if (nameKey === token) return inner + 1;
          return inner;
        }, 0);
    }, 0);
  };

  const scores = {
    inventory: score([
      'sku', 'productcode', 'productname', 'itemname', 'رقم الصنف', 'الصنف',
      'balance', 'current_stock', 'opening_balance', 'opening_stock', 'incoming',
      'net_inbound', 'sales_qty', 'warehouse', 'stockout_days', 'stock_age_days',
      'stock_age_period_days', 'daily_sales_rate', 'annual_sales_rate',
    ]),
    sales: score([
      'invoice_number', 'customer_name', 'total', 'net_amount', 'date',
      'sales_qty', 'sales', 'المبيعات', 'فاتورة', 'العميل', 'الإجمالي',
    ]),
    purchases: score([
      'invoice_number', 'supplier_name', 'total', 'purchase_qty', 'cost',
      'date', 'المشتريات', 'المورد',
    ]),
    receivables: score([
      'balance', 'due', 'due_date', 'customer_name', 'receivable',
      'receivables', 'ذمم', 'الرصيد المستحق',
    ]),
    payments: score([
      'payment', 'payment_method', 'paid_amount', 'cash', 'bank',
      'الصراف', 'النقد', 'البنك',
    ]),
    profitability: score([
      'profit', 'margin', 'cost', 'revenue', 'gross_amount', 'net_amount',
      'الربح', 'الهامش', 'التكلفة',
    ]),
  } as const;

  const ranked = (Object.entries(scores) as Array<[string, number]>)
    .sort((a, b) => b[1] - a[1]);
  const [best, bestScore] = ranked[0] ?? [null, 0];
  const secondScore = ranked[1]?.[1] ?? 0;

  if (!best || bestScore < 4 || bestScore === secondScore) return null;
  return best;
}

function resolveEffectiveSpecialty(renderedSpecialty: unknown, analysis: AnalysisSnapshotLike | null | undefined): string | null {
  const renderedValue = renderedSpecialty == null ? null : String(renderedSpecialty).trim() || null;
  const inferred = inferSpecialtyFromAnalysis(analysis);
  // Persisted specialty can be stale after source reclassification. A strong
  // semantic inference from the actual analysis columns is more trustworthy.
  return inferred ?? renderedValue;
}

function analysisUsabilityScore(analysis: Record<string, unknown>): number {
  const datasets = Array.isArray(analysis.datasets) ? analysis.datasets : [];
  let datasetsWithColumns = 0;
  let totalColumns = 0;
  let previewRows = 0;
  for (const dataset of datasets) {
    if (!dataset || typeof dataset !== 'object') continue;
    const row = dataset as Record<string, unknown>;
    const columns = Array.isArray(row.columns) ? row.columns : [];
    if (columns.length > 0) datasetsWithColumns += 1;
    totalColumns += columns.length;
    if (Array.isArray(row.preview)) previewRows += row.preview.length;
  }
  const rowCountValue = Number(analysis.row_count ?? 0);
  const qualityValue = Number(analysis.quality_score ?? 0);
  const rowCount = Number.isFinite(rowCountValue) ? rowCountValue : 0;
  const quality = Number.isFinite(qualityValue) ? qualityValue : 0;
  return (
    datasetsWithColumns * 1_000_000 +
    totalColumns * 10_000 +
    Math.min(10_000, Math.max(0, previewRows)) * 10 +
    Math.min(100, Math.max(0, quality)) +
    Math.min(1_000_000, Math.max(0, rowCount)) / 1_000_000
  );
}

function chooseBestAnalysisSnapshot(rows: Array<Record<string, unknown>>): Record<string, unknown> | null {
  if (!rows.length) return null;
  return [...rows].sort((left, right) => {
    const usabilityDelta = analysisUsabilityScore(right) - analysisUsabilityScore(left);
    if (usabilityDelta !== 0) return usabilityDelta;
    const rightTime = Date.parse(String(right.created_at ?? ''));
    const leftTime = Date.parse(String(left.created_at ?? ''));
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
  })[0] ?? null;
}

function resolveImportJobId(
  job: Record<string, unknown>,
  rendered: Record<string, unknown>,
  analysis: Record<string, unknown> | null,
): string {
  const renderedImportId = rendered.importId == null ? '' : String(rendered.importId).trim();
  if (renderedImportId) return renderedImportId;

  const checkpoint = job.checkpoint;
  if (checkpoint && typeof checkpoint === 'object') {
    const evidenceKeys = (checkpoint as Record<string, unknown>).evidenceKeys;
    if (Array.isArray(evidenceKeys)) {
      const importKey = evidenceKeys
        .map((value) => String(value ?? '').trim())
        .find((value) => value.startsWith('import:') && value.slice('import:'.length).trim());
      if (importKey) return importKey.slice('import:'.length).trim();
    }
  }

  const analysisImportId = analysis?.import_job_id == null ? '' : String(analysis.import_job_id).trim();
  return analysisImportId;
}

function buildGenericDatasetForReport(input: {
  sourcePath: string;
  sourceAnalysis: SmartReportDetail['sourceAnalysis'];
  canonicalRows: SmartReportDetail['canonicalRows'];
  qualityScore: number | null;
}): Dataset | null {
  const rows = input.canonicalRows
    .map((row) => row.data)
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'));
  if (!rows.length) return null;

  const sourceDataset = input.sourceAnalysis?.datasets?.find((dataset) => dataset && typeof dataset === 'object') as Record<string, unknown> | undefined;
  const sourceColumns = Array.isArray(sourceDataset?.columns) ? sourceDataset.columns : [];
  const fallbackNames = Object.keys(rows[0] ?? {});
  const rawColumns = sourceColumns.length ? sourceColumns : fallbackNames.map((name) => ({ name }));

  const columns = rawColumns.map((column) => {
    const item = column && typeof column === 'object' ? column as Record<string, unknown> : { name: String(column ?? '') };
    return {
      name: String(item.name ?? item.mappedField ?? 'حقل المصدر'),
      mappedField: item.mappedField == null ? null : String(item.mappedField),
      mappingConfidence: Number.isFinite(Number(item.mappingConfidence)) ? Number(item.mappingConfidence) : 0,
      requiresReview: item.requiresReview === true,
      mappingEvidence: item.mappingEvidence && typeof item.mappingEvidence === 'object' ? item.mappingEvidence as ColumnProfile['mappingEvidence'] : undefined,
      dataType: String(item.dataType ?? 'unknown') as ColumnProfile['dataType'],
      nullCount: Number.isFinite(Number(item.nullCount)) ? Number(item.nullCount) : 0,
      uniqueCount: Number.isFinite(Number(item.uniqueCount)) ? Number(item.uniqueCount) : 0,
      uniqueRatio: Number.isFinite(Number(item.uniqueRatio)) ? Number(item.uniqueRatio) : 0,
      sampleValues: Array.isArray(item.sampleValues) ? item.sampleValues : [],
      statistics: item.statistics && typeof item.statistics === 'object' ? item.statistics as ColumnProfile['statistics'] : { count: rows.length },
      qualityIssues: Array.isArray(item.qualityIssues) ? item.qualityIssues.map(String) : [],
    } as ColumnProfile;
  });

  return {
    id: String(sourceDataset?.id ?? input.sourcePath),
    name: String(sourceDataset?.name ?? input.sourcePath),
    source: String(sourceDataset?.source ?? input.sourcePath),
    sheet: sourceDataset?.sheet == null ? undefined : String(sourceDataset.sheet),
    rowCount: input.sourceAnalysis?.rowCount == null ? rows.length : Number(input.sourceAnalysis.rowCount),
    columnCount: input.sourceAnalysis?.columnCount == null ? columns.length : Number(input.sourceAnalysis.columnCount),
    columns,
    rows,
    preview: rows.slice(0, 50),
    qualityScore: input.qualityScore == null ? 0 : Number(input.qualityScore),
  };
}
function mapCatalogItem(job: Record<string, unknown>, analysis?: AnalysisSnapshotLike | null): SmartReportCatalogItem | null {
  const rendered = renderedOutputOf(job.evidence) ?? {};
  const path = String(job.source_path ?? '');
  if (!isReportSourcePath(path)) return null;

  const specialty = resolveEffectiveSpecialty(rendered.sourceSpecialty, analysis);

  const availableFields = [...new Set(sourceColumnDescriptors(analysis, [], specialty).flatMap((column) => {
    const mapped = String(column.mappedField ?? normalizeBusinessField(column.name) ?? '').trim();
    const name = String(column.name ?? '').trim();
    return [mapped, name].filter(Boolean);
  }))] as Parameters<typeof detectReportArchetype>[0]['availableFields'];

  const detected = detectReportArchetype({
    sourcePath: path,
    specialty,
    availableFields,
  });

  const renderedArchetypeId =
    typeof rendered.archetypeId === 'string' ? rendered.archetypeId.trim() : '';
  const detectedArchetypeId = detected.profile?.id ?? null;
  const archetypeId = renderedArchetypeId && renderedArchetypeId === detectedArchetypeId
    ? renderedArchetypeId
    : detectedArchetypeId;
  const archetypeVersion =
    archetypeId && detected.profile ? Number(detected.profile.version) : null;

  const normalizedEvidenceStatus =
    rendered.evidenceStatus === 'VERIFIED' && !(
      typeof rendered.evidenceSnapshotId === 'string' && rendered.evidenceSnapshotId.trim()
    )
      ? 'AWAITING_EVIDENCE_SNAPSHOT'
      : rendered.evidenceStatus == null
        ? null
        : String(rendered.evidenceStatus);

  return {
    jobId: String(job.id),
    sourcePath: path || 'مصدر غير مسمى',
    sourceHash: String(job.source_hash ?? ''),
    entityType: entityTypeFrom(String(job.job_key ?? '')),
    rowCount: rendered.rowCount == null && analysis && 'row_count' in (analysis as Record<string, unknown>) ? Number((analysis as Record<string, unknown>).row_count) : rendered.rowCount == null ? null : Number(rendered.rowCount),
    qualityScore: rendered.qualityScore == null && analysis && 'quality_score' in (analysis as Record<string, unknown>) ? Number((analysis as Record<string, unknown>).quality_score) : rendered.qualityScore == null ? null : Number(rendered.qualityScore),
    trustState: rendered.trustState == null ? null : String(rendered.trustState),
    reportVerificationState: normalizedEvidenceStatus ?? 'PENDING_EVIDENCE',
    specialty,
    evidenceStatus: normalizedEvidenceStatus,
    archetypeId,
    archetypeVersion,
    archetypeState: detected.state,
    recommendationStatus: rendered.recommendationStatus == null ? null : String(rendered.recommendationStatus),
    decisionStatus: rendered.decisionStatus == null ? null : String(rendered.decisionStatus),
    approvalStatus: rendered.approvalStatus == null ? null : String(rendered.approvalStatus),
    actionStatus: rendered.actionStatus == null ? null : String(rendered.actionStatus),
    outcomeStatus: rendered.outcomeStatus == null ? null : String(rendered.outcomeStatus),
    learningStatus: rendered.learningStatus == null ? null : String(rendered.learningStatus),
    completedAt: job.completed_at == null ? null : String(job.completed_at),
  };
}

export async function fetchSmartReportCatalog(limit = 500, options: ReportRequestOptions = {}): Promise<SmartReportCatalogItem[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 5000) throw new Error('REPORT_QUERY_INVALID_SMART_REPORT_LIMIT');
  const companyId = await resolveCurrentCompanyId(options.signal);
  if (!companyId) throw new Error('TENANT_REQUIRED');

  const pageSize = 200;
  const jobs: Array<Record<string, unknown>> = [];

  for (let offset = 0; offset < limit; offset += pageSize) {
    const endRange = Math.min(offset + pageSize - 1, limit - 1);
    const jobsQuery = supabase
      .from('report_execution_jobs')
      .select('id,source_path,source_hash,job_key,status,checkpoint,evidence,completed_at')
      .eq('company_id', companyId)
      .eq('status', 'completed')
      .like('job_key', 'canonical-import:generic:%')
      .order('completed_at', { ascending: false })
      .range(offset, endRange);
    const { data, error } = await maybeAbort(jobsQuery, options.signal);

    if (error) throw error;
    if (!data?.length) break;
    jobs.push(...(data as Array<Record<string, unknown>>));
    if (data.length < endRange - offset + 1) break;
  }

  const jobsWithImportIds = jobs.map((job) => ({
    job,
    importJobId: resolveImportJobId(job, renderedOutputOf(job.evidence) ?? {}, null),
  })).filter((entry) => entry.importJobId);

  const importJobIds = [...new Set(jobsWithImportIds.map((entry) => entry.importJobId))];
  const analysesByImportId = new Map<string, Record<string, unknown>>();

  for (let i = 0; i < importJobIds.length; i += 100) {
    const batch = importJobIds.slice(i, i + 100);
    if (!batch.length) continue;
    const analysesQuery = supabase
      .from('source_analysis_snapshots')
      .select('import_job_id,source_hash,source_format,analysis_status,quality_score,row_count,column_count,datasets,created_at')
      .eq('company_id', companyId)
      .in('import_job_id', batch)
      .order('created_at', { ascending: false })
      .limit(1000);
    const { data: analyses, error: analysisError } = await maybeAbort(analysesQuery, options.signal);

    if (analysisError) throw analysisError;
    const byImportId = new Map<string, Record<string, unknown>[]>();
    for (const analysis of analyses ?? []) {
      const importId = String(analysis.import_job_id ?? '').trim();
      if (!importId) continue;
      const rows = byImportId.get(importId) ?? [];
      rows.push(analysis as Record<string, unknown>);
      byImportId.set(importId, rows);
    }
    for (const [importId, rows] of byImportId) {
      const best = chooseBestAnalysisSnapshot(rows);
      if (best) analysesByImportId.set(importId, best);
    }
  }

  const catalog = jobsWithImportIds
    .map(({ job, importJobId }) => {
      const analysis = analysesByImportId.get(importJobId) ?? null;
      if (analysis && String(analysis.source_hash ?? '') !== String(job.source_hash ?? '')) return null;
      return mapCatalogItem(job, analysis);
    })
    .filter((item): item is SmartReportCatalogItem => Boolean(item && item.sourceHash));

  return catalog.slice(0, limit);}
function emptyReportIntelligence(specialty: string | null): ReportIntelligence {
  const owner =
    specialty === 'inventory' ? 'مسؤول المخزون' :
    specialty === 'sales' ? 'مسؤول المبيعات' :
    specialty === 'purchases' ? 'مسؤول المشتريات' :
    specialty === 'receivables' ? 'مسؤول التحصيل' :
    specialty === 'payments' ? 'مسؤول الخزينة' :
    specialty === 'profitability' ? 'المدير المالي' :
    'المسؤول التشغيلي المناسب للمصدر';
  return {
    businessQuestion: 'ما الذي يمكن إثباته من المصدر الحالي، وما الذي يحتاج مراجعة قبل القرار؟',
    summary: 'تعذر تشغيل طبقة الاستدلال المتخصصة على البيانات الحالية. بقيت حالة المصدر والدليل معروضة دون اختلاق نتائج.',
    signals: [],
    recommendations: [],
    forecast: {
      status: 'INSUFFICIENT_SAMPLE',
      metric: null,
      method: 'fail-soft-runtime',
      observedPeriods: 0,
      nextPeriod: null,
      nextValue: null,
      direction: null,
      note: 'تعذر تشغيل التنبؤ أثناء قراءة التقرير؛ لا يتم اختلاق قيمة متوقعة.',
    },
    guidance: {
      focus: 'مراجعة المصدر والدليل',
      inspect: [],
      ownerHint: owner,
      boundary: 'النتائج المتخصصة محجوبة حتى تتوفر قراءة صالحة للمصدر؛ لا يتم اختلاق تحليل بديل.',
    },
    findings: [],
    risks: [],
    opportunities: [],
    advisorBrief: {
      health: 'REVIEW_REQUIRED',
      headline: 'تحتاج طبقة الذكاء إلى مراجعة تشغيلية قبل إصدار استنتاج متخصص.',
      topFinding: null,
      topRisk: null,
      topOpportunity: null,
      recommendedAction: 'افتح المصدر والصفوف الكانونية وراجع سبب فشل القراءة قبل اعتماد أي قرار.',
      ownerHint: owner,
      expectedOutcome: 'استعادة القراءة ثم إعادة اشتقاق الإشارات والتوصيات من نفس source/job lineage.',
      measurement: 'تحقق من عودة signals/findings/recommendations من نفس المصدر بعد الإصلاح.',
      proofRequirement: 'كل نتيجة يجب أن تبقى مرتبطة بـsourceHash + jobId + evidence.',
    },
  };
}

export function fetchSmartReport(jobId: string, expectedSourceHash: string): Promise<SmartReportDetail | null>;
export function fetchSmartReport(jobId: string, expectedSourceHash: string, options?: ReportRequestOptions): Promise<SmartReportDetail | null>;
export async function fetchSmartReport(jobId: string, expectedSourceHash: string, options: ReportRequestOptions = {}): Promise<SmartReportDetail | null> {
  const normalizedJobId = jobId.trim();
  const normalizedSourceHash = expectedSourceHash.trim();
  if (!normalizedJobId) throw new Error('INVALID_REPORT_CONTEXT');
  if (normalizedSourceHash && !/^sha256:[0-9a-fA-F]{64}$/.test(normalizedSourceHash)) throw new Error('INVALID_REPORT_CONTEXT');
  const companyId = await resolveCurrentCompanyId(options.signal);
  if (!companyId) throw new Error('TENANT_REQUIRED');

  const jobQuery = supabase
    .from('report_execution_jobs')
    .select('id,source_path,source_hash,job_key,status,checkpoint,evidence,completed_at')
    .eq('company_id', companyId)
    .eq('id', normalizedJobId)
    .maybeSingle();
  const { data: job, error: jobError } = await maybeAbort(jobQuery, options.signal);

  if (jobError) throw jobError;
  if (!job || job.status !== 'completed') throw new Error('INVALID_REPORT_CONTEXT');
  const resolvedSourceHash = String(job.source_hash ?? '').trim();
  if (!/^sha256:[0-9a-fA-F]{64}$/.test(resolvedSourceHash)) throw new Error('INVALID_REPORT_CONTEXT');
  if (normalizedSourceHash && resolvedSourceHash !== normalizedSourceHash) throw new Error('INVALID_REPORT_CONTEXT');

  const runtimeWarnings: string[] = [];
  const renderedOutput = renderedOutputOf(job.evidence);
  if (!renderedOutput) {
    runtimeWarnings.push('لم تُحفظ renderedOutput لهذا التقرير؛ تم بناء العرض من المصدر الكانوني ولقطة التحليل المتاحة دون اختلاق مخرجات سابقة.');
  }
  const rendered: Record<string, unknown> = renderedOutput ?? {};
  const passportQuery = supabase
    .from('report_evidence_passports')
    .select('id,evidence_snapshot_id,verification_status,decision_readiness,acceptance_status,lineage,evidence,updated_at')
    .eq('company_id', companyId)
    .eq('report_execution_job_id', job.id)
    .eq('source_hash', job.source_hash)
    .order('updated_at', { ascending: false })
    .limit(1);
  const { data: passportRows, error: passportError } = await maybeAbort(passportQuery, options.signal);

  if (passportError) runtimeWarnings.push('تعذر قراءة Evidence Passport الحالي؛ تم خفض حالة الدليل إلى المراجعة بدل إيقاف التقرير.');

  const currentPassport = passportRows?.[0] ?? null;
  const passportStatus =
    currentPassport?.verification_status === 'VERIFIED' && currentPassport?.decision_readiness === 'READY'
      ? 'VERIFIED'
      : currentPassport?.verification_status === 'REVIEW'
        ? 'REVIEW'
        : currentPassport?.verification_status === 'BLOCKED'
          ? 'BLOCKED'
          : currentPassport
            ? 'PENDING_EVIDENCE'
            : null;

  const effectiveRendered: Record<string, unknown> = currentPassport
    ? {
        ...rendered,
        evidenceSnapshotId: currentPassport.evidence_snapshot_id == null ? null : String(currentPassport.evidence_snapshot_id),
        evidencePassportId: String(currentPassport.id),
        evidenceStatus: passportStatus,
      }
    : rendered.evidenceStatus === 'VERIFIED'
      ? {
          ...rendered,
          evidenceSnapshotId: null,
          evidencePassportId: null,
          evidenceStatus: 'AWAITING_EVIDENCE_SNAPSHOT',
        }
      : rendered;

  const stagesQuery = supabase
    .from('report_execution_tasks')
    .select('ordinal,stage,status,attempt,started_at,completed_at,last_error,evidence')
    .eq('company_id', companyId)
    .eq('report_execution_job_id', job.id)
    .order('ordinal', { ascending: true });
  const { data: stages, error: stageError } = await maybeAbort(stagesQuery, options.signal);

  if (stageError) runtimeWarnings.push('تعذر قراءة مراحل التنفيذ؛ بقي التحليل الذكي منفصلًا عن حالة المراحل.');

  // Analysis is part of the exact report job context. A source hash can be
  // shared by repeated imports, so source-hash-only analysis fallback is forbidden.
  const renderedImportId = resolveImportJobId(job as Record<string, unknown>, effectiveRendered, null);
  if (!renderedImportId) throw new Error('INVALID_REPORT_CONTEXT');

  const analysisQuery = supabase
    .from('source_analysis_snapshots')
    .select('id,import_job_id,source_hash,source_format,analysis_status,quality_score,row_count,column_count,datasets,created_at')
    .eq('company_id', companyId)
    .eq('source_hash', job.source_hash)
    .eq('import_job_id', renderedImportId)
    .order('created_at', { ascending: false })
    .limit(100);
  const { data: analyses, error: importAnalysisError } = await maybeAbort(analysisQuery, options.signal);

  let analysis = chooseBestAnalysisSnapshot((analyses ?? []) as Array<Record<string, unknown>>);
  if (importAnalysisError) {
    runtimeWarnings.push('تعذر قراءة لقطات التحليل البديلة؛ استمر التقرير اعتمادًا على المخرجات المحفوظة والصفوف الكانونية المتاحة.');
    analysis = null;
  } else if (!analysis || String(analysis.import_job_id ?? '') !== renderedImportId) {
    runtimeWarnings.push('لم تتوفر لقطة تحليل صالحة لهذا الاستيراد؛ تم إبقاء القراءة في حالة مراجعة دون إيقاف التقرير.');
    analysis = null;
  }

  if (effectiveRendered.rowCount == null && analysis?.row_count != null) effectiveRendered.rowCount = Number(analysis.row_count);
  if (effectiveRendered.qualityScore == null && analysis?.quality_score != null) effectiveRendered.qualityScore = Number(analysis.quality_score);
  if (effectiveRendered.sourceFormat == null && analysis?.source_format != null) effectiveRendered.sourceFormat = String(analysis.source_format);

  const currentPassportLineage =
    currentPassport?.lineage && typeof currentPassport.lineage === 'object'
      ? currentPassport.lineage as Record<string, unknown>
      : {};
  const canonical = currentPassportLineage.canonical && typeof currentPassportLineage.canonical === 'object'
    ? currentPassportLineage.canonical as Record<string, unknown>
    : {};
  const canonicalCommitLineageCount = Number.isFinite(Number(canonical.committedRows))
    ? Number(canonical.committedRows)
    : null;
  let canonicalCommitError: unknown = null;

  const sourceRowCount = effectiveRendered.rowCount == null ? null : Number(effectiveRendered.rowCount);

  // Smart-report intelligence must inspect the canonical source, not an arbitrary preview.
  // Supabase REST can cap a single response; page deterministically until the full source
  // is consumed (with a defensive ceiling so a pathological source cannot freeze the browser).
  const canonicalRows: Array<{ row_number: number; data: Record<string, unknown> }> = [];
  const canonicalFetchPageSize = 1000;
  const canonicalFetchLimit = 50000;
  const reportImportJobId = renderedImportId;
  if (!reportImportJobId) throw new Error('INVALID_REPORT_CONTEXT');

  // Canonical row reads remain bound to the active import job identity from the
  // durable execution checkpoint. A commit anchor can be inspected for warnings,
  // but must not silently redirect a report to a repeated/foreign import.
  let canonicalImportJobId = renderedImportId || reportImportJobId;
  let canonicalResolvedFromCommit = false;
  try {
    const latestCommitQuery = supabase
      .from('canonical_import_commits')
      .select('committed_ids')
      .eq('company_id', companyId)
      .eq('source_hash', resolvedSourceHash)
      .order('committed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: latestCommit, error: latestCommitError } = await maybeAbort(latestCommitQuery, options.signal);

    if (latestCommitError) {
      canonicalCommitError = latestCommitError;
    } else {
      const committedIds = latestCommit?.committed_ids;
      const firstCommittedId = Array.isArray(committedIds) && committedIds.length > 0
        ? String(committedIds[0] ?? '').trim()
        : '';

      if (firstCommittedId) {
        const anchorQuery = supabase
          .from('canonical_dataset_records')
          .select('import_job_id')
          .eq('company_id', companyId)
          .eq('id', firstCommittedId)
          .maybeSingle();
        const { data: anchor, error: anchorError } = await maybeAbort(anchorQuery, options.signal);
        if (anchorError) {
          canonicalCommitError = anchorError;
        } else {
          const resolved = String(anchor?.import_job_id ?? '').trim();
          if (resolved) {
            canonicalImportJobId = resolved;
            canonicalResolvedFromCommit = resolved !== reportImportJobId;
          }
        }
      }
    }
  } catch (error) {
    canonicalCommitError = error;
    console.warn('[SmartReport] canonical commit anchor lookup failed; continuing with report import id', error);
  }

  const canonicalCommitQueryFailed = Boolean(canonicalCommitError);
  if (canonicalCommitQueryFailed) {
    runtimeWarnings.push('تعذر قراءة سجل الاعتماد الكانوني؛ تم فصل فشل القراءة عن فجوة البيانات وعدم إصدار فجوة رقمية مصطنعة.');
  }

  if (canonicalResolvedFromCommit) {
    runtimeWarnings.push('تم ربط التقرير بالاستيراد الكانوني الفعلي من سجل الاعتماد لنفس بصمة المصدر؛ معرف تنفيذ التقرير مختلف عن معرف الاستيراد الكانوني.');
  }

  let canonicalCursorRowNumber = 0;
  let canonicalFetchError = false;

  while (canonicalRows.length < canonicalFetchLimit) {
    const canonicalSourceQuery = supabase
      .from('canonical_dataset_records')
      .select('row_number,data,import_job_id')
      .eq('company_id', companyId)
      .eq('source_hash', resolvedSourceHash);

    const canonicalScopedQuery = canonicalSourceQuery.eq('import_job_id', canonicalImportJobId);
    const canonicalPageQuery = canonicalScopedQuery
      .gt('row_number', canonicalCursorRowNumber)
      .order('row_number', { ascending: true })
      .limit(canonicalFetchPageSize);
    const { data: pageRows, error: pageError } = await maybeAbort(canonicalPageQuery, options.signal);

    if (pageError) {
      canonicalFetchError = true;
      runtimeWarnings.push('تعذر قراءة جزء من الصفوف الكانونية؛ تم الإبقاء على الصفوف المقروءة فقط وعدم اختلاق بقية المصدر.');
      break;
    }

    const normalizedPage = (pageRows ?? [])
      .filter((row) => row && typeof row.data === 'object' && row.data !== null)
      .map((row) => ({
        row_number: Number(row.row_number ?? 0),
        data: row.data as Record<string, unknown>,
      }))
      .filter((row) => Number.isFinite(row.row_number) && row.row_number > canonicalCursorRowNumber);

    canonicalRows.push(...normalizedPage);

    if (!normalizedPage.length || (pageRows ?? []).length < canonicalFetchPageSize) break;

    const lastRowNumber = normalizedPage[normalizedPage.length - 1]?.row_number ?? canonicalCursorRowNumber;
    if (lastRowNumber <= canonicalCursorRowNumber) {
      canonicalFetchError = true;
      runtimeWarnings.push('توقفت قراءة الصفوف الكانونية لأن مؤشر الصفحة لم يتقدم؛ تم منع الحلقة غير المنتهية دون اختلاق بيانات.');
      break;
    }
    canonicalCursorRowNumber = lastRowNumber;
  }

  const canonicalFetchCeilingReached = canonicalRows.length >= canonicalFetchLimit;
  const canonicalRowsPartial = canonicalFetchError || canonicalFetchCeilingReached;
  const canonicalRowsComplete =
    sourceRowCount == null ||
    canonicalRows.length >= sourceRowCount;
  const canonicalAnalysisScope =
    canonicalFetchError
      ? 'PARTIAL_FETCH_ERROR'
      : sourceRowCount != null && sourceRowCount > canonicalFetchLimit
        ? 'PARTIAL_FETCH_CEILING'
        : 'FULL_SOURCE';

  // The database read-back is the authoritative truth for canonical coverage.
  // Passport metadata may be stale; it must never upgrade an empty/missing canonical
  // table into a VERIFIED/READY state.
  const actualCanonicalRowCount = canonicalRows.length;
  const authoritativeCurrentRowCount = actualCanonicalRowCount;
  const exactCanonicalCommit = authoritativeCurrentRowCount == null;
  const canonicalCommitCount = exactCanonicalCommit
    ? actualCanonicalRowCount
    : authoritativeCurrentRowCount;
  const canonicalCoverageUnavailable = canonicalCommitQueryFailed || authoritativeCurrentRowCount == null;
  const canonicalCommitGap =
    canonicalCoverageUnavailable || effectiveRendered.rowCount == null
      ? null
      : Math.max(0, Number(effectiveRendered.rowCount) - actualCanonicalRowCount);
  const canonicalCommitReadBackMatches = canonicalCommitCount === authoritativeCurrentRowCount;
  const canonicalCommitVerified =
    currentPassport?.verification_status === 'VERIFIED' &&
    currentPassport?.decision_readiness === 'READY' &&
    canonicalCommitReadBackMatches &&
    canonicalCommitLineageCount != null &&
    effectiveRendered.rowCount != null &&
    actualCanonicalRowCount === Number(effectiveRendered.rowCount) &&
    canonicalCommitLineageCount === actualCanonicalRowCount &&
    !canonicalRowsPartial;

  if (canonicalCommitLineageCount != null && canonicalCommitLineageCount !== actualCanonicalRowCount) {
    runtimeWarnings.push(
      `تعارض في تغطية المصدر: Passport يثبت ${canonicalCommitLineageCount} صفًا بينما القراءة الكانونية الفعلية أعادت ${actualCanonicalRowCount} صفًا. تم خفض الاعتماد على Passport وعدم اعتبار التقرير مكتمل التغطية.`,
    );
  }

  const sourceAnalysis = analysis ? {
    id: String(analysis.id),
    importJobId: analysis.import_job_id == null ? null : String(analysis.import_job_id),
    sourceFormat: analysis.source_format == null ? null : String(analysis.source_format),
    analysisStatus: analysis.analysis_status == null ? null : String(analysis.analysis_status),
    qualityScore: analysis.quality_score == null ? null : Number(analysis.quality_score),
    rowCount: analysis.row_count == null ? null : Number(analysis.row_count),
    columnCount: analysis.column_count == null ? null : Number(analysis.column_count),
    createdAt: analysis.created_at == null ? null : String(analysis.created_at),
    datasets: Array.isArray(analysis.datasets) ? analysis.datasets : [],
  } : null;

  const evidenceStatus = resolveReportEvidenceStatus(effectiveRendered, canonicalCommitVerified);
  const specialty = resolveEffectiveSpecialty(effectiveRendered.sourceSpecialty, sourceAnalysis);
  const sourceAnalysisDatasets = Array.isArray(analysis?.datasets)
    ? analysis.datasets.filter((dataset): dataset is Record<string, unknown> => Boolean(dataset) && typeof dataset === 'object')
    : [];
  const sourceColumns = sourceColumnDescriptors(sourceAnalysis, canonicalRows, specialty);
  const specialtyCoreFields: Record<string, string[]> = {
    payments: ['date', 'balance', 'credit'],
    sales: ['date', 'invoice_number', 'customer_name', 'total'],
    purchases: ['date', 'supplier_name', 'total'],
    receivables: ['date', 'balance'],
    // Inventory reports vary by source vocabulary. Stock quantity may be
    // represented by current_stock, balance, or quantity.
    inventory: ['sku', 'product_name'],
  };
  const requiredFields = specialtyCoreFields[specialty ?? ''] ?? [];
  const mappedFields = new Set(
    sourceColumns
      .map((column) => String(column.mappedField ?? normalizeBusinessField(column.name) ?? '').trim())
      .filter(Boolean),
  );
  const missingRequiredFields = requiredFields.filter((field) => !mappedFields.has(field));
  if (specialty === 'inventory' && !['current_stock', 'quantity', 'balance'].some((field) => mappedFields.has(field))) {
    missingRequiredFields.push('current_stock');
  }

  // Optional/legacy source issues must not suppress useful intelligence when the
  // core fields are valid. Only issues on core reasoning fields can hard-block.
  const coreFieldSet = new Set((specialtyCoreFields[specialty ?? ''] ?? []).map(String));
  if (specialty === 'inventory') {
    coreFieldSet.add('quantity');
    coreFieldSet.add('balance');
  }
  const blockingReviewColumns = sourceColumns.filter((column) => {
    if (column.requiresReview !== true) return false;
    const mapped = String(column.mappedField ?? normalizeBusinessField(column.name) ?? '').trim();
    // Unknown/support columns may remain unmapped without blocking a specialized
    // result. Only a mapped core reasoning field can hard-block intelligence.
    return Boolean(mapped && coreFieldSet.has(mapped));
  });
  const blockingQualityIssueColumns = sourceColumns.filter((column) => {
    const issues = Array.isArray(column.qualityIssues) ? column.qualityIssues : [];
    if (!issues.length) return false;
    const mapped = String(column.mappedField ?? normalizeBusinessField(column.name) ?? '').trim();
    return Boolean(mapped && coreFieldSet.has(mapped));
  });

  const persistedIntelligenceCalculationsQuery = supabase
    .from('report_intelligence_calculations')
    .select('metric_id,name,formula,availability_state,value,unit,sample_size,usable_sample,confidence,limitation,evidence')
    .eq('company_id', companyId)
    .eq('report_execution_job_id', job.id)
    .eq('source_hash', resolvedSourceHash)
    .order('created_at', { ascending: false })
    .limit(300);
  const { data: persistedIntelligenceCalculations, error: persistedIntelligenceError } = await maybeAbort(persistedIntelligenceCalculationsQuery, options.signal);
  if (persistedIntelligenceError) {
    runtimeWarnings.push('تعذر قراءة حسابات Intelligence المحفوظة لهذا التقرير؛ استمر التحليل من الصفوف الكانونية دون اختلاق بديل.');
  }
  const persistedCalculationRows = (persistedIntelligenceCalculations ?? []) as Array<Record<string, unknown>>;

  const intelligenceGateReasons: string[] = [];
  if (!analysis || String(analysis.analysis_status ?? '') !== 'analyzed') intelligenceGateReasons.push('التحليل المصدرّي غير مكتمل');
  if (Number(analysis?.quality_score ?? 0) < 85) intelligenceGateReasons.push('جودة المصدر أقل من حد الاعتماد الذكي');
  if (blockingReviewColumns.length > 0) {
    intelligenceGateReasons.push('توجد مراجعة لازمة في حقول أساسية: ' + blockingReviewColumns.map((column) => String(column.name ?? column.mappedField ?? 'غير مسمى')).join('، '));
  }
  if (blockingQualityIssueColumns.length > 0) {
    intelligenceGateReasons.push('توجد مشكلة جودة في حقول أساسية: ' + blockingQualityIssueColumns.map((column) => String(column.name ?? column.mappedField ?? 'غير مسمى')).join('، '));
  }
  if (missingRequiredFields.length > 0) intelligenceGateReasons.push('حقول أساسية مفقودة: ' + missingRequiredFields.join(', '));
  if (!canonicalRowsComplete || canonicalRowsPartial) intelligenceGateReasons.push('الصفوف الكانونية غير مكتملة');
  if (canonicalCommitGap != null && canonicalCommitGap > 0) intelligenceGateReasons.push('يوجد فجوة بين الصفوف المصدرية والصفوف الكانونية');
  const intelligenceEligible = intelligenceGateReasons.length === 0;

  const nonBlockingQualityWarnings = sourceColumns
    .filter((column) => {
      const issues = Array.isArray(column.qualityIssues) ? column.qualityIssues : [];
      if (!issues.length) return false;
      const mapped = String(column.mappedField ?? normalizeBusinessField(column.name) ?? '').trim();
      return Boolean(mapped && !coreFieldSet.has(mapped));
    })
    .map((column) => String(column.name ?? column.mappedField ?? 'غير مسمى'));

  if (nonBlockingQualityWarnings.length > 0) {
    runtimeWarnings.push(
      'ملاحظات غير مانعة في حقول مساندة: ' + nonBlockingQualityWarnings.slice(0, 8).join('، '),
    );
  }

  let baseIntelligence: ReportIntelligence;
  if (!intelligenceEligible) {
    runtimeWarnings.push('تم حجب الذكاء التنفيذي لأن طبقة المصدر لم تجتز بوابة الجودة البنيوية والدلالية.');
    baseIntelligence = emptyReportIntelligence(specialty);
    baseIntelligence.advisorBrief = {
      ...baseIntelligence.advisorBrief,
      headline: 'المصدر يحتاج مراجعة قبل إصدار استنتاج تجاري.',
      recommendedAction: 'راجع بنية الحقول والقيم المستخرجة ثم أعد التحليل من نفس التقرير.',
      proofRequirement: intelligenceGateReasons.join(' • '),
    };
  } else try {
    baseIntelligence = deriveReportIntelligence({
      specialty,
      rowCount: effectiveRendered.rowCount == null ? null : Number(effectiveRendered.rowCount),
      sourceAnalysis,
      renderedOutput: effectiveRendered,
      canonicalRows,
      persistedIntelligenceCalculations: persistedCalculationRows,
    });

    // Keep source-agnostic intelligence alive after canonical import. Generic
    // files must not lose their content-derived signals when moving from /try-report
    // into the persisted Smart Report route.
    if (!specialty) {
      const genericDataset = buildGenericDatasetForReport({
        sourcePath: String(job.source_path ?? 'مصدر غير مسمى'),
        sourceAnalysis: sourceAnalysis as SmartReportDetail['sourceAnalysis'],
        canonicalRows,
        qualityScore: effectiveRendered.qualityScore == null ? null : Number(effectiveRendered.qualityScore),
      });
      if (genericDataset) {
        baseIntelligence = buildGenericFileIntelligence(
          genericDataset,
          String(sourceAnalysis?.sourceFormat ?? 'generic'),
        );
      }
    }
  } catch (error) {
    runtimeWarnings.push('تعذر اشتقاق طبقة الذكاء من هذا المصدر؛ تم إظهار حالة مراجعة بدل تجميد التقرير.');
    console.error('[SmartReport] deriveReportIntelligence failed', error);
    baseIntelligence = emptyReportIntelligence(specialty);
  }

  const catalogItem = mapCatalogItem(
    job as Record<string, unknown>,
    sourceAnalysis,
  );
  if (!catalogItem) throw new Error('SMART_REPORT_CATALOG_ITEM_UNAVAILABLE');

  const availableFields = [...new Set(sourceColumnDescriptors(sourceAnalysis, canonicalRows).flatMap((column) => {
    const mapped = String(column.mappedField ?? normalizeBusinessField(column.name) ?? '').trim();
    const name = String(column.name ?? '').trim();
    return [mapped, name].filter(Boolean);
  }))] as Parameters<typeof detectReportArchetype>[0]['availableFields'];

  const detectedArchetype = detectReportArchetype({
    sourcePath: String(job.source_path ?? ''),
    specialty,
    availableFields,
  });

  let intelligence: ReportIntelligence = baseIntelligence;
  let archetypeState = detectedArchetype.state;

  if (!intelligenceEligible) {
    archetypeState = 'REVIEW_REQUIRED';
    intelligence = emptyReportIntelligence(specialty);
  } else if (detectedArchetype.profile) {
    try {
      const archetypeRun = runReportArchetype({
        intelligence: baseIntelligence,
        provenance: {
          tenantId: companyId,
          sourceHash: String(job.source_hash ?? ''),
          reportExecutionJobId: String(job.id),
          evidenceSnapshotId: typeof effectiveRendered.evidenceSnapshotId === 'string' ? effectiveRendered.evidenceSnapshotId : null,
          evidencePassportId: typeof effectiveRendered.evidencePassportId === 'string' ? effectiveRendered.evidencePassportId : null,
          sourceVersionId: typeof effectiveRendered.sourceVersionId === 'string' ? effectiveRendered.sourceVersionId : null,
        },
        availableFields,
        sampleSize: effectiveRendered.rowCount == null ? 0 : Number(effectiveRendered.rowCount),
        archetypeId: detectedArchetype.profile.id,
        profileVersion: detectedArchetype.profile.version,
        report: {
          specialty,
          rowCount: effectiveRendered.rowCount == null ? null : Number(effectiveRendered.rowCount),
          sourceAnalysis,
          renderedOutput: effectiveRendered,
          canonicalRows,
          persistedIntelligenceCalculations: persistedCalculationRows,
        },
      });

      archetypeState = archetypeRun.state;
      intelligence = {
        ...archetypeRun.intelligence,
        advisorBrief: archetypeRun.state === 'SUPPORTED'
          ? archetypeRun.intelligence.advisorBrief
          : {
              ...archetypeRun.intelligence.advisorBrief,
              headline: 'النموذج لم يجتز بوابة التشغيل: ' + archetypeRun.state + ' — تم إبقاء الذكاء المصدرّي المتاح، لكن القرار التنفيذي محجوب حتى يكتمل النموذج المتخصص.',
              proofRequirement: 'حالة النموذج: ' + archetypeRun.state + '؛ لا يُحوَّل الناتج إلى قرار معتمد قبل اكتمال الحقول/الدليل المطلوب.',
            },
      };
    } catch (error) {
      runtimeWarnings.push('تعذر تشغيل النموذج المتخصص لهذا المصدر؛ تم الإبقاء على الذكاء المصدرّي المتاح وحالة المراجعة.');
      console.error('[SmartReport] runReportArchetype failed', error);
      archetypeState = 'REVIEW_REQUIRED';
      intelligence = {
        ...baseIntelligence,
        advisorBrief: {
          ...baseIntelligence.advisorBrief,
          headline: 'تعذر تشغيل النموذج المتخصص؛ تم الإبقاء على الذكاء المصدرّي المتاح دون اختلاق نتيجة.',
        },
      };
    }
  } else {
    // A specialty-level generic recommendation is not an archetype proof.
    // Keep source-quality understanding available, but block recommendation/decision output.
    intelligence = {
      ...baseIntelligence,
      advisorBrief: {
        ...baseIntelligence.advisorBrief,
        headline: 'لا يوجد نموذج مصدرّي مثبت لهذا التقرير: ' + detectedArchetype.state + ' — تم إبقاء الذكاء المصدرّي المتاح دون اختلاق نموذج متخصص.',
      },
    };
  }

  const runtimeSignalStatus = intelligence.signals.length
    ? 'SIGNALS_PRESENT'
    : 'NO_EXCEPTIONAL_SIGNALS';
  const runtimeIntelligenceStatus =
    archetypeState === 'BLOCKED'
      ? 'BLOCKED'
      : archetypeState === 'INSUFFICIENT_SAMPLE'
        ? 'INSUFFICIENT_SAMPLE'
        : archetypeState === 'SUPPORTED' && evidenceStatus === 'VERIFIED'
          ? 'READY'
          : 'REVIEW_REQUIRED';
  const runtimeTrustState = typeof effectiveRendered.trustState === 'string'
    ? effectiveRendered.trustState
    : effectiveRendered.evidenceStatus === 'VERIFIED' || effectiveRendered.evidenceVerificationStatus === 'VERIFIED'
      ? 'TRUSTED'
      : null;

  const runtimeRendered = {
    ...effectiveRendered,
    // Persisted renderedOutput may carry a stale specialty from the original
    // execution. The runtime source analysis is authoritative for classification.
    sourceSpecialty: specialty ?? effectiveRendered.sourceSpecialty ?? null,
    trustState: runtimeTrustState,
    sourceTrustState: runtimeTrustState,
    archetypeId: detectedArchetype.profile?.id ?? null,
    archetypeVersion: detectedArchetype.profile?.version ?? null,
    profileVersion: detectedArchetype.profile?.version ?? null,
    archetypeState,
    archetypeReason: detectedArchetype.reason,
    signalStatus: runtimeSignalStatus,
    intelligenceStatus: runtimeIntelligenceStatus,
  };

  return {
    ...catalogItem,
    archetypeState,
    archetypeId: detectedArchetype.profile?.id ?? null,
    archetypeVersion: detectedArchetype.profile?.version ?? null,
    jobId: String(job.id),
    tenantId: companyId,
    sourcePath: String(job.source_path ?? 'مصدر غير مسمى'),
    sourceHash: String(job.source_hash ?? ''),
    entityType: entityTypeFrom(String(job.job_key ?? '')),
    rowCount: effectiveRendered.rowCount == null ? null : Number(effectiveRendered.rowCount),
    qualityScore: effectiveRendered.qualityScore == null ? null : Number(effectiveRendered.qualityScore),
    trustState: runtimeTrustState,
    specialty,
    canonicalRows,
    intelligence,
    evidenceStatus,
    completedAt: job.completed_at == null ? null : String(job.completed_at),
    importId: effectiveRendered.importId == null ? null : String(effectiveRendered.importId),
    checkpointStage: job.checkpoint?.stage == null ? null : String(job.checkpoint.stage),
    renderedOutput: runtimeRendered,
    sourceAnalysis,
    authoritativeCurrentRowCount,
    canonicalCommitGap,
    canonicalCommitCount,
    canonicalCommitVerified,
    canonicalAnalysisScope,
    sourceTrustState: runtimeTrustState,
    reportVerificationState: canonicalCommitQueryFailed || !canonicalRowsComplete || canonicalRowsPartial
      ? 'PARTIAL_ANALYSIS'
      : canonicalCommitGap != null && canonicalCommitGap > 0
        ? 'GAP_DETECTED'
: evidenceStatus === 'VERIFIED'
          ? 'VERIFIED'
          : 'PENDING_EVIDENCE',
    runtimeWarnings,
    stages: (stages ?? []).map((row) => ({
      ordinal: Number(row.ordinal),
      stage: String(row.stage),
      status: String(row.status),
      attempt: Number(row.attempt ?? 0),
      startedAt: row.started_at == null ? null : String(row.started_at),
      completedAt: row.completed_at == null ? null : String(row.completed_at),
      lastError: row.last_error && typeof row.last_error === 'object' ? row.last_error as Record<string, unknown> : {},
      evidence: row.evidence && typeof row.evidence === 'object' ? row.evidence as Record<string, unknown> : {},
    })),
  };
}
