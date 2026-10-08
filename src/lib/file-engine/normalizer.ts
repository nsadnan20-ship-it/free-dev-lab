const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
const ARABIC_INDIC_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function normalizeArabicDigits(text: string): string {
  let result = text;
  for (let i = 0; i < 10; i += 1) {
    result = result.replace(new RegExp(ARABIC_DIGITS[i], 'g'), String(i));
    result = result.replace(new RegExp(ARABIC_INDIC_DIGITS[i], 'g'), String(i));
  }
  return result;
}

export function normalizeArabicText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u0640]/g, '')
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, '')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/\u0622/g, '\u0627')
    .replace(/\u0623/g, '\u0627')
    .replace(/\u0625/g, '\u0627')
    .replace(/\u0649/g, '\u064A')
    .replace(/\u0629/g, '\u0647')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Canonical header normalization used by schema discovery and column mapping. */
export function normalizeHeader(name: string): string {
  const normalized = normalizeArabicText(normalizeWhitespace(normalizeArabicDigits(name))).toLowerCase();
  // PDF table extractors sometimes append the reporting year as a fragmented
  // header (for example: "التاريخ 2026-"). That suffix belongs to the
  // reconstructed date value, not to the business field identity.
  return normalized
    .replace(/^(التاريخ|date)(?:\s+20\d{2}-?)$/u, '$1')
    .replace(/\s+(20\d{2})-?$/u, ' $1');
}

export function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return normalizeWhitespace(normalizeArabicDigits(value));
  return value;
}

export function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    result[normalizeWhitespace(key)] = normalizeValue(value);
  }
  return result;
}

export function normalizeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(normalizeRow);
}

export function normalizeColumnName(name: string): string {
  return normalizeHeader(name);
}

export function isSKU(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (v.length === 0 || v.length > 50) return false;
  if (/^0\d+/.test(v)) return true;
  if (/^[A-Z]{2,5}[-]?\d{2,8}$/i.test(v)) return true;
  if (/^[A-Z0-9]{3,15}$/i.test(v) && /\d/.test(v) && /[A-Z]/i.test(v)) return true;
  return false;
}

export function isPhone(value: unknown): boolean {
  if (typeof value !== 'string' && typeof value !== 'number') return false;
  const v = normalizeArabicDigits(String(value)).replace(/[\s\-+()]/g, '');
  return /^0?\d{9,15}$/.test(v);
}

export function isEmail(value: unknown): boolean {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Parse integers/decimals from Arabic or Western input without losing locale decimals. */
export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const original = normalizeArabicDigits(String(value)).trim();
  const currencyWords = /(?:ريال|ريال?يمني|ر\.س|ر\.ي|sar|yer|usd|eur|gbp|aed|دينار|درهم|جنيه|دولار|يورو|جنيه\s+إسترليني)/giu;
  const numericCandidate = original.replace(currencyWords, '');
  if (/\p{L}/u.test(numericCandidate)) return null;

  let normalized = numericCandidate
    .replace(/[٬]/g, ',')
    .replace(/[٫]/g, '.')
    .replace(/[\u00A0\u202F\s]/g, '')
    .replace(/[−–—]/g, '-');

  normalized = normalized.replace(/[^\d,.-]/g, '');
  if (normalized === '' || normalized === '-') return null;

  const comma = normalized.lastIndexOf(',');
  const dot = normalized.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    normalized = comma > dot ? normalized.replace(/\./g, '').replace(/,/g, '.') : normalized.replace(/,/g, '');
  } else if (comma >= 0) {
    const commaParts = normalized.split(',');
    const lastPart = commaParts[commaParts.length - 1] ?? '';
    if (commaParts.length > 1 && /^\d{1,2}$/.test(lastPart)) {
      // ERP/PDF sources may render grouped amounts like 2,275,00.
      // Interpret the final two digits as decimals and the earlier commas as grouping.
      normalized = commaParts.slice(0, -1).join('') + '.' + lastPart;
    } else if (commaParts.length === 2 && lastPart.length === 1) {
      normalized = commaParts[0] + '.' + lastPart;
    } else {
      normalized = commaParts.join('');
    }
  } else if ((normalized.match(/\./g) || []).length > 1) {
    normalized = normalized.replace(/\./g, '');
  }

  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function parseCurrency(value: unknown): number | null {
  return value === null || value === undefined || value === '' ? null : parseNumber(value);
}

export function parseDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value.toISOString().split('T')[0];
  const normalized = normalizeArabicDigits(String(value)).trim();

  const isoMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;

  const slashMatch = normalized.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})$/);
  if (slashMatch) {
    let [, day, month, year] = slashMatch;
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return null;
}
