import { normalizeBusinessKey } from './business-key.ts';

export type ReconciliationStatus = 'new' | 'updated' | 'unchanged' | 'conflict' | 'error';
export type ReconciliationRow<T> = { key: string; status: ReconciliationStatus; source: T; target: T | null; changedFields: string[]; reason: string };
export type ReconciliationSummary = { total: number; new: number; updated: number; unchanged: number; conflict: number; error: number; deleted: number };
export type ReconciliationResult<T> = { rows: ReconciliationRow<T>[]; summary: ReconciliationSummary; deletedKeys: string[] };
export type FieldComparator<T> = (source: T, target: T) => string[];

export function reconcileByBusinessKey<T>(sourceRows: T[], targetRows: T[], getKey: (row: T) => unknown, compareFields: FieldComparator<T>): ReconciliationResult<T> {
  const targetIndex = new Map<string, T[]>();
  for (const target of targetRows) {
    const key = normalizeBusinessKey(getKey(target));
    if (!key) continue;
    const bucket = targetIndex.get(key) ?? [];
    bucket.push(target);
    targetIndex.set(key, bucket);
  }

  const sourceKeys = new Set<string>();
  const rows: ReconciliationRow<T>[] = sourceRows.map(source => {
    const key = normalizeBusinessKey(getKey(source));
    if (!key) return { key, status: 'error', source, target: null, changedFields: [], reason: 'missing business key' };
    sourceKeys.add(key);
    const matches = targetIndex.get(key) ?? [];
    if (matches.length > 1) return { key, status: 'conflict', source, target: null, changedFields: [], reason: 'duplicate target business key' };
    if (!matches.length) return { key, status: 'new', source, target: null, changedFields: [], reason: 'business key not found' };
    const target = matches[0];
    const changedFields = compareFields(source, target);
    return changedFields.length
      ? { key, status: 'updated', source, target, changedFields, reason: 'canonical key matched; fields differ' }
      : { key, status: 'unchanged', source, target, changedFields: [], reason: 'canonical key and compared fields match' };
  });

  // Target-only keys are reported explicitly. They are NOT deleted automatically;
  // callers must apply an explicit tombstone/deletion policy before mutation.
  const deletedKeys = [...targetIndex.keys()].filter(key => !sourceKeys.has(key));
  const summary = rows.reduce<ReconciliationSummary>((acc, row) => {
    acc.total += 1;
    acc[row.status] += 1;
    return acc;
  }, { total: 0, new: 0, updated: 0, unchanged: 0, conflict: 0, error: 0, deleted: deletedKeys.length });
  return { rows, summary, deletedKeys };
}

export function stableImportFingerprint<T>(rows: T[], getKey: (row: T) => unknown, serialize: (row: T) => string): string {
  const canonical = rows.map(row => `${normalizeBusinessKey(getKey(row))}|${serialize(row)}`).sort().join('\n');
  let hash = 2166136261;
  for (let i = 0; i < canonical.length; i += 1) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
