// Ported from Report-Advisor api/canonical-import-execute.ts (Vercel handler) to a Fetch-style handler.
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Dataset } from '@/lib/file-engine/types';
import type { CanonicalImportEntityType } from '@/lib/import/canonical-truth-boundary';
import { runCanonicalImportThroughDurableRunner, type DurableCanonicalImportInput } from '@/lib/import/canonical-production-adapter';
import { parseFile } from '@/lib/file-engine/adapters';
import { detectFormat } from '@/lib/file-engine/detector';
import { securityScan } from '@/lib/file-engine/security';
import { computeSHA256 } from '@/lib/file-engine/file-identity-core';
import { reconcileForCanonical } from '@/lib/import/canonical-truth-boundary';
function reportEntityTypeFromJobKey(jobKey: string): CanonicalImportEntityType {
  const parts = jobKey.split(':');
  if (parts[0] !== 'canonical-import') throw new Error('REPORT_EXECUTION_JOB_KEY_INVALID');
  if (parts[1] === 'generic' && parts[2] && /^generic:[a-z][a-z0-9_-]{0,63}$/.test('generic:' + parts[2])) return 'generic:' + parts[2] as `generic:${string}`;
  if (parts[1] === 'products' || parts[1] === 'customers' || parts[1] === 'sales_invoices') return parts[1];
  throw new Error('REPORT_EXECUTION_ENTITY_TYPE_MISSING');
}

function datasetForAnalysis(dataset: Dataset): Record<string, unknown> {
  return {
    id: dataset.id,
    name: dataset.name,
    source: dataset.source,
    sheet: dataset.sheet ?? null,
    rowCount: dataset.rowCount,
    columnCount: dataset.columnCount,
    columns: dataset.columns,
    preview: Array.isArray(dataset.preview) ? dataset.preview.slice(0, 100) : [],
    qualityScore: dataset.qualityScore,
  };
}

