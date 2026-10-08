import type { FileFormat, FileCategory, FileDetectionResult } from './types';

const MAGIC_BYTES: Record<FileFormat, number[][]> = {
  xlsx: [[0x50, 0x4B, 0x03, 0x04], [0x50, 0x4B, 0x05, 0x06]],
  xls: [[0xD0, 0xCF, 0x11, 0xE0]],
  xlsm: [[0x50, 0x4B, 0x03, 0x04]],
  ods: [[0x50, 0x4B, 0x03, 0x04]],
  zip: [[0x50, 0x4B, 0x03, 0x04]],
  pdf: [[0x25, 0x50, 0x44, 0x46]],
  docx: [[0x50, 0x4B, 0x03, 0x04]],
  doc: [[0xD0, 0xCF, 0x11, 0xE0]],
  rtf: [[0x7B, 0x5C, 0x72, 0x74, 0x66]],
  jpg: [[0xFF, 0xD8, 0xFF]],
  jpeg: [[0xFF, 0xD8, 0xFF]],
  png: [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
  webp: [[0x52, 0x49, 0x46, 0x46]],
  tiff: [[0x49, 0x49, 0x2A, 0x00], [0x4D, 0x4D, 0x00, 0x2A]],
  bmp: [[0x42, 0x4D]],
  gzip: [[0x1F, 0x8B]],
  tar: [[0x75, 0x73, 0x74, 0x61, 0x72]],
  csv: [], tsv: [], json: [], jsonl: [], xml: [], yaml: [], txt: [], markdown: [], unknown: [],
};

const EXTENSION_TO_FORMAT: Record<string, FileFormat> = {
  xlsx: 'xlsx', xls: 'xls', xlsm: 'xlsm', xlsb: 'xls', csv: 'csv', tsv: 'tsv', ods: 'ods',
  json: 'json', jsonl: 'jsonl', ndjson: 'jsonl', xml: 'xml', yaml: 'yaml', yml: 'yaml',
  txt: 'txt', md: 'markdown', markdown: 'markdown',
  pdf: 'pdf', docx: 'docx', doc: 'doc', rtf: 'rtf',
  jpg: 'jpg', jpeg: 'jpeg', png: 'png', webp: 'webp', tiff: 'tiff', tif: 'tiff', bmp: 'bmp',
  zip: 'zip', tar: 'tar', gz: 'gzip', gzip: 'gzip',
};

const FORMAT_TO_MIME: Record<FileFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  json: 'application/json',
  jsonl: 'application/x-ndjson',
  xml: 'application/xml',
  yaml: 'application/x-yaml',
  txt: 'text/plain',
  markdown: 'text/markdown',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  rtf: 'application/rtf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  tiff: 'image/tiff',
  bmp: 'image/bmp',
  zip: 'application/zip',
  tar: 'application/x-tar',
  gzip: 'application/gzip',
  unknown: 'application/octet-stream',
};

function isLikelyTextBuffer(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer.slice(0, 64 * 1024));
  if (!bytes.length) return false;

  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const replacementCount = [...utf8].filter((char) => char === '\uFFFD').length;
  const controlCount = [...utf8].filter((char) => {
    const code = char.charCodeAt(0);
    return (code < 9 || (code > 13 && code < 32)) && code !== 0;
  }).length;

  const meaningful = utf8.replace(/[\s\uFEFF]/g, '');
  const printableRatio = meaningful.length ? (meaningful.length - controlCount - replacementCount) / meaningful.length : 0;
  if (replacementCount > Math.max(2, Math.floor(bytes.length / 128))) return false;
  if (bytes.includes(0) && utf8.includes('\u0000')) return false;
  return printableRatio >= 0.94 && /[\p{L}\p{N}]/u.test(meaningful);
}

const FORMAT_TO_CATEGORY: Record<FileFormat, FileCategory> = {
  xlsx: 'spreadsheet', xls: 'spreadsheet', xlsm: 'spreadsheet', csv: 'spreadsheet', tsv: 'spreadsheet', ods: 'spreadsheet',
  json: 'text', jsonl: 'text', xml: 'text', yaml: 'text', txt: 'text', markdown: 'text',
  pdf: 'document', docx: 'document', doc: 'document', rtf: 'document',
  jpg: 'image', jpeg: 'image', png: 'image', webp: 'image', tiff: 'image', bmp: 'image',
  zip: 'archive', tar: 'archive', gzip: 'archive',
  unknown: 'unknown',
};

export function detectFormat(file: File, buffer: ArrayBuffer): FileDetectionResult {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const extFormat = EXTENSION_TO_FORMAT[extension] || 'unknown';
  const bytes = new Uint8Array(buffer.slice(0, 16));
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');

  let magicFormat: FileFormat = 'unknown';
  let isMatch = false;
  const warnings: string[] = [];

  for (const [fmt, patterns] of Object.entries(MAGIC_BYTES)) {
    for (const pattern of patterns) {
      if (pattern.length > 0 && pattern.every((byte, i) => bytes[i] === byte)) {
        magicFormat = fmt as FileFormat;
        isMatch = true;
        break;
      }
    }
    if (isMatch) break;
  }

  if (!isMatch && extFormat !== 'unknown') {
    if (['csv', 'tsv', 'json', 'jsonl', 'xml', 'yaml', 'txt', 'markdown'].includes(extFormat)) {
      magicFormat = extFormat;
      isMatch = true;
    }
  }

  let detectedFormat: FileFormat = isMatch ? magicFormat : extFormat;
  if (!isMatch && extFormat === 'unknown' && isLikelyTextBuffer(buffer)) {
    detectedFormat = 'txt';
    warnings.push('لم تُعرف امتدادات الملف، لكن محتواه نصي وقابل للتحليل؛ تم تحويله لمسار النص العام دون افتراض نموذج أعمال.');
    isMatch = true;
  }
  const mismatch = isMatch && magicFormat !== 'unknown' && extFormat !== 'unknown' && magicFormat !== extFormat;

  if (mismatch) {
    warnings.push(`امتداد الملف (${extension}) لا يتطابق مع المحتوى الفعلي (${magicFormat})`);
  }

  if (detectedFormat === 'unknown') {
    warnings.push('تعذر تحديد صيغة الملف؛ يبدو الملف غير معروف أو ثنائيًا وغير قابل للاستخراج العام.');
  }

  if (extension === 'xlsb') {
    warnings.push('صيغة XLSB غير مدعومة للمعالجة المباشرة. يرجى تحويل الملف إلى XLSX');
  }

  if (extension === 'doc') {
    warnings.push('صيغة DOC القديمة غير مدعومة بالكامل. يرجى تحويل الملف إلى DOCX');
  }

  return {
    format: detectedFormat,
    category: FORMAT_TO_CATEGORY[detectedFormat],
    extension,
    mime: FORMAT_TO_MIME[detectedFormat],
    magicBytes: hex,
    isMatch,
    mismatch,
    warnings,
  };
}

export function getCategoryIcon(category: FileCategory): string {
  switch (category) {
    case 'spreadsheet': return 'spreadsheet';
    case 'text': return 'text';
    case 'document': return 'document';
    case 'image': return 'image';
    case 'archive': return 'archive';
    default: return 'unknown';
  }
}
