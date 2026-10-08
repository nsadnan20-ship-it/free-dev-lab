import type { SupabaseClient } from '@supabase/supabase-js';
import type { SecurityScanResult } from './types.ts';
import { MAX_FILE_SIZE } from './types.ts';
import { computeSHA256 } from './file-identity-core.ts';
export { computeSHA256 } from './file-identity-core.ts';

interface FileRecord {
  id: string;
  company_id: string;
  file_name: string;
  file_hash: string;
  created_at: string;
  status: string;
  smart_report_job_id?: string | null;
  smart_report_source_path?: string | null;
  smart_report_ready?: boolean;
}

function isUnsafeArchivePath(name: string): boolean {
  const normalized = name.replaceAll('\\', '/');
  return normalized.includes('\0')
    || normalized.startsWith('/')
    || /^[A-Za-z]:\//.test(normalized)
    || normalized.split('/').some(segment => segment === '..');
}

function hasZipEntryTraversal(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const minEocd = 22;
  const maxComment = 0xffff;
  const start = Math.max(0, bytes.length - minEocd - maxComment);
  let eocd = -1;
  for (let i = bytes.length - minEocd; i >= start; i -= 1) {
    if (i >= 0 && view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return false;

  const entryCount = view.getUint16(eocd + 10, true);
  const centralDirectorySize = view.getUint32(eocd + 12, true);
  const centralDirectoryOffset = view.getUint32(eocd + 16, true);
  if (centralDirectoryOffset + centralDirectorySize > bytes.length) return true;

  let offset = centralDirectoryOffset;
  for (let i = 0; i < entryCount; i += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) return true;
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > bytes.length) return true;
    const nameBytes = bytes.slice(offset + 46, offset + 46 + nameLength);
    const name = new TextDecoder().decode(nameBytes);
    if (isUnsafeArchivePath(name)) return true;
    offset = end;
  }
  return false;
}

export function securityScan(file: File, buffer: ArrayBuffer): SecurityScanResult {
  const issues: string[] = []; let isArchiveBomb = false; let isZipTraversal = false;
  if (file.size > MAX_FILE_SIZE) issues.push(`حجم الملف (${(file.size / 1024 / 1024).toFixed(1)} ميجابايت) يتجاوز الحد الأقصى المسموح (${MAX_FILE_SIZE / 1024 / 1024} ميجابايت)`);
  const bytes = new Uint8Array(buffer); const isZip = bytes[0] === 0x50 && bytes[1] === 0x4B;
  if (isZip) {
    if (file.size < 100 && file.name.match(/\.(zip|jar|apk)$/i)) { isArchiveBomb = true; issues.push('تحذير: قد يكون الملف قنبلة مضغوطة (حجم صغير جداً لملف مضغوط)'); }
    const decompressedEstimate = file.size * 100; if (decompressedEstimate > 500 * 1024 * 1024) issues.push(`تحذير: قد يستهلك الملف بعد فك الضغط مساحة كبيرة (~${(decompressedEstimate / 1024 / 1024).toFixed(0)} ميجابايت)`);
    if (isUnsafeArchivePath(file.name) || hasZipEntryTraversal(buffer)) { isZipTraversal = true; issues.push('تحذير: اسم الملف أو أحد إدخالات الأرشيف يحتوي على مسار غير آمن (path traversal)'); }
  }
  if (file.size === 0) issues.push('الملف فارغ');
  return { passed: issues.length === 0, issues, maxFileSize: MAX_FILE_SIZE, actualSize: file.size, isArchiveBomb, isZipTraversal };
}

