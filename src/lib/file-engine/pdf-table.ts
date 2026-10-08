import { detectHeaderRow, rowsFromDetectedHeader, type HeaderCandidate } from './header-detection.ts';

export type PdfTextToken = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PdfPageText = {
  pageNumber: number;
  items: PdfTextToken[];
  pageWidth?: number;
  pageHeight?: number;
};

export type PdfTableExtraction = {
  headers: string[];
  rows: Array<Record<string, unknown>>;
  confidence: number;
  pageCount: number;
  headerPage: number;
};

export type PdfVisualLine = {
  pageNumber: number;
  lineNumber: number;
  text: string;
};

export type PdfVisualRow = {
  pageNumber: number;
  lineNumber: number;
  cells: string[];
};

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function groupVisualLines(items: PdfTextToken[]): PdfTextToken[][] {
  const usable = items
    .filter((item) => item.text.trim())
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: Array<{ y: number; tokens: PdfTextToken[] }> = [];
  const heights = usable.map((item) => Math.max(1, item.height)).filter(Number.isFinite);
  const yTolerance = Math.max(2.5, median(heights) * 0.55);

  for (const item of usable) {
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= yTolerance);
    if (line) {
      line.tokens.push(item);
      line.y = line.tokens.reduce((sum, token) => sum + token.y, 0) / line.tokens.length;
    } else {
      lines.push({ y: item.y, tokens: [item] });
    }
  }

  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) => line.tokens.sort((a, b) => a.x - b.x));
}

function splitVisualLine(tokens: PdfTextToken[]): string[] {
  const ordered = [...tokens].sort((a, b) => a.x - b.x);
  if (!ordered.length) return [];

  const widths = ordered.map((item) => Math.max(1, finiteNumber(item.width, item.text.length * 4)));
  const medianWidth = Math.max(2, median(widths));
  const gaps = ordered.slice(1).map((item, index) => {
    const previous = ordered[index];
    return item.x - (previous.x + previous.width);
  }).filter((gap) => Number.isFinite(gap) && gap >= 0);

  const medianGap = median(gaps.filter((gap) => gap > 0));
  // Column boundaries in real PDFs can be only slightly wider than the token width.
  // A threshold based on ~1.10x token width preserves normal word spacing while
  // separating adjacent visual columns in compact tables with uneven cell widths.
  const largeGapThreshold = Math.max(6, medianWidth * 1.1, medianGap > 0 ? medianGap * 0.75 : 0);

  const cells: string[] = [];
  let current = '';

  ordered.forEach((item, index) => {
    if (index === 0) {
      current = item.text.trim();
      return;
    }
    const previous = ordered[index - 1];
    const gap = item.x - (previous.x + previous.width);
    const split = gap >= largeGapThreshold;
    if (split && current.trim()) {
      cells.push(current.trim());
      current = item.text.trim();
    } else {
      current = current ? current + ' ' + item.text.trim() : item.text.trim();
    }
  });

  if (current.trim()) cells.push(current.trim());
  return cells;
}

function groupVisualLinesInSourceOrder(items: PdfTextToken[]): PdfTextToken[][] {
  const usable = items.filter((item) => item.text.trim());
  const lines: Array<{ y: number; tokens: PdfTextToken[] }> = [];
  const heights = usable.map((item) => Math.max(1, item.height)).filter(Number.isFinite);
  const yTolerance = Math.max(2.5, median(heights) * 0.55);

  for (const item of usable) {
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= yTolerance);
    if (line) {
      line.tokens.push(item);
      line.y = line.tokens.reduce((sum, token) => sum + token.y, 0) / line.tokens.length;
    } else {
      lines.push({ y: item.y, tokens: [item] });
    }
  }

  return lines.map((line) => line.tokens.sort((a, b) => a.x - b.x));
}

function pageMatrix(page: PdfPageText): string[][] {
  return groupVisualLines(page.items)
    .map(splitVisualLine)
    .filter((row) => row.length > 0);
}

/**
 * Preserve page and visual-line boundaries when a PDF is not a reconstructable table.
 * Joining every TextItem with spaces collapses an entire page into one phrase and
 * destroys the evidence needed for downstream document understanding.
 */
export function extractPdfVisualRows(pages: PdfPageText[]): PdfVisualRow[] {
  const rows: PdfVisualRow[] = [];
  for (const page of pages) {
    groupVisualLines(page.items).forEach((tokens, index) => {
      const cells = splitVisualLine(tokens).map((cell) => cell.trim()).filter(Boolean);
      if (cells.length) rows.push({ pageNumber: page.pageNumber, lineNumber: index + 1, cells });
    });
  }
  return rows;
}

export function extractPdfVisualLines(pages: PdfPageText[]): PdfVisualLine[] {
  return extractPdfVisualRows(pages).map((row) => ({
    pageNumber: row.pageNumber,
    lineNumber: row.lineNumber,
    text: row.cells.join(' | '),
  }));
}


