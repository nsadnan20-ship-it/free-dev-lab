import { describe, expect, it } from 'vitest';
import { analyzeWorkbook } from '@/lib/universal/workbook';
import { parseCsvText } from '@/lib/universal/parse';

describe('complete workbook analysis', () => {
  const sales = { ...parseCsvText('Product,Revenue\nA,100\nB,200\nC,300'), sheet: 'Sales' };
  const stock = { ...parseCsvText('Product,Stock\nA,2\nB,4'), sheet: 'Stock' };

  it('retains all five rows across both sheets', () => {
    const result = analyzeWorkbook([sales, stock], 'full.xlsx');
    expect(result.rowCount).toBe(5);
    expect(result.datasets?.map((dataset) => dataset.sheet)).toEqual(['Sales', 'Stock']);
    expect(result.datasets?.map((dataset) => dataset.rowCount)).toEqual([3, 2]);
  });
  it('keeps unrelated measures separate', () => {
    const result = analyzeWorkbook([sales, stock], 'full.xlsx');
    expect(result.datasets?.[0]?.columns.find((column) => column.name === 'Revenue')?.sum).toBe(600);
    expect(result.datasets?.[1]?.columns.find((column) => column.name === 'Stock')?.sum).toBe(6);
    expect(result.datasets?.[1]?.columns.some((column) => column.name === 'Revenue')).toBe(false);
  });
  it('namespaces findings and task references by dataset', () => {
    const result = analyzeWorkbook([sales, { ...sales, sheet: 'Other sales' }], 'full.xlsx');
    expect(result.insights.length).toBeGreaterThan(0);
    expect(new Set(result.insights.map((insight) => insight.id)).size).toBe(result.insights.length);
    expect(result.tasks.length).toBeGreaterThan(0);
    for (const task of result.tasks) expect(result.insights.some((insight) => insight.id === task.findingId)).toBe(true);
  });
});