export async function checkDuplicate(hash: string, _legacyCompanyId?: string, _legacySupabase?: SupabaseClient): Promise<{ isDuplicate: boolean; existing: FileRecord | null }> {
  const { resolveCurrentCompanyId, supabase } = await import('../supabase.ts');
  const companyId = await resolveCurrentCompanyId();
  if (!companyId) throw new Error('TENANT_CONTEXT_REQUIRED');

  const normalizedHash = hash.trim().toLowerCase().replace(/^sha256:/, '');
  if (!/^[0-9a-f]{64}$/.test(normalizedHash)) throw new Error('IMPORT_SOURCE_HASH_INVALID');
  const canonicalHash = `sha256:${normalizedHash}`;

  // Canonical import identity is authoritative at the successful server transaction.
  // Check it before the legacy file_records surface so a committed source can never be
  // treated as a new import merely because no auxiliary file record exists.
  const { data: canonicalCommit, error: canonicalError } = await supabase
    .from('canonical_import_commits')
    .select('id,company_id,source_hash,committed_at')
    .eq('company_id', companyId)
    .eq('source_hash', canonicalHash)
    .order('committed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (canonicalError) throw canonicalError;
  if (canonicalCommit) {
    const { data: existingSmartJob, error: smartJobError } = await supabase
      .from('report_execution_jobs')
      .select('id,source_path,evidence,status,completed_at')
      .eq('company_id', companyId)
      .eq('source_hash', canonicalHash)
      .eq('status', 'completed')
      .not('evidence->renderedOutput', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (smartJobError) throw smartJobError;
    const evidence = existingSmartJob?.evidence && typeof existingSmartJob.evidence === 'object'
      ? existingSmartJob.evidence as Record<string, unknown>
      : null;
    return {
      isDuplicate: true,
      existing: {
        id: String(canonicalCommit.id),
        company_id: String(canonicalCommit.company_id),
        file_name: String(existingSmartJob?.source_path ?? ''),
        file_hash: canonicalHash,
        created_at: String(canonicalCommit.committed_at),
        status: 'committed',
        smart_report_job_id: existingSmartJob ? String(existingSmartJob.id) : null,
        smart_report_source_path: existingSmartJob ? String(existingSmartJob.source_path ?? '') : null,
        smart_report_ready: Boolean((evidence?.renderedOutput as unknown) && typeof evidence?.renderedOutput === 'object'),
      },
    };
  }

  // A duplicate should reopen the already persisted Smart Report when one exists.
  // This keeps "duplicate protection" from becoming a dead-end UX.
  const { data: existingSmartJob, error: smartJobError } = await supabase
    .from('report_execution_jobs')
    .select('id,source_path,evidence,status,completed_at')
    .eq('company_id', companyId)
    .eq('source_hash', canonicalHash)
    .eq('status', 'completed')
    .not('evidence->renderedOutput', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (smartJobError) throw smartJobError;
  if (existingSmartJob) {
    const evidence = existingSmartJob.evidence && typeof existingSmartJob.evidence === 'object'
      ? existingSmartJob.evidence as Record<string, unknown>
      : null;
    return {
      isDuplicate: true,
      existing: {
        id: String(existingSmartJob.id),
        company_id: companyId,
        file_name: String(existingSmartJob.source_path ?? ''),
        file_hash: canonicalHash,
        created_at: String(existingSmartJob.completed_at ?? new Date().toISOString()),
        status: 'committed',
        smart_report_job_id: String(existingSmartJob.id),
        smart_report_source_path: String(existingSmartJob.source_path ?? ''),
        smart_report_ready: Boolean((evidence?.renderedOutput as unknown) && typeof evidence?.renderedOutput === 'object'),
      },
    };
  }

  // Preserve compatibility with historical file metadata that predates the canonical
  // commit ledger. This is fallback evidence only; canonical commits remain authoritative.
  const { data: fileRecord, error: fileError } = await supabase
    .from('file_records')
    .select('id,company_id,file_name,file_hash,created_at,status')
    .eq('company_id', companyId)
    .eq('file_hash', hash)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fileError) throw fileError;
  if (fileRecord) return { isDuplicate: true, existing: fileRecord as FileRecord };

  return { isDuplicate: false, existing: null };
}