async function authoritativeSourceInput(args: {
  workerClient: SupabaseClient;
  dataClient: SupabaseClient;
  companyId: string;
  importId: string;
  reportExecutionJobId?: string;
  requestedBy: string;
  expectedSourceHash: string;
  fileName: string;
  entityType: string;
  qualityApproved?: boolean;
}): Promise<DurableCanonicalImportInput> {
  const { workerClient, dataClient, companyId, importId, reportExecutionJobId, requestedBy, expectedSourceHash, fileName, entityType } = args;

  const { data: importJob, error: importError } = await dataClient
    .from('import_jobs')
    .select('id,company_id,file_record_id,status,file_name,total_rows')
    .eq('id', importId)
    .eq('company_id', companyId)
    .single();
  if (importError || !importJob?.file_record_id) throw new Error('AUTHORITATIVE_SOURCE_IMPORT_JOB_OR_FILE_RECORD_MISSING');

  const { data: fileRecord, error: fileError } = await dataClient
    .from('file_records')
    .select('id,company_id,file_name,file_size,file_mime,file_hash,detected_format,security_status,status,metadata')
    .eq('id', importJob.file_record_id)
    .eq('company_id', companyId)
    .single();
  if (fileError || !fileRecord) throw new Error('AUTHORITATIVE_SOURCE_FILE_RECORD_MISSING');
  if (fileRecord.company_id !== companyId) throw new Error('AUTHORITATIVE_SOURCE_TENANT_MISMATCH');
  if (fileRecord.file_name !== fileName || importJob.file_name !== fileName) throw new Error('AUTHORITATIVE_SOURCE_NAME_MISMATCH');

  const metadata = fileRecord.metadata && typeof fileRecord.metadata === 'object'
    ? fileRecord.metadata as Record<string, unknown>
    : {};
  const storageBucket = typeof metadata.storage_bucket === 'string' ? metadata.storage_bucket.trim() : 'documents';
  const storagePath = typeof metadata.storage_path === 'string' ? metadata.storage_path.trim() : '';
  const expectedPrefix = companyId + '/';
  if (!storagePath || !storagePath.startsWith(expectedPrefix) || storagePath.includes('..')) {
    throw new Error('AUTHORITATIVE_SOURCE_STORAGE_PATH_INVALID');
  }

  const { data: blob, error: downloadError } = await workerClient.storage.from(storageBucket).download(storagePath);
  if (downloadError || !blob) throw new Error('AUTHORITATIVE_SOURCE_DOWNLOAD_FAILED:' + (downloadError?.message ?? 'empty_blob'));

  const buffer = await blob.arrayBuffer();
  if (buffer.byteLength < 1) throw new Error('AUTHORITATIVE_SOURCE_EMPTY');
  if (buffer.byteLength > 100 * 1024 * 1024) throw new Error('AUTHORITATIVE_SOURCE_TOO_LARGE');

  const sourceHash = 'sha256:' + await computeSHA256(buffer);
  if (expectedSourceHash && expectedSourceHash !== sourceHash) throw new Error('AUTHORITATIVE_SOURCE_HASH_MISMATCH');

  const fileLike = new File([buffer], fileName, {
    type: typeof fileRecord.file_mime === 'string' ? fileRecord.file_mime : '',
  });
  const security = securityScan(fileLike, buffer);
  if (!security.passed) throw new Error('AUTHORITATIVE_SOURCE_SECURITY_REJECTED:' + security.issues.join('|').slice(0, 512));

  const detection = detectFormat(fileLike, buffer);
  if (detection.format === 'unknown') throw new Error('AUTHORITATIVE_SOURCE_FORMAT_UNKNOWN');

  const datasets = await parseFile(buffer, fileName, detection.format);
  const dataset = datasets[0];
  if (!dataset || dataset.rowCount <= 0) throw new Error('AUTHORITATIVE_SOURCE_EXTRACTION_EMPTY');

  const qualityScore = Math.max(0, Math.min(100, Math.round(dataset.qualityScore)));
  if (qualityScore < 50) throw new Error('AUTHORITATIVE_SOURCE_QUALITY_REJECTED');

  const reconciled = reconcileForCanonical(
    entityType as CanonicalImportEntityType,
    companyId,
    fileName,
    sourceHash,
    importId,
    (data, rowNumber) => sourceHash + ':' + rowNumber + ':' + JSON.stringify(data),
    dataset.rows.map((data, index) => ({ rowNumber: index + 1, data })),
  );
  if (!reconciled.rows.length) throw new Error('AUTHORITATIVE_SOURCE_NO_RECONCILED_ROWS');
  if (reconciled.rejected.length) throw new Error('AUTHORITATIVE_SOURCE_RECONCILIATION_REJECTED:' + reconciled.rejected.length);

  const analysisPayload = {
    company_id: companyId,
    import_job_id: importId,
    source_hash: sourceHash,
    source_path: fileName,
    source_format: detection.format,
    analysis_status: 'analyzed',
    entity_type: entityType,
    quality_score: qualityScore,
    row_count: dataset.rowCount,
    column_count: dataset.columnCount,
    datasets: [datasetForAnalysis(dataset)],
    canonical_text: dataset.columns.map((c) => c.name).join(' | '),
    visual_assets: [],
    warnings: dataset.columns.flatMap((column) => Array.isArray(column.qualityIssues) ? column.qualityIssues : []),
    metadata: {
      authoritativeServerRead: true,
      reportExecutionJobId: reportExecutionJobId || null,
      sourceStorageBucket: storageBucket,
      sourceStoragePath: storagePath,
      requestedBy,
    },
  };
  const { data: existingAnalysis, error: existingAnalysisError } = await workerClient
    .from('source_analysis_snapshots')
    .select('id')
    .eq('company_id', companyId)
    .eq('import_job_id', importId)
    .eq('source_hash', sourceHash)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingAnalysisError) throw new Error('AUTHORITATIVE_SOURCE_ANALYSIS_LOOKUP_FAILED:' + existingAnalysisError.message);

  const analysisWrite = existingAnalysis?.id
    ? await workerClient.from('source_analysis_snapshots').update(analysisPayload).eq('id', existingAnalysis.id).eq('company_id', companyId)
    : await workerClient.from('source_analysis_snapshots').insert(analysisPayload);
  if (analysisWrite.error) throw new Error('AUTHORITATIVE_SOURCE_ANALYSIS_PERSIST_FAILED:' + analysisWrite.error.message);

  const { error: fileUpdateError } = await workerClient
    .from('file_records')
    .update({
      file_hash: sourceHash,
      magic_bytes: detection.magicBytes,
      detected_format: detection.format,
      security_status: 'passed',
      status: 'ready',
      metadata: { ...metadata, raw_bytes_sha256: sourceHash },
    })
    .eq('id', fileRecord.id)
    .eq('company_id', companyId);
  if (fileUpdateError) throw new Error('AUTHORITATIVE_SOURCE_FILE_RECORD_UPDATE_FAILED:' + fileUpdateError.message);

  const { error: identityError } = await workerClient.from('import_jobs')
    .update({ source_fingerprint: sourceHash, job_type: entityType })
    .eq('id', importId).eq('company_id', companyId);
  if (identityError) throw new Error('AUTHORITATIVE_SOURCE_IDENTITY_UPDATE_FAILED:' + identityError.message);

  return {
    importId,
    fileName,
    sourceHash,
    entityType: entityType as CanonicalImportEntityType,
    rows: reconciled.rows,
    qualityScore,
    qualityApproved: args.qualityApproved ?? qualityScore >= 75,
  };
}
function validateInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_json');
  return value as Record<string, unknown>;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

