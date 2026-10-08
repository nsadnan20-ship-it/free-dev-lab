import { buildBusinessKeyIndex, matchBusinessKey, normalizeBusinessKey } from './business-key.ts';
import { inferSchema, type SchemaEvidence, type SchemaField } from './schema-intelligence.ts';

export type OperationalInputRow = Record<string, unknown>;

export type ReconciliationStatus = 'new' | 'updated' | 'unchanged' | 'conflict' | 'error';

export type OperationalRowResult = {
  rowIndex: number;
  status: ReconciliationStatus;
  businessKey: string;
  changedFields: string[];
  reason: string;
};

export type OperationalPreview = {
  schema: SchemaEvidence[];
  selectedBusinessKey: string | null;
  requiresApproval: boolean;
  rows: OperationalRowResult[];
  counts: Record<ReconciliationStatus, number>;
  fingerprint: string;
};

function stableValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  return String(value).trim();
}

function stableRow(row: OperationalInputRow, headers: string[]): string {
  return headers.map(header => `${normalizeBusinessKey(header)}=${stableValue(row[header])}`).join('|');
}

/** Deterministic, order-independent preview fingerprint. No database writes occur here. */
export function buildPreviewFingerprint(rows: OperationalInputRow[], headers: string[]): string {
  const canonicalRows = rows.map(row => stableRow(row, headers)).sort();
  let hash = 2166136261;
  for (const value of canonicalRows.join('\n')) {
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function selectBusinessKey(schema: SchemaEvidence[]): { headerIndex: number; field: SchemaField } | null {
  const candidates = schema
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.field === 'sku' || item.field === 'barcode' || item.field === 'customer_id' || item.field === 'invoice_number')
    .filter(({ item }) => !item.ambiguous && item.confidence >= 90)
    .sort((a, b) => b.item.confidence - a.item.confidence);
  const selected = candidates[0];
  return selected ? { headerIndex: selected.index, field: selected.item.field } : null;
}

export function buildOperationalPreview(
  headers: string[],
  incomingRows: OperationalInputRow[],
  existingRows: OperationalInputRow[] = [],
): OperationalPreview {
  const schema = inferSchema(headers, incomingRows);
  const keySchema = selectBusinessKey(schema);
  const keyHeader = keySchema ? headers[keySchema.headerIndex] : null;
  const counts: Record<ReconciliationStatus, number> = { new: 0, updated: 0, unchanged: 0, conflict: 0, error: 0 };
  const rows: OperationalRowResult[] = [];

  if (!keyHeader) {
    incomingRows.forEach((_, rowIndex) => {
      counts.error += 1;
      rows.push({ rowIndex, status: 'error', businessKey: '', changedFields: [], reason: 'No unambiguous business key was detected.' });
    });
    return {
      schema,
      selectedBusinessKey: null,
      requiresApproval: true,
      rows,
      counts,
      fingerprint: buildPreviewFingerprint(incomingRows, headers),
    };
  }

  const index = buildBusinessKeyIndex(existingRows, row => row[keyHeader]);
  const incomingKeyCounts = new Map<string, number>();
  for (const row of incomingRows) {
    const key = normalizeBusinessKey(row[keyHeader]);
    if (key) incomingKeyCounts.set(key, (incomingKeyCounts.get(key) ?? 0) + 1);
  }

  incomingRows.forEach((row, rowIndex) => {
    const key = normalizeBusinessKey(row[keyHeader]);
    if (!key) {
      counts.error += 1;
      rows.push({ rowIndex, status: 'error', businessKey: '', changedFields: [], reason: 'Missing business key.' });
      return;
    }
    if ((incomingKeyCounts.get(key) ?? 0) > 1) {
      counts.conflict += 1;
      rows.push({ rowIndex, status: 'conflict', businessKey: key, changedFields: [], reason: 'Duplicate business key in incoming data.' });
      return;
    }
    const match = matchBusinessKey(index, key);
    if (!match.row) {
      counts.new += 1;
      rows.push({ rowIndex, status: 'new', businessKey: key, changedFields: [], reason: 'Business key not found in target.' });
      return;
    }

    // The business key is an identity field, not a mutable data field. Compare it
    // canonically for matching, but never report representation-only differences
    // (e.g. Arabic vs English digits or surrounding whitespace) as an update.
    const changedFields = headers.filter(header => {
      if (header === keyHeader) return normalizeBusinessKey(row[header]) !== normalizeBusinessKey(match.row?.[header]);
      return stableValue(row[header]) !== stableValue(match.row?.[header]);
    }).filter(header => header !== keyHeader);

    if (changedFields.length === 0) {
      counts.unchanged += 1;
      rows.push({ rowIndex, status: 'unchanged', businessKey: key, changedFields: [], reason: 'No material field changes.' });
    } else {
      counts.updated += 1;
      rows.push({ rowIndex, status: 'updated', businessKey: key, changedFields, reason: 'Existing business key matched with changed fields.' });
    }
  });

  const hasAmbiguity = schema.some(item => item.ambiguous);
  const duplicateIncoming = [...incomingKeyCounts.values()].some(count => count > 1);
  return {
    schema,
    selectedBusinessKey: keyHeader,
    requiresApproval: hasAmbiguity || duplicateIncoming || counts.error > 0 || counts.conflict > 0,
    rows,
    counts,
    fingerprint: buildPreviewFingerprint(incomingRows, headers),
  };
}
