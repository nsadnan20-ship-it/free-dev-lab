export type ValueState = 'ZERO' | 'VALUE' | 'MISSING' | 'UNKNOWN';
export type SourceKind = 'excel' | 'csv' | 'pdf' | 'word' | 'image' | 'api' | 'database' | 'manual';

export interface ProvenanceRef {
  importId?: string | null;
  sourceKind: SourceKind;
  sourceName?: string | null;
  fileHash?: string | null;
  sheet?: string | null;
  row?: number | null;
  column?: string | null;
  page?: number | null;
  extractedAt?: string | null;
}

export interface CanonicalValue<T> {
  value: T | null;
  state: ValueState;
  confidence: number;
  provenance: ProvenanceRef[];
}

export interface CanonicalParty {
  id?: string | null;
  externalId?: string | null;
  name: CanonicalValue<string>;
  type: 'customer' | 'supplier' | 'employee' | 'other';
}

export interface CanonicalProduct {
  id?: string | null;
  sku: CanonicalValue<string>;
  name: CanonicalValue<string>;
  unit?: CanonicalValue<string>;
  category?: CanonicalValue<string>;
}

export interface CanonicalTransactionLine {
  product: CanonicalProduct;
  quantity: CanonicalValue<number>;
  unitPrice?: CanonicalValue<number>;
  lineTotal?: CanonicalValue<number>;
  unitCost?: CanonicalValue<number>;
}

export interface CanonicalTransaction {
  id?: string | null;
  externalId?: string | null;
  type: 'sale' | 'purchase' | 'return' | 'credit_note' | 'debit_note' | 'payment' | 'expense' | 'adjustment';
  date: CanonicalValue<string>;
  currency?: CanonicalValue<string>;
  party?: CanonicalParty;
  lines: CanonicalTransactionLine[];
  total?: CanonicalValue<number>;
  paidAmount?: CanonicalValue<number>;
  status?: CanonicalValue<string>;
}

export interface CanonicalInventoryBalance {
  product: CanonicalProduct;
  warehouseId?: CanonicalValue<string>;
  quantity: CanonicalValue<number>;
  unitCost?: CanonicalValue<number>;
  asOf?: string | null;
}

export interface CanonicalDataset {
  schemaVersion: string;
  tenantId?: string | null;
  importedAt: string;
  source: ProvenanceRef;
  transactions: CanonicalTransaction[];
  inventory: CanonicalInventoryBalance[];
}

export function normalizeArabicEnglishDigits(input: unknown): string {
  return String(input ?? '')
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

export function normalizeText(input: unknown): string {
  return normalizeArabicEnglishDigits(input).replace(/[\u064B-\u065F\u0670]/g, '').replace(/[إأآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function classifyValueState(value: unknown): ValueState {
  if (value === null || value === undefined || String(value).trim() === '') return 'MISSING';
  const normalized = normalizeText(value);
  if (normalized === 'unknown' || normalized === 'غير معروف' || normalized === 'n/a' || normalized === 'na') return 'UNKNOWN';
  const numeric = Number(normalizeArabicEnglishDigits(value).replace(/,/g, ''));
  if (Number.isFinite(numeric) && numeric === 0) return 'ZERO';
  return 'VALUE';
}

export function dedupeByStableKey<T>(rows: T[], keyOf: (row: T) => string): { unique: T[]; duplicates: T[] } {
  const seen = new Set<string>();
  const unique: T[] = [];
  const duplicates: T[] = [];
  for (const row of rows) {
    const key = keyOf(row).trim();
    if (!key || seen.has(key)) duplicates.push(row);
    else { seen.add(key); unique.push(row); }
  }
  return { unique, duplicates };
}
