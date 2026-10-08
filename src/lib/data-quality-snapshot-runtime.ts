import { supabase } from './supabase';
import {
  validateDataQualitySnapshot,
  type DataQualitySnapshot,
  type EntityQuality,
  type QualityIssue,
} from './data-quality-snapshot-core';

export type { DataQualitySnapshot, EntityQuality, QualityIssue } from './data-quality-snapshot-core';
export { validateDataQualitySnapshot } from './data-quality-snapshot-core';

export async function fetchDataQualitySnapshot(): Promise<DataQualitySnapshot> {
  const { data, error } = await supabase.rpc('get_data_quality_snapshot');
  if (error) throw error;
  return validateDataQualitySnapshot(data);
}