// Fixed-layout extractor for the Arabic sales report template produced by the ERP/PDF
// source used by Aghbari. It is coordinate-driven, not token-gap-driven: the PDF
// repeats the same eleven vertical bands on every landscape page. We keep the
// generic extractor below as a fallback for other document families.
export type ArabicSalesLayoutRow = Record<string, unknown>;

const ARABIC_SALES_HEADERS = [
  'مبلغ الصافي بالمحلي',
  'اجمالي الفاتورة',
  'الضريبة',
  'الأعباء',
  'الخصم',
  'مبلغ الفاتورة',
  'اسم العميل',
  'العملة',
  'نوع الفاتورة',
  'التاريخ',
  'رقم الفاتورة',
] as const;

const ARABIC_SALES_CANONICAL_KEYS = [
  'net_local',
  'total',
  'tax_amount',
  'burden_amount',
  'discount',
  'invoice_amount',
  'customer_name',
  'currency',
  'invoice_type',
  'invoice_date',
  'invoice_number',
] as const;

// Base coordinates measured from the real landscape report (841.92pt wide).
// They are scaled to the page width at runtime, so the extractor survives PDF
// producer changes that preserve the same relative layout.
const ARABIC_SALES_X_BANDS: Array<[number, number]> = [
  [45, 145],
  [140, 235],
  [230, 285],
  [280, 345],
  [340, 415],
  [405, 505],
  [485, 630],
  [625, 660],
  [655, 710],
  [708, 765],
  [760, 830],
];

function normalizeArabicDigitsForPdf(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
}

function canonicalDateText(value: string): string {
  const normalized = normalizeArabicDigitsForPdf(value).replace(/\s+/g, '');
  const match = normalized.match(/(\d{1,4})[/-](\d{1,2})[/-](\d{1,4})/);
  if (!match) return normalized;
  const [, first, second, third] = match;
  if (first.length === 4) return `${first}-${second.padStart(2, '0')}-${third.padStart(2, '0')}`;
  return `${third.padStart(4, '0')}-${second.padStart(2, '0')}-${first.padStart(2, '0')}`;
}

function looksLikeArabicSalesDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(canonicalDateText(value));
}

function looksLikeInvoiceNumber(value: string): boolean {
  const normalized = normalizeArabicDigitsForPdf(value).replace(/[,\s]/g, '');
  return /^\d{1,12}$/.test(normalized);
}

function looksLikeInvoiceType(value: string): boolean {
  const normalized = value.normalize('NFKC').trim().toLowerCase();
  if (!normalized) return false;
  return !/^(نوع\s*الفاتورة|التاريخ|رقم\s*الفاتورة|الفاتورة|العملة)$/i.test(normalized);
}


function tokenTextForBand(tokens: PdfTextToken[], reverse = false): string {
  const ordered = [...tokens].sort((a, b) => reverse ? b.x - a.x : a.x - b.x);
  return ordered.map((token) => token.text.normalize('NFKC').trim()).filter(Boolean).join(' ').trim();
}

function scaledArabicSalesBands(pageWidth: number): Array<[number, number]> {
  const scale = pageWidth > 0 ? pageWidth / 841.92 : 1;
  return ARABIC_SALES_X_BANDS.map(([left, right]) => [left * scale, right * scale]);
}

function findArabicSalesHeader(page: PdfPageText): boolean {
  const topTokens = page.items.filter((token) => token.y < 150);
  const text = topTokens.map((token) => token.text).join(' ');
  const requiredHints = ['الفاتورة', 'التاريخ', 'العميل', 'العملة', 'مبلغ', 'الخصم', 'الضريبة'];
  return requiredHints.filter((hint) => text.includes(hint)).length >= 5;
}

function extractArabicSalesTableFromPage(
  page: PdfPageText,
  bands: Array<[number, number]>,
): ArabicSalesLayoutRow[] {
  const lines = groupVisualLinesInSourceOrder(page.items);
  const rows: ArabicSalesLayoutRow[] = [];

  for (const tokens of lines) {
    if (!tokens.length) continue;
    const lineY = median(tokens.map((token) => token.y));
    if (lineY < 130 || lineY > Math.max(540, (page.pageHeight ?? 595) - 35)) continue;

    const cells: PdfTextToken[][] = Array.from({ length: bands.length }, () => []);
    for (const token of tokens) {
      const centerX = token.x + token.width / 2;
      const bandIndex = bands.findIndex(([left, right]) => centerX >= left && centerX <= right);
      if (bandIndex >= 0) cells[bandIndex].push(token);
    }

    const values = cells.map((band, index) => {
      // Arabic text is encoded visually right-to-left in this PDF. Numeric cells,
      // currency, and dates are safer left-to-right; customer text is reconstructed RTL.
      const reverse = index === 6;
      const value = tokenTextForBand(band, reverse);
      if (index === 9) return canonicalDateText(value);
      if (index === 10) return normalizeArabicDigitsForPdf(value).replace(/[,\s]/g, '');
      return value;
    });

    const invoiceNumber = values[10];
    const invoiceDate = values[9];
    const invoiceType = values[8];
    if (!looksLikeInvoiceNumber(invoiceNumber)) continue;
    if (!looksLikeArabicSalesDate(invoiceDate)) continue;
    if (!looksLikeInvoiceType(invoiceType)) continue;

    const row: ArabicSalesLayoutRow = {};
    values.forEach((value, index) => {
      row[ARABIC_SALES_HEADERS[index]] = value || null;
      row[ARABIC_SALES_CANONICAL_KEYS[index]] = value || null;
    });
    row.invoice_number = Number(invoiceNumber);
    row.invoice_date = invoiceDate;
    row.date = invoiceDate;
    row.invoice_type = invoiceType;
    row.customer_name = values[6] || null;
    row.currency = values[7] || null;
    rows.push(row);
  }
  return rows;
}

