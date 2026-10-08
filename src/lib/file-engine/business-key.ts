import { normalizeArabicDigits, normalizeArabicText, normalizeWhitespace } from './normalizer.ts';

/**
 * Canonicalizes external business identifiers before matching/importing.
 * Deliberately preserves meaningful leading zeroes while removing presentation noise.
 * Unicode compatibility normalization also folds full-width Latin letters/digits
 * into their canonical ASCII forms without changing semantic identifiers.
 */
export function normalizeBusinessKey(value: unknown): string {
  if (value === null || value === undefined) return '';
  let key = String(value).normalize('NFKC');
  key = normalizeArabicDigits(key);
  key = normalizeArabicText(normalizeWhitespace(key));
  key = key
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, '')
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/[\u00A0\u202F\s]/g, '')
    .toUpperCase();
  return key;
}

export function businessKeysEqual(a: unknown, b: unknown): boolean {
  const left = normalizeBusinessKey(a);
  const right = normalizeBusinessKey(b);
  return left.length > 0 && left === right;
}

export function buildBusinessKeyIndex<T>(rows: T[], getKey: (row: T) => unknown): Map<string, T> {
  const index = new Map<string, T>();
  for (const row of rows) {
    const key = normalizeBusinessKey(getKey(row));
    if (key) index.set(key, row);
  }
  return index;
}

export type BusinessKeyMatch<T> = {
  key: string;
  row: T | null;
  matched: boolean;
  reason: 'exact-canonical' | 'missing-key' | 'not-found';
};

export function matchBusinessKey<T>(index: Map<string, T>, rawKey: unknown): BusinessKeyMatch<T> {
  const key = normalizeBusinessKey(rawKey);
  if (!key) return { key: '', row: null, matched: false, reason: 'missing-key' };
  const row = index.get(key) ?? null;
  return { key, row, matched: row !== null, reason: row ? 'exact-canonical' : 'not-found' };
}
