import type { DataType } from './types.ts';
import { normalizeArabicDigits, normalizeHeader, isSKU, isPhone, isEmail, parseNumber, parseDate, parseCurrency } from './normalizer.ts';

const NAME_HINTS = /^(name|اسم|اسم الصنف|اسم المنتج|item name|product name)$/i;
const DESCRIPTION_HINTS = /description|وصف/i;
type DataValue = string | number | boolean | null | undefined;

export function detectDataType(values: unknown[]): DataType {
  const nonNull = values.filter((v) => v !== null && v !== undefined && v !== '');
  if (nonNull.length === 0) return 'unknown';
  const sample = nonNull.slice(0, Math.min(200, nonNull.length));
  let skuCount = 0, phoneCount = 0, emailCount = 0, intCount = 0;
  let decimalCount = 0, currencyCount = 0, dateCount = 0, boolCount = 0;
  for (const v of sample) {
    const str = String(v).trim();
    if (isSKU(str)) skuCount++;
    if (isPhone(str)) phoneCount++;
    if (isEmail(str)) emailCount++;
    if (parseDate(str)) dateCount++;
    if (typeof v === 'boolean' || /^(true|false|نعم|لا|صح|خطأ|yes|no)$/i.test(str)) boolCount++;
    const num = parseNumber(str);
    if (num !== null) {
      if (Number.isInteger(num)) intCount++;
      else decimalCount++;
    }
    if (/ر\.?س|ريال|sar|sr|\$|€|£|د\.?إ|درهم/i.test(str)) currencyCount++;
  }
  const threshold = sample.length * 0.8;
  if (emailCount >= threshold) return 'email';
  if (phoneCount >= threshold) return 'phone';
  if (skuCount >= threshold) return 'sku';
  if (dateCount >= threshold) return 'date';
  if (boolCount >= threshold) return 'boolean';
  if (currencyCount >= threshold) return 'currency';
  if (intCount >= threshold) return 'integer';
  if (decimalCount >= threshold) return 'decimal';
  if (intCount + decimalCount >= threshold) return 'decimal';
  const uniqueCount = new Set(sample.map((v) => String(v))).size;
  if (uniqueCount <= Math.min(20, Math.max(2, sample.length * 0.3))) return 'category';
  return 'text';
}

export function detectColumnDataType(values: unknown[], columnName: string): DataType {
  const normalized = normalizeHeader(normalizeArabicDigits(columnName));
  if (NAME_HINTS.test(normalized) || DESCRIPTION_HINTS.test(normalized)) return 'text';
  if (/sku|كود|رمز|رقم الصنف|barcode|باركود|item code|product code|product id/i.test(normalized)) return 'sku';
  if (/phone|هاتف|جوال|tel|mobile|رقم الهاتف|رقم الجوال/i.test(normalized)) return 'phone';
  if (/email|بريد|mail/i.test(normalized)) return 'email';
  if (/date|تاريخ/i.test(normalized)) return 'date';
  if (/price|سعر|cost|تكلفة|amount|مبلغ|total|إجمالي/i.test(normalized)) return 'currency';
  if (/qty|كمية|عدد|quantity|count|المخزون|رصيد/i.test(normalized)) return 'integer';
  if (/unit|وحدة/i.test(normalized)) return 'unit';
  if (/status|حالة/i.test(normalized)) return 'category';
  if (/segment|شريحة|category|فئة|تصنيف/i.test(normalized)) return 'category';
  if (/percent|نسبة|%/i.test(normalized)) return 'percentage';
  return detectDataType(values);
}

export function cleanValue(value: unknown, dataType: DataType): DataValue {
  if (value === null || value === undefined || value === '') return null;
  switch (dataType) {
    case 'integer': {
      const n = parseNumber(value);
      return n !== null ? Math.round(n) : null;
    }
    case 'decimal':
    case 'currency':
    case 'percentage':
      return parseCurrency(value) ?? parseNumber(value);
    case 'date':
      return parseDate(value);
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      const v = normalizeArabicDigits(String(value)).trim().toLowerCase();
      if (['true', 'نعم', 'صح', '1', 'yes'].includes(v)) return true;
      if (['false', 'لا', 'خطأ', '0', 'no'].includes(v)) return false;
      return null;
    }
    case 'sku':
      return normalizeArabicDigits(String(value)).trim();
    case 'phone':
      return normalizeArabicDigits(String(value)).replace(/[\s\-+()]/g, '');
    case 'email':
      return String(value).trim().toLowerCase();
    default:
      return typeof value === 'string' ? value.trim() : typeof value === 'number' || typeof value === 'boolean' ? value : String(value);
  }
}