function executionErrorMessage(error: unknown): string {
  if (error instanceof AggregateError) return error.errors.map(executionErrorMessage).join(' | ');
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return String(error);
}

export async function handleCanonicalImportExecute(req: Request): Promise<Response> {
  const SUPABASE_URL = process.env.SUPABASE_URL?.trim();
  const PUBLISHABLE = (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY)?.trim();
  if (!SUPABASE_URL || !PUBLISHABLE) return json(500, { status: 'failed', error: 'server_config_missing' });
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';

  if (!token) {
    return json(401, { status: 'failed', error: 'authenticated_user_token_required' });
  }

  try {
    const dataClient = createClient(SUPABASE_URL, PUBLISHABLE, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData } = await dataClient.auth.getUser(token);
    const user = userData?.user ? { id: userData.user.id } : null;
    if (!user) {
      return json(401, { status: 'failed', error: 'invalid_or_expired_user_token' });
    }

    const { data: companyValue } = await dataClient.rpc('current_company_id');
    const companyId = typeof companyValue === 'string' && companyValue ? companyValue : null;
    if (!companyId) {
      return json(403, { status: 'failed', error: 'authenticated_tenant_context_missing' });
    }

    const body = validateInput(await req.json().catch(() => null));
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const workerClient = supabaseAdmin as unknown as SupabaseClient;

    const resumeReportExecutionJobId = typeof body.resumeReportExecutionJobId === 'string'
      ? body.resumeReportExecutionJobId.trim()
      : '';

    if (resumeReportExecutionJobId) {
      const { data: reportJob, error: reportJobError } = await dataClient
        .from('report_execution_jobs')
        .select('id,company_id,source_path,source_hash,job_key,status,checkpoint')
        .eq('id', resumeReportExecutionJobId)
        .eq('company_id', companyId)
        .single();
      if (reportJobError || !reportJob) {
        return json(404, { status: 'failed', error: 'report_execution_job_not_found_or_forbidden' });
      }
      const entityType = reportEntityTypeFromJobKey(String(reportJob.job_key ?? ''));
      const checkpoint = reportJob.checkpoint && typeof reportJob.checkpoint === 'object'
        ? reportJob.checkpoint as Record<string, unknown>
        : {};
      const evidenceKeys = Array.isArray(checkpoint.evidenceKeys) ? checkpoint.evidenceKeys.map(String) : [];
      const importId = typeof body.importId === 'string' && body.importId.trim()
        ? body.importId.trim()
        : (evidenceKeys.find((key) => key.startsWith('import:'))?.slice(7) ?? '');
      let input: DurableCanonicalImportInput;
      try {
        input = await authoritativeSourceInput({
          workerClient,
          dataClient,
          companyId,
          importId,
          reportExecutionJobId: reportJob.id,
          requestedBy: user.id,
          expectedSourceHash: String(reportJob.source_hash ?? checkpoint.sourceHash ?? ''),
          fileName: String(reportJob.source_path ?? ''),
          entityType,
          qualityApproved: body.qualityApproved === true,
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`CANONICAL_IMPORT_SOURCE_AUTHORITY_FAILED:${entityType}:${detail}`);
      }
      try {
        const result = await runCanonicalImportThroughDurableRunner(input, {
          serverExecution: true,
          workerClient,
          dataClient,
          companyId,
          requestedBy: user.id,
        });
        return json(200, result);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`CANONICAL_IMPORT_DURABLE_RUN_FAILED:${entityType}:${detail}`);
      }
    }

    const rawEntityType = body.entityType;
    const genericEntity = typeof rawEntityType === 'string' && /^generic:[a-z][a-z0-9_-]{0,63}$/.test(rawEntityType);
    if (rawEntityType !== 'products' && rawEntityType !== 'customers' && rawEntityType !== 'sales_invoices' && !genericEntity) throw new Error('entity_type_invalid');
     if (typeof body.importId !== 'string' || !body.importId.trim()) throw new Error('import_id_invalid');
    if (typeof body.fileName !== 'string' || !body.fileName.trim() || body.fileName.length > 512) throw new Error('file_name_invalid');
    if (typeof body.sourceHash !== 'string' || !/^sha256:[0-9a-fA-F]{64}$/.test(body.sourceHash)) throw new Error('source_hash_invalid');
    const mode = body.mode === 'finalize-source' ? 'finalize-source' : 'execute';
    if (mode === 'execute') {
      if (!Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > 500000) throw new Error('rows_invalid');
      if (typeof body.qualityScore !== 'number' || !Number.isFinite(body.qualityScore) || body.qualityScore < 0 || body.qualityScore > 100) throw new Error('quality_score_invalid');
    }

    const { data: importJob, error: importJobError } = await dataClient
      .from('import_jobs')
      .select('id, company_id, status, file_name, entity_type')
      .eq('id', body.importId)
      .eq('company_id', companyId)
      .single();
    if (importJobError || !importJob) {
      return json(404, { status: 'failed', error: 'import_job_not_found_or_forbidden' });
    }
    if (importJob.file_name !== body.fileName || importJob.entity_type !== body.entityType) {
      return json(409, { status: 'failed', error: 'import_job_source_identity_mismatch' });
    }
    if (['completed', 'partial', 'failed', 'cancelled'].includes(importJob.status)) {
      return json(409, { status: 'failed', error: 'import_job_already_terminal' });
    }

    const serverSourceAuthority = body.serverSourceAuthority === true || mode === 'finalize-source';
    if (mode === 'finalize-source') {
      const input = await authoritativeSourceInput({
        workerClient,
        dataClient,
        companyId,
        importId: String(body.importId),
        reportExecutionJobId: '',
        requestedBy: user.id,
        expectedSourceHash: String(body.sourceHash),
        fileName: String(body.fileName),
        entityType: String(body.entityType),
        qualityApproved: body.qualityApproved === true,
      });
      return json(200, { importId: input.importId, sourceHash: input.sourceHash });
    }
    const input = serverSourceAuthority
      ? await authoritativeSourceInput({
          workerClient,
          dataClient,
          companyId,
          importId: String(body.importId),
          reportExecutionJobId: '',
          requestedBy: user.id,
          expectedSourceHash: String(body.sourceHash),
          fileName: String(body.fileName),
          entityType: String(body.entityType),
          qualityApproved: body.qualityApproved === true,
        })
      : body as unknown as DurableCanonicalImportInput;

    const result = await runCanonicalImportThroughDurableRunner(input, {
      serverExecution: true,
      workerClient: dataClient,
      dataClient,
      companyId,
      requestedBy: user.id,
    });

    return json(200, result);
  } catch (error) {
    const message = executionErrorMessage(error);
    const status =
      /required|invalid|tenant|hash|rows|quality|business|duplicate|already_completed|already_running|not_retryable/i.test(message) ? 400 : 502;
    return json(status, { status: 'failed', error: message.slice(0, 512) });
  }
}
