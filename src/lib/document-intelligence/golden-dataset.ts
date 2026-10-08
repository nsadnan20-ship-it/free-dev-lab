export type GoldenEvidence = { source: string; row?: number; field?: string; note: string };
export type GoldenCase = {
  id: string;
  class: 'ARABIC_ENGLISH' | 'SCANNED' | 'RANDOM_SCHEMA' | 'NO_HEADER' | 'COMPLEX_TABLE' | 'INVOICE' | 'ONYX' | 'WIDE_30_PLUS';
  input: { format: 'csv' | 'xlsx' | 'pdf' | 'ocr-text'; rows: Array<Record<string, unknown>> };
  expectedHeader?: number;
  expectedFields: string[];
  expectedNormalized: Array<Record<string, unknown>>;
  expectedEvidence: GoldenEvidence[];
  minConfidence: number;
};
export type GoldenEvaluation = { id: string; passed: boolean; confidence: number; schemaMatched: boolean; normalizedMatched: boolean; evidencePresent: boolean };
export type GoldenScore = { cases: number; passed: number; failed: number; accuracy: number; ready: boolean };
const row = (...entries: Array<[string, unknown]>): Record<string, unknown> => Object.fromEntries(entries);
export const GOLDEN_CASES: GoldenCase[] = [
  { id: 'ar-en-basic', class: 'ARABIC_ENGLISH', expectedHeader: 1, input: { format: 'xlsx', rows: [row(['رقم الصنف', 'A-100'], ['Product Name', 'سكر'], ['Qty', '١٢'], ['Unit Price', '45.50'])] }, expectedFields: ['sku', 'product_name', 'quantity', 'unit_price'], expectedNormalized: [row(['sku', 'A-100'], ['product_name', 'سكر'], ['quantity', 12], ['unit_price', 45.5])], expectedEvidence: [{ source: 'xlsx:sheet1', row: 2, field: 'sku', note: 'رقم الصنف → sku' }], minConfidence: 0.8 },
  { id: 'scanned-invoice', class: 'SCANNED', input: { format: 'ocr-text', rows: [row(['فاتورة', 'INV-77'], ['التاريخ', '26/08/2026'], ['الإجمالي', '١٬٢٥٠٫٥٠'])] }, expectedFields: ['invoice_number', 'invoice_date', 'total_amount'], expectedNormalized: [row(['invoice_number', 'INV-77'], ['invoice_date', '2026-08-26'], ['total_amount', 1250.5])], expectedEvidence: [{ source: 'ocr:page1', field: 'total_amount', note: 'OCR text mapped from الإجمالي' }], minConfidence: 0.7 },
  { id: 'random-schema', class: 'RANDOM_SCHEMA', input: { format: 'csv', rows: [row(['Item Code', 'P-9'], ['Qty Available', '20'])] }, expectedFields: ['sku', 'quantity'], expectedNormalized: [row(['sku', 'P-9'], ['quantity', 20])], expectedEvidence: [{ source: 'csv:row1', field: 'sku', note: 'Item Code synonym' }], minConfidence: 0.75 },
  { id: 'headerless-stock', class: 'NO_HEADER', input: { format: 'csv', rows: [row(['P-1', '50']), row(['P-2', '75'])] }, expectedFields: ['sku', 'quantity'], expectedNormalized: [row(['sku', 'P-1'], ['quantity', 50]), row(['sku', 'P-2'], ['quantity', 75])], expectedEvidence: [{ source: 'csv:row1', note: 'Header inferred from value-shape/schema candidates' }], minConfidence: 0.65 },
  { id: 'complex-table', class: 'COMPLEX_TABLE', input: { format: 'xlsx', rows: [row(['SKU', 'P-2'], ['Qty', '10'], ['Price', '12.5']), row(['Subtotal', '125'], ['Tax', '0'])] }, expectedFields: ['sku', 'quantity', 'unit_price'], expectedNormalized: [row(['sku', 'P-2'], ['quantity', 10], ['unit_price', 12.5])], expectedEvidence: [{ source: 'xlsx:sheet1', row: 1, note: 'Data table selected over subtotal footer' }], minConfidence: 0.75 },
  { id: 'invoice-reconciliation', class: 'INVOICE', input: { format: 'xlsx', rows: [row(['Invoice No', 'INV-9'], ['Qty', '5'], ['Unit Price', '20'], ['Total', '100'])] }, expectedFields: ['invoice_number', 'quantity', 'unit_price', 'total_amount'], expectedNormalized: [row(['invoice_number', 'INV-9'], ['quantity', 5], ['unit_price', 20], ['total_amount', 100])], expectedEvidence: [{ source: 'xlsx:sheet1', row: 1, field: 'total_amount', note: '5 × 20 reconciles to 100' }], minConfidence: 0.85 },
  { id: 'onyx-stock', class: 'ONYX', input: { format: 'xlsx', rows: [row(['SKU', 'OX-1'], ['Item Name', 'دقيق'], ['Warehouse', 'Main'], ['Quantity', '100'], ['Unit Price', '30'])] }, expectedFields: ['sku', 'product_name', 'warehouse', 'quantity', 'unit_price'], expectedNormalized: [row(['sku', 'OX-1'], ['product_name', 'دقيق'], ['warehouse', 'Main'], ['quantity', 100], ['unit_price', 30])], expectedEvidence: [{ source: 'xlsx:sheet1', row: 1, field: 'sku', note: 'Onyx export canonical SKU' }], minConfidence: 0.9 },
  { id: 'wide-report', class: 'WIDE_30_PLUS', input: { format: 'xlsx', rows: [row(['SKU', 'W-1'], ['Product', 'Rice'], ['Qty', '8'], ['Extra 01', 'x'], ['Extra 30', 'z'])] }, expectedFields: ['sku', 'product_name', 'quantity'], expectedNormalized: [row(['sku', 'W-1'], ['product_name', 'Rice'], ['quantity', 8])], expectedEvidence: [{ source: 'xlsx:sheet1', row: 1, note: 'Relevant columns selected from wide schema' }], minConfidence: 0.75 },
];
export function evaluateGoldenCase(expected: GoldenCase, actual: { fields: string[]; normalized: Array<Record<string, unknown>>; evidence: GoldenEvidence[]; confidence: number }): GoldenEvaluation {
  const schemaMatched = expected.expectedFields.every(field => actual.fields.includes(field));
  const normalizedMatched = JSON.stringify(actual.normalized) === JSON.stringify(expected.expectedNormalized);
  const evidencePresent = actual.evidence.length > 0 && actual.evidence.every(e => typeof e.source === 'string' && e.source.length > 0 && typeof e.note === 'string' && e.note.length > 0);
  const passed = schemaMatched && normalizedMatched && evidencePresent && Number.isFinite(actual.confidence) && actual.confidence >= expected.minConfidence;
  return { id: expected.id, passed, confidence: actual.confidence, schemaMatched, normalizedMatched, evidencePresent };
}
export function scoreGoldenCases(results: Array<{ id: string; passed: boolean }>): GoldenScore {
  const expected = new Set(GOLDEN_CASES.map(c => c.id));
  const seen = new Set<string>();
  let passed = 0;
  for (const result of results) {
    if (!expected.has(result.id) || seen.has(result.id)) continue;
    seen.add(result.id);
    if (result.passed) passed++;
  }
  const cases = expected.size;
  const accuracy = cases ? passed / cases : 0;
  return { cases, passed, failed: cases - passed, accuracy, ready: seen.size === cases && accuracy >= 0.95 };
}
