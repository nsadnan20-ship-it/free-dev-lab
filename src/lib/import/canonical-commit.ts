import type { SupabaseClient } from '@supabase/supabase-js';
import { assertCanonicalBoundary, type CanonicalImportEntityType, type ReconciledCanonicalImportRow } from './canonical-truth-boundary.ts';

export type CanonicalImportRow = Pick<ReconciledCanonicalImportRow, 'data' | 'rowNumber' | 'provenance'>;
export interface CanonicalCommitResult { committed: number; ids: string[]; idempotentReplay: boolean }

function text(value: unknown): string | null {
  if (value == null) return null;
  const v = String(value).trim();
  return v || null;
}

function requiredNumber(value: unknown, field: string, rowNumber: number): number {
  if (value == null || value === '') throw new Error(`${field} is required for import row ${rowNumber}`);
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${field} must be a finite number for import row ${rowNumber}`);
  return n;
}

function requiredText(value: unknown, field: string, rowNumber: number): string {
  const v = text(value);
  if (!v) throw new Error(`${field} is required for import row ${rowNumber}`);
  return v;
}

function requiredBoolean(value: unknown, field: string, rowNumber: number): boolean {
  if (value == null || value === '') throw new Error(`${field} is required for import row ${rowNumber}`);
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'نعم', 'نشط'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'لا', 'غير نشط'].includes(normalized)) return false;
  throw new Error(`${field} must be a boolean for import row ${rowNumber}`);
}

function canonicalizeRow(entityType: CanonicalImportEntityType, row: CanonicalImportRow): Record<string, unknown> {
  if (entityType.startsWith('generic:')) {
    if (!/^generic:[a-z][a-z0-9_-]{0,63}$/.test(entityType)) throw new Error('IMPORT_GENERIC_DOMAIN_INVALID');
    return {
      row_number: row.rowNumber,
      record_key: `source-row:${row.rowNumber}`,
      data: row.data,
      provenance: row.provenance,
    };
  }
  const d = row.data;
  if (entityType === 'products') {
    return {
      sku: requiredText(d.sku, 'sku', row.rowNumber),
      name: requiredText(d.name, 'name', row.rowNumber),
      unit: requiredText(d.unit, 'unit', row.rowNumber),
      cost_price: requiredNumber(d.cost_price, 'cost_price', row.rowNumber),
      selling_price: requiredNumber(d.selling_price, 'selling_price', row.rowNumber),
      min_stock: requiredNumber(d.min_stock, 'min_stock', row.rowNumber),
      reorder_point: requiredNumber(d.reorder_point, 'reorder_point', row.rowNumber),
      is_active: requiredBoolean(d.is_active, 'is_active', row.rowNumber),
    };
  }
  if (entityType === 'customers') {
    return {
      name: requiredText(d.name, 'name', row.rowNumber),
      code: text(d.code),
      phone: text(d.phone),
      email: text(d.email),
      segment: requiredText(d.segment, 'segment', row.rowNumber),
      credit_limit: requiredNumber(d.credit_limit, 'credit_limit', row.rowNumber),
      payment_terms_days: Math.trunc(requiredNumber(d.payment_terms_days, 'payment_terms_days', row.rowNumber)),
    };
  }
  return {
    invoice_number: requiredText(d.invoice_number, 'invoice_number', row.rowNumber),
    invoice_date: requiredText(d.invoice_date, 'invoice_date', row.rowNumber),
    customer_id: text(d.customer_id),
    customer_name: text(d.customer_name),
    subtotal: requiredNumber(d.subtotal, 'subtotal', row.rowNumber),
    tax_amount: requiredNumber(d.tax_amount, 'tax_amount', row.rowNumber),
    total: requiredNumber(d.total, 'total', row.rowNumber),
    paid_amount: requiredNumber(d.paid_amount, 'paid_amount', row.rowNumber),
    status: requiredText(d.status, 'status', row.rowNumber),
  };
}

export async function commitImportBatch(
  entityType: CanonicalImportEntityType,
  rows: ReconciledCanonicalImportRow[],
  sourceHash: string,
  context: { client?: SupabaseClient; companyId?: string; importJobId?: string; repairExistingSource?: boolean } = {},
): Promise<CanonicalCommitResult> {
  if (!rows.length) return { committed: 0, ids: [], idempotentReplay: false };
  if (!/^sha256:[0-9a-fA-F]{64}$/.test(sourceHash)) throw new Error('IMPORT_SOURCE_HASH_INVALID');
  let client = context.client;
  let companyId = context.companyId;
  const importJobId = context.importJobId;
  const repairExistingSource = context.repairExistingSource === true;
  if (!client || !companyId) {
    const browser = await import('../supabase');
    client ??= browser.supabase;
    companyId ??= (await browser.resolveCurrentCompanyId()) ?? undefined;
  }
  if (!client || !companyId) throw new Error('No authenticated tenant context is available for canonical import');
  if (!importJobId) throw new Error('IMPORT_JOB_ID_REQUIRED');

  rows.forEach((row) => assertCanonicalBoundary(row, companyId));
  for (const row of rows) {
    if (row.provenance.sourceHash !== sourceHash) throw new Error(`CANONICAL_SOURCE_HASH_MISMATCH:${row.rowNumber}`);
  }

  const payload = rows.map((row) => canonicalizeRow(entityType, row));
  const activeClient = client;
  const rpcArgs: Record<string, unknown> = {
    p_company_id: companyId,
    p_entity_type: entityType,
    p_rows: payload,
    p_null_policy: 'preserve',
    p_source_hash: sourceHash,
    p_import_job_id: importJobId,
  };
  if (repairExistingSource) rpcArgs.p_repair = true;

  const { data, error } = await activeClient.rpc(
    'import_commit_batch',
    rpcArgs,
  );
  if (error) throw error;

  const result = data as { committed?: unknown; ids?: unknown; idempotent_replay?: unknown } | null;
  const committed = Number(result?.committed);
  const ids = Array.isArray(result?.ids) ? result.ids.map(String) : [];
  const idempotentReplay = result?.idempotent_replay === true;
  if (!Number.isInteger(committed) || committed !== rows.length || ids.length !== rows.length) {
    throw new Error('IMPORT_COMMIT_RESULT_MISMATCH');
  }
  return { committed, ids, idempotentReplay };
}
