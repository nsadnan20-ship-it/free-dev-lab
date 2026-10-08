import { inferSchemaField, type SchemaEvidence, type SchemaField } from './schema-intelligence.ts';
import { normalizeBusinessKey } from './business-key.ts';

// Node strip-types CI executes this module as native ESM; keep explicit .ts specifiers.
export type ColumnInference = SchemaEvidence & { sourceColumn: string; sampleSize: number };
export type TableInference = { headerRow: number; confidence: number; columns: ColumnInference[]; ignoredRows: number[]; reason: string[] };
export type MappingDecision = { sourceColumn: string; field: SchemaField; confidence: number; evidence: string[]; ambiguous: boolean };

const OCR_FIXES: Array<[RegExp, string]> = [
  [/رقم\s*الصفنف/gi, 'رقم الصنف'], [/رقم\s*الاصنف/gi, 'رقم الصنف'], [/كود\s*الاصنف/gi, 'كود الصنف'],
  [/الباركود\s*\|/gi, 'الباركود'], [/produc[tc]\s*cod[eo]/gi, 'product code'], [/prodcut/gi, 'product'], [/quantit[vy]/gi, 'quantity'],
];
export function correctOcrHeader(value: string): string { return OCR_FIXES.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), value).trim(); }
function rowDensity(row: unknown[]): number { return row.length ? row.filter(v => v !== null && v !== undefined && String(v).trim() !== '').length / row.length : 0; }
function headerLikelihood(row: unknown[]): number {
  const values = row.map(v => String(v ?? '').trim()).filter(Boolean); if (!values.length) return 0;
  const textLike = values.filter(v => /[A-Za-z\u0600-\u06FF]/.test(v)).length / values.length;
  const unique = new Set(values.map(v => v.toLocaleLowerCase())).size / values.length;
  return Math.min(100, Math.round(textLike * 60 + unique * 25 + rowDensity(row) * 15));
}
export function discoverHeaderRow(matrix: unknown[][], maxRows = 30): { row: number; confidence: number } {
  let best = { row: 0, confidence: 0 }; for (let i = 0; i < Math.min(matrix.length, maxRows); i++) { const confidence = headerLikelihood(matrix[i]); if (confidence > best.confidence) best = { row: i, confidence }; } return best;
}
export function inferTable(matrix: unknown[][], maxRows = 30): TableInference {
  const header = discoverHeaderRow(matrix, maxRows); const rawHeaders = matrix[header.row] ?? []; const headers = rawHeaders.map(v => correctOcrHeader(String(v ?? '')));
  const rows = matrix.slice(header.row + 1).filter(row => rowDensity(row) > 0);
  const columns = headers.map((sourceColumn, index) => { const values = rows.map(row => row[index]); const evidence = inferSchemaField(sourceColumn, values); return { ...evidence, sourceColumn, sampleSize: values.filter(v => v !== null && v !== undefined && String(v).trim() !== '').length }; });
  return { headerRow: header.row, confidence: header.confidence, columns, ignoredRows: matrix.slice(0, header.row).map((_, i) => i), reason: header.row === 0 ? ['first row has highest header likelihood'] : ['header discovered below preamble/title rows'] };
}
export function resolveMappings(columns: ColumnInference[]): MappingDecision[] {
  const ranked = [...columns].filter(c => c.field !== 'unknown' && c.confidence > 0).sort((a, b) => b.confidence - a.confidence || a.sourceColumn.localeCompare(b.sourceColumn));
  const claimed = new Set<SchemaField>();
  return ranked.map(column => { const duplicate = claimed.has(column.field); if (!duplicate) claimed.add(column.field); return { sourceColumn: column.sourceColumn, field: column.field, confidence: duplicate ? Math.max(0, column.confidence - 20) : column.confidence, evidence: duplicate ? [...column.evidence, 'duplicate target field; lower-ranked mapping'] : column.evidence, ambiguous: duplicate || column.ambiguous }; });
}
export type EntityResolution = { sourceKey: string; matched: boolean; targetIndex: number | null; confidence: number; reason: 'exact-canonical' | 'missing-key' | 'not-found' | 'duplicate-target' };
export function resolveEntities<T>(sourceRows: T[], targetRows: T[], getKey: (row: T) => unknown): EntityResolution[] {
  const index = new Map<string, number[]>(); targetRows.forEach((row, targetIndex) => { const key = normalizeBusinessKey(getKey(row)); if (!key) return; const bucket = index.get(key) ?? []; bucket.push(targetIndex); index.set(key, bucket); });
  return sourceRows.map(row => { const sourceKey = normalizeBusinessKey(getKey(row)); if (!sourceKey) return { sourceKey, matched: false, targetIndex: null, confidence: 0, reason: 'missing-key' }; const matches = index.get(sourceKey) ?? []; if (matches.length === 1) return { sourceKey, matched: true, targetIndex: matches[0], confidence: 100, reason: 'exact-canonical' }; if (matches.length > 1) return { sourceKey, matched: false, targetIndex: null, confidence: 0, reason: 'duplicate-target' }; return { sourceKey, matched: false, targetIndex: null, confidence: 0, reason: 'not-found' }; });
}
