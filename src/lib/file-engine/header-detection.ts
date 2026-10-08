import { normalizeColumnName } from './normalizer.ts';

export type HeaderCandidate = {
  rowIndex: number;
  score: number;
  headers: string[];
  reasons: string[];
  structurallySuspicious?: boolean;
};

const HEADER_HINTS = [
  'sku', 'code', 'item', 'product', 'name', 'price', 'quantity', 'qty',
  'رقم', 'كود', 'صنف', 'منتج', 'اسم', 'السعر', 'الكمية', 'العدد', 'التاريخ', 'date',
];

function nonEmpty(values: unknown[]): string[] {
  return values.map(v => String(v ?? '').trim()).filter(Boolean);
}

const DATE_HEADER_PATTERN = /^(.*?التاريخ.*?)\s+(20\d{2})-\s*$/u;

function normalizeReconstructedHeader(value: string): { header: string; year: string | null } {
  const compact = value.replace(/\s+/g, ' ').trim();
  const match = compact.match(DATE_HEADER_PATTERN);
  if (match) return { header: match[1].trim(), year: match[2] };
  return { header: compact, year: null };
}

function isRepeatedHeaderRow(row: unknown[], headers: string[]): boolean {
  const values = nonEmpty(row);
  if (!values.length || values.length !== headers.length) return false;
  return values.every((value, index) => {
    const left = normalizeColumnName(value);
    const right = normalizeColumnName(headers[index]);
    return left === right || left.includes(right) || right.includes(left);
  });
}

function reconstructCellValue(header: string, value: unknown, headerYear: string | null): unknown {
  const text = String(value ?? '').trim();
  if (!text) return value;
  const normalizedHeader = normalizeColumnName(header);
  if (headerYear && normalizedHeader.includes('التاريخ') && /^\d{1,2}[-/]\d{1,2}$/.test(text)) {
    const [month, day] = text.split(/[-/]/).map((part) => Number(part));
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const candidate = new Date(Date.UTC(Number(headerYear), month - 1, day));
      if (candidate.getUTCFullYear() === Number(headerYear) && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day) {
        return `${headerYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }
  return value;
}

function uniqueRatio(values: string[]): number {
  if (!values.length) return 0;
  return new Set(values.map(normalizeColumnName)).size / values.length;
}

/**
 * Detects a likely header row instead of assuming row zero is the header.
 * This is deliberately deterministic: it scores structure and known field hints,
 * never asking an LLM to decide the schema.
 */
export function detectHeaderRow(rows: unknown[][], maxRows = Math.min(rows.length, 25)): HeaderCandidate | null {
  if (!rows.length) return null;
  const candidates: HeaderCandidate[] = [];

  for (let rowIndex = 0; rowIndex < maxRows; rowIndex++) {
    const headers = nonEmpty(rows[rowIndex] ?? []);
    if (!headers.length) continue;

    const normalized = headers.map(normalizeColumnName);
    const next = rows[rowIndex + 1] ? nonEmpty(rows[rowIndex + 1]) : [];
    const isSingleKnownHeader = headers.length === 1
      && next.length >= 1
      && HEADER_HINTS.some(hint => normalized[0]?.includes(normalizeColumnName(hint)));
    if (headers.length === 1 && !isSingleKnownHeader) continue;

    const textLike = headers.filter(v => /[^\d.,%\-+\s]/u.test(v)).length / headers.length;
    const unique = uniqueRatio(headers);
    const hintCounts = normalized.map(h => HEADER_HINTS.filter(x => h.includes(normalizeColumnName(x))).length);
    const hints = hintCounts.filter(Boolean).length;
    const compositeCells = hintCounts.filter((count) => count >= 2).length;
    const structurallySuspicious = compositeCells > 0;
    const dataLike = headers.filter((value) =>
      /^[-+]?\d[\d.,٬،/\s-]*$/u.test(value) ||
      /\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/u.test(value)
    ).length / headers.length;
    const containsDateValue = headers.some((value) => /\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/u.test(value));
    const containsIdentifierValue = headers.some((value) => /^(?:DOC|SKU|A|B|C)[-_]?\d+/iu.test(value));
    const containsMixedBusinessValues = containsDateValue && containsIdentifierValue;
    const nextWidth = next.length;

    let score = 0;
    const reasons: string[] = [];
    if (structurallySuspicious) {
      score -= 35;
      reasons.push('composite header cell — structure not proven');
    }
    score += Math.min(headers.length, 12) * 3;
    if (textLike >= 0.6) { score += 15; reasons.push('text-like headers'); }
    if (unique >= 0.8) { score += 15; reasons.push('unique headers'); }
    if (hints) { score += Math.min(hints * 8, 24); reasons.push('canonical field hints'); }
    if (!hints && dataLike >= 0.5) { score -= 30; reasons.push('data-like row without canonical header hints'); }
    if (containsMixedBusinessValues && rowIndex > 0) {
      score -= 60;
      reasons.push('business data row: date + identifier detected');
    }
    const minimumNextWidth = headers.length === 1 ? 1 : Math.max(2, Math.floor(headers.length * 0.7));
    if (nextWidth >= minimumNextWidth) { score += 20; reasons.push('next row matches width'); }
    if (headers.length === 1) { score += 5; reasons.push('single-field canonical header'); }
    if (rowIndex === 0) score += 5;
    if (rowIndex > 0) score -= Math.min(rowIndex, 10);

    candidates.push({ rowIndex, score, headers, reasons, structurallySuspicious });
  }

  candidates.sort((a, b) => b.score - a.score || a.rowIndex - b.rowIndex);
  return candidates[0] ?? null;
}

export function rowsFromDetectedHeader(rows: unknown[][], candidate: HeaderCandidate): Record<string, unknown>[] {
  const reconstructed = candidate.headers.map((header, index) => {
    const value = header || `column_${index + 1}`;
    return normalizeReconstructedHeader(value);
  });
  const headers = reconstructed.map((item, index) => item.header || `column_${index + 1}`);
  const dateYear = reconstructed.find((item) => item.year)?.year ?? null;
  return rows
    .slice(candidate.rowIndex + 1)
    .filter((row) => !isRepeatedHeaderRow(row, headers))
    .map((row) =>
      Object.fromEntries(
        headers.map((header, i) => [header, reconstructCellValue(header, row?.[i] ?? '', dateYear)])
      )
    );
}
