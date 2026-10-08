export type NormalizedValue = {
  original: unknown;
  value: unknown;
  kind: 'string' | 'number' | 'date' | 'boolean' | 'null';
  warnings: string[];
};

const arabic = '٠١٢٣٤٥٦٧٨٩';
const persian = '۰۱۲۳۴۵۶۷۸۹';
const latin = '0123456789';

export function normalizeArabicText(input: string): string {
  let s = input.normalize('NFKC').trim();
  s = s.replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
  s = s.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '').replace(/ـ/g, '');
  for (let i = 0; i < 10; i++) {
    s = s.replace(new RegExp(arabic[i], 'g'), latin[i]);
    s = s.replace(new RegExp(persian[i], 'g'), latin[i]);
  }
  return s.replace(/\s+/g, ' ').trim();
}

export function parseNumber(input: unknown): NormalizedValue {
  const original = input;
  if (typeof input === 'number') return { original, value: input, kind: 'number', warnings: [] };
  let s = normalizeArabicText(String(input ?? ''));
  if (!s) return { original, value: null, kind: 'null', warnings: [] };
  const warnings: string[] = [];
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); warnings.push('parentheses-negative'); }
  s = s.replace(/\s/g, '');

  // Normalize Arabic/Indic decimal and thousands separators before locale parsing.
  if (s.includes('٬') || s.includes('٫')) {
    s = s.replace(/٬/g, ',').replace(/٫/g, '.');
    warnings.push('arabic-separator-normalized');
  }

  // Remove known currency markers/tokens without deleting ordinary numeric punctuation.
  s = s.replace(/(?:USD|EUR|GBP|JPY|SAR|YER|ر\.س|ريال|﷼|\$|€|£|¥)/gi, '');
  const percent = /%|٪/.test(s);
  s = s.replace(/[%٪]/g, '');
  const commas = (s.match(/,/g) ?? []).length;
  const dots = (s.match(/\./g) ?? []).length;
  if (commas && dots) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
    warnings.push('locale-separator-normalized');
  } else if (commas) {
    const parts = s.split(',');
    s = parts.length === 2 && parts[1].length <= 2 ? `${parts[0]}.${parts[1]}` : parts.join('');
    warnings.push('comma-separator-normalized');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return { original, value: null, kind: 'null', warnings: [...warnings, 'invalid-number'] };
  return { original, value: negative ? -n : percent ? n / 100 : n, kind: 'number', warnings };
}

export function normalizeValue(input: unknown, hint?: 'number' | 'date' | 'text' | 'boolean'): NormalizedValue {
  if (input === null || input === undefined || String(input).trim() === '') return { original: input, value: null, kind: 'null', warnings: [] };
  if (hint === 'number') return parseNumber(input);
  if (hint === 'boolean') {
    const s = normalizeArabicText(String(input)).toLowerCase();
    if (['true', 'yes', 'y', 'نعم', 'صح', '1'].includes(s)) return { original: input, value: true, kind: 'boolean', warnings: [] };
    if (['false', 'no', 'n', 'لا', 'خطا', 'خطأ', '0'].includes(s)) return { original: input, value: false, kind: 'boolean', warnings: [] };
  }
  if (hint === 'date') {
    const d = new Date(String(input));
    if (!Number.isNaN(d.getTime())) return { original: input, value: d.toISOString(), kind: 'date', warnings: [] };
  }
  return { original: input, value: normalizeArabicText(String(input)), kind: 'string', warnings: [] };
}
