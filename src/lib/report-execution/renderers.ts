import * as XLSX from 'xlsx';
import type { ReportOutputFormat } from './report-execution-contract';

export interface ReportRow { [key: string]: unknown }
export interface RenderInput { reportId: string; title: string; columns: string[]; rows: ReportRow[]; generatedAt: string; }
export interface RenderedArtifact { format: ReportOutputFormat; mimeType: string; fileName: string; contentBase64: string; }

function escapeHtml(value: unknown): string { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;'); }
function bytesToBase64(bytes: Uint8Array): string { let binary = ''; const chunk = 0x8000; for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk)); return btoa(binary); }
function textToBase64(text: string): string { return bytesToBase64(new TextEncoder().encode(text)); }

export function renderWeb(input: RenderInput): RenderedArtifact {
  const head = input.columns.map(c => `<th>${escapeHtml(c)}</th>`).join('');
  const body = input.rows.map(row => `<tr>${input.columns.map(c => `<td>${escapeHtml(row[c])}</td>`).join('')}</tr>`).join('');
  const html = `<!doctype html><html dir="rtl"><meta charset="utf-8"><title>${escapeHtml(input.title)}</title><body><h1>${escapeHtml(input.title)}</h1><p>${escapeHtml(input.generatedAt)}</p><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
  return { format: 'web', mimeType: 'text/html; charset=utf-8', fileName: `${input.reportId}.html`, contentBase64: textToBase64(html) };
}

export function renderXlsx(input: RenderInput): RenderedArtifact {
  const rows = input.rows.map(row => Object.fromEntries(input.columns.map(c => [c, row[c] ?? ''])));
  const sheet = XLSX.utils.json_to_sheet(rows, { header: input.columns });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Report');
  const output = XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return { format: 'xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileName: `${input.reportId}.xlsx`, contentBase64: bytesToBase64(new Uint8Array(output)) };
}

function pdfEscape(value: string): string { return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[\r\n]+/g, ' '); }

export function renderPdf(input: RenderInput): RenderedArtifact {
  const rowLines = input.rows.map(row => input.columns.map(c => `${c}: ${row[c] ?? ''}`).join(' | '));
  const pageLines = 42;
  const chunks: string[][] = [];
  for (let i = 0; i < rowLines.length || i === 0; i += pageLines) chunks.push(rowLines.slice(i, i + pageLines));
  const objects: string[] = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const pageRefs: number[] = [];
  for (const chunk of chunks) {
    const lines = [input.title, input.generatedAt, ...chunk];
    const commands = ['BT', '/F1 10 Tf', '50 780 Td', ...lines.map((line, i) => `${i ? '0 -16 Td ' : ''}(${pdfEscape(line.slice(0, 180))}) Tj`), 'ET'].join('\n');
    const pageObjectNumber = objects.length + 1;
    const contentObjectNumber = pageObjectNumber + 1;
    pageRefs.push(pageObjectNumber);
    const commandBytes = new TextEncoder().encode(commands).byteLength;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`);
    objects.push(`<< /Length ${commandBytes} >>\nstream\n${commands}\nendstream`);
  }
  objects[1] = `<< /Type /Pages /Kids [${pageRefs.map(n => `${n} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`;
  let pdf = '%PDF-1.4\n'; const offsets: number[] = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(new TextEncoder().encode(pdf).byteLength); pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = new TextEncoder().encode(pdf).byteLength; pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`; for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return { format: 'pdf', mimeType: 'application/pdf', fileName: `${input.reportId}.pdf`, contentBase64: textToBase64(pdf) };
}

export function renderArtifact(format: ReportOutputFormat, input: RenderInput): RenderedArtifact {
  if (format === 'web') return renderWeb(input);
  if (format === 'xlsx') return renderXlsx(input);
  return renderPdf(input);
}
