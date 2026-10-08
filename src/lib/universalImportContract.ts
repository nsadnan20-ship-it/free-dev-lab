import type { SourceKind } from './universalDataContract';

export type ImportCapability = 'tabular' | 'document' | 'ocr' | 'table-extraction';

export interface ImportProfile {
  id: string;
  label: string;
  target: 'auto';
  requiredAliases: string[][];
  optionalAliases?: string[][];
  capabilities: ImportCapability[];
}

export interface ImportRoute {
  sourceKind: SourceKind;
  capabilities: ImportCapability[];
  parser: 'xlsx' | 'csv' | 'pdf-text' | 'pdf-table' | 'docx' | 'image-ocr' | 'api' | 'database' | 'manual';
  deterministic: boolean;
}

export const IMPORT_ROUTES: ImportRoute[] = [
  { sourceKind: 'excel', capabilities: ['tabular'], parser: 'xlsx', deterministic: true },
  { sourceKind: 'csv', capabilities: ['tabular'], parser: 'csv', deterministic: true },
  { sourceKind: 'pdf', capabilities: ['document', 'table-extraction'], parser: 'pdf-table', deterministic: true },
  { sourceKind: 'word', capabilities: ['document', 'table-extraction'], parser: 'docx', deterministic: true },
  { sourceKind: 'image', capabilities: ['document', 'ocr', 'table-extraction'], parser: 'image-ocr', deterministic: false },
  { sourceKind: 'api', capabilities: ['tabular'], parser: 'api', deterministic: true },
  { sourceKind: 'database', capabilities: ['tabular'], parser: 'database', deterministic: true },
  { sourceKind: 'manual', capabilities: ['tabular'], parser: 'manual', deterministic: true },
];

export const IMPORT_PROFILES: ImportProfile[] = [
  {
    id: 'automatic',
    label: 'اكتشاف تلقائي',
    target: 'auto',
    requiredAliases: [],
    optionalAliases: [],
    capabilities: ['tabular', 'document', 'ocr', 'table-extraction'],
  },
];

export function resolveImportRoute(sourceKind: SourceKind): ImportRoute {
  const route = IMPORT_ROUTES.find(item => item.sourceKind === sourceKind);
  if (!route) throw new Error(`Unsupported import source: ${sourceKind}`);
  return route;
}

export function matchImportProfile(
  headers: string[],
  target: ImportProfile['target'] = 'auto',
): { profile: ImportProfile; matched: Record<string, string>; missing: string[][] }[] {
  void headers;
  void target;
  const profile = IMPORT_PROFILES[0];
  return [{ profile, matched: {}, missing: [] }];
}
