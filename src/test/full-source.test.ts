import { describe, expect, it } from 'vitest';
import { buildDataset } from '@/lib/file-engine/adapters';
import { combineSourceDatasets } from '@/lib/file-engine/full-source';
import { extractArabicSalesTable, type PdfPageText } from '@/lib/file-engine/pdf-table';

describe('complete source coverage', () => {
  it('retains every row and distinct column from two sheets', async () => {
    const first = await buildDataset([{ sales: 10 }], 'Sales', 'book.xlsx', 'Sales');
    const second = await buildDataset([{ stock: 7 }, { stock: 9 }], 'Stock', 'book.xlsx', 'Stock');
    const result = await combineSourceDatasets([first, second]);
    expect(result?.rowCount).toBe(3);
    expect(result?.columns.map((c) => c.name)).toContain('stock');
    expect(result?.rows[2]).toMatchObject({ stock: 9, _source_sheet: 'Stock', _source_row: 2 });
  });
  it('reads continuation PDF pages without repeated headers', () => {
    const tokens = (invoice: string, y: number) => [
      { text: '100', x: 70 }, { text: '100', x: 170 }, { text: '0', x: 250 },
      { text: '0', x: 300 }, { text: '0', x: 370 }, { text: '100', x: 440 },
      { text: 'عميل', x: 530 }, { text: 'YER', x: 635 }, { text: 'نقد', x: 680 },
      { text: '2026-01-01', x: 715 }, { text: invoice, x: 780 },
    ].map((t) => ({ ...t, y, width: 10, height: 10 }));
    const pages: PdfPageText[] = [
      { pageNumber: 1, pageWidth: 841.92, pageHeight: 595, items: [
        { text: 'الفاتورة التاريخ العميل العملة مبلغ الخصم الضريبة', x: 50, y: 50, width: 100, height: 10 }, ...tokens('101', 160),
      ] },
      { pageNumber: 2, pageWidth: 841.92, pageHeight: 595, items: tokens('102', 50) },
    ];
    const result = extractArabicSalesTable(pages);
    expect(result?.rows.map((r) => r.invoice_number)).toEqual([101, 102]);
    expect(result?.rows[1].page_number).toBe(2);
  });
});