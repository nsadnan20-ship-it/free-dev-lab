import type { Dataset } from './types';
import { buildDataset } from './adapters';

/** Retain every sheet/table and its row identity without losing distinct columns. */
export async function combineSourceDatasets(datasets: Dataset[]): Promise<Dataset | null> {
  const nonEmpty = datasets.filter((dataset) => dataset.rows.length > 0);
  const first = nonEmpty[0];
  if (!first) return null;
  if (nonEmpty.length === 1) return first;
  const rows = nonEmpty.flatMap((dataset, index) => dataset.rows.map((row, rowIndex) => ({
    ...row,
    _source_dataset: index + 1,
    _source_sheet: dataset.sheet ?? dataset.name,
    _source_row: rowIndex + 1,
  })));
  const combined = await buildDataset(rows, first.source, first.source);
  combined.qualityScore = Math.round(nonEmpty.reduce((sum, d) => sum + d.qualityScore * d.rows.length, 0) / rows.length);
  return combined;
}