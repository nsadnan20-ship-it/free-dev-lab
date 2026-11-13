import { analyzeTable } from './pipeline';
import type { AnalysisResult, RawTable } from './types';

/** Evaluate each table independently; never pool measures across unrelated sheets. */
export function analyzeWorkbook(tables: RawTable[], fileName: string, priorSameSignature = 0): AnalysisResult {
  const datasets = tables.filter((table) => table.rows.length > 0).map((table, index) => {
    const result = analyzeTable(table, fileName, { priorSameSignature });
    const key = `dataset-${index + 1}:`;
    return {
      ...result,
      insights: result.insights.map((insight) => ({ ...insight, id: key + insight.id })),
      tasks: result.tasks.map((task) => ({ ...task, id: key + task.id, findingId: key + task.findingId })),
    };
  });
  const first = datasets[0];
  if (!first) throw new Error('لم يتم العثور على صفوف بيانات قابلة للتحليل في الملف');
  return {
    ...first,
    rowCount: datasets.reduce((total, dataset) => total + dataset.rowCount, 0),
    insights: datasets.flatMap((dataset) => dataset.insights),
    tasks: datasets.flatMap((dataset) => dataset.tasks.map((task) => ({
      ...task,
      detail: datasets.length > 1 ? `المصدر: ${dataset.sheet ?? 'جدول'} — ${task.detail}` : task.detail,
    }))),
    datasets,
  };
}