export function extractArabicSalesTable(
  pages: PdfPageText[],
): PdfTableExtraction | null {
  const targetPages = pages.filter(findArabicSalesHeader);
  if (!targetPages.length) return null;

  const rows = targetPages.flatMap((page) =>
    extractArabicSalesTableFromPage(
      page,
      scaledArabicSalesBands(page.pageWidth ?? 841.92),
    ),
  );
  if (rows.length < 2) return null;

  return {
    headers: [...ARABIC_SALES_HEADERS],
    rows,
    confidence: Math.min(100, 95 + (rows.length >= 20 ? 4 : 0)),
    pageCount: pages.length,
    headerPage: targetPages[0].pageNumber,
  };
}

function normalizedHeaderKey(values: string[]): string {
  return values
    .map((value) => value.replace(/[\s_\-./]+/g, '').toLowerCase())
    .join('|');
}

function selectHeaderCandidate(
  candidates: Array<{ pageNumber: number; candidate: HeaderCandidate; matrix: string[][] }>,
): { pageNumber: number; candidate: HeaderCandidate; matrix: string[][] } | null {
  return [...candidates]
    .filter((entry) => entry.candidate.headers.length >= 2)
    .filter((entry) => !entry.candidate.structurallySuspicious)
    .filter((entry) => entry.matrix.length > entry.candidate.rowIndex + 1)
    .sort((a, b) => {
      const aRows = a.matrix.length - a.candidate.rowIndex - 1;
      const bRows = b.matrix.length - b.candidate.rowIndex - 1;
      const aScore = a.candidate.score + Math.min(aRows, 50) * 0.35;
      const bScore = b.candidate.score + Math.min(bRows, 50) * 0.35;
      return bScore - aScore || a.pageNumber - b.pageNumber;
    })[0] ?? null;
}

function looksLikeSameHeader(candidate: string[], expected: string[]): boolean {
  if (candidate.length !== expected.length) return false;
  const a = normalizedHeaderKey(candidate);
  const b = normalizedHeaderKey(expected);
  if (a === b) return true;
  const overlap = candidate.filter((value, index) => {
    const left = value.replace(/[\s_\-./]+/g, '').toLowerCase();
    const right = expected[index].replace(/[\s_\-./]+/g, '').toLowerCase();
    return left === right || left.includes(right) || right.includes(left);
  }).length;
  return overlap >= Math.max(2, Math.ceil(expected.length * 0.7));
}

export function extractPdfTable(
  pages: PdfPageText[],
  minimumRows = 2,
): PdfTableExtraction | null {
  const matrices = pages.map((page) => ({ page, matrix: pageMatrix(page) }));
  const candidateEntries: Array<{ pageNumber: number; candidate: HeaderCandidate; matrix: string[][] }> = [];

  for (const { page, matrix } of matrices) {
    const candidate = detectHeaderRow(matrix);
    if (candidate) candidateEntries.push({ pageNumber: page.pageNumber, candidate, matrix });
  }

  const selected = selectHeaderCandidate(candidateEntries);
  if (!selected || selected.candidate.score < 35) return null;

  const headers = selected.candidate.headers.map((header, index) => header || `column_${index + 1}`);
  const rows: Array<Record<string, unknown>> = [];

  for (const { page, matrix } of matrices) {
    const candidate = candidateEntries.find((entry) => entry.pageNumber === page.pageNumber)?.candidate ?? null;
    let pageRows: Record<string, unknown>[] = [];

    if (candidate && looksLikeSameHeader(candidate.headers, headers)) {
      pageRows = rowsFromDetectedHeader(matrix, candidate);
    } else {
      const start = page.pageNumber === selected.pageNumber ? selected.candidate.rowIndex + 1 : 0;
      const compatible = matrix
        .slice(start)
        .filter((row) => row.length === headers.length)
        .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
      pageRows = compatible;
    }

    for (const row of pageRows) {
      const values = Object.values(row).map((value) => String(value ?? '').trim());
      if (!values.some(Boolean)) continue;
      if (looksLikeSameHeader(values, headers)) continue;
      rows.push(row);
    }
  }

  if (rows.length < minimumRows) return null;

  return {
    headers,
    rows,
    confidence: Math.min(100, Math.round(selected.candidate.score)),
    pageCount: pages.length,
    headerPage: selected.pageNumber,
  };
}