import { normalizeBusinessKey } from './business-key.ts';

export type ImportDecision = 'new' | 'update' | 'unchanged' | 'conflict' | 'invalid';
export type NullPolicy = 'reject' | 'allow' | 'default';

export interface ImportClassifierOptions<T extends Record<string, unknown>> {
  incomingRows: T[];
  existingRows: T[];
  matchingKeys: string[];
  requiredFields?: string[];
  nullPolicy?: NullPolicy;
  conflictResolution?: 'skip' | 'update' | 'overwrite';
  defaultValues?: Partial<T>;
}

export interface ImportClassification<T extends Record<string, unknown>> {
  rowIndex: number;
  decision: ImportDecision;
  businessKey: string;
  existingRow: T | null;
  row: T;
  changedFields: string[];
  ignoredNullFields: string[];
  errors: string[];
}

export interface ImportPreview<T extends Record<string, unknown>> {
  total: number;
  newCount: number;
  updateCount: number;
  unchangedCount: number;
  conflictCount: number;
  invalidCount: number;
  rows: ImportClassification<T>[];
  writesAllowed: false;
}

function keyFor<T extends Record<string, unknown>>(row: T, keys: string[]): string {
  return keys.map(key => normalizeBusinessKey(row[key])).join('|');
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function changedFields<T extends Record<string, unknown>>(incoming: T, existing: T, keys: string[]): string[] {
  const fields = new Set([...Object.keys(incoming), ...Object.keys(existing)]);
  return [...fields].filter(field => !keys.includes(field) && !isBlank(incoming[field]) && String(incoming[field]) !== String(existing[field]));
}

export function classifyImport<T extends Record<string, unknown>>(options: ImportClassifierOptions<T>): ImportPreview<T> {
  const matchingKeys = options.matchingKeys.filter(Boolean);
  if (!matchingKeys.length) throw new Error('At least one matching key is required');

  const index = new Map<string, T[]>();
  for (const row of options.existingRows) {
    const key = keyFor(row, matchingKeys);
    if (!key.replace(/\|/g, '')) continue;
    const bucket = index.get(key) ?? [];
    bucket.push(row);
    index.set(key, bucket);
  }

  const seenIncoming = new Set<string>();
  const rows = options.incomingRows.map((row, rowIndex) => {
    const businessKey = keyFor(row, matchingKeys);
    const errors: string[] = [];
    const ignoredNullFields: string[] = [];
    const duplicateIncoming = businessKey.replace(/\|/g, '') !== '' && seenIncoming.has(businessKey);
    const requiredFields = options.requiredFields ?? [];

    for (const field of requiredFields) {
      if (isBlank(row[field])) errors.push(`Missing required field: ${field}`);
    }

    if (!businessKey.replace(/\|/g, '')) errors.push('Missing business key');
    seenIncoming.add(businessKey);

    const matches = index.get(businessKey) ?? [];
    if (matches.length > 1) errors.push('Business key matches multiple existing rows');
    const existingRow = matches[0] ?? null;

    for (const [field, value] of Object.entries(row)) {
      if (!isBlank(value)) continue;
      if (options.nullPolicy === 'reject' && !requiredFields.includes(field)) {
        errors.push(`Null value rejected: ${field}`);
      } else if (options.nullPolicy === 'default' && options.defaultValues?.[field] !== undefined) {
        (row as Record<string, unknown>)[field] = options.defaultValues[field];
      } else if (existingRow && options.nullPolicy !== 'reject') {
        ignoredNullFields.push(field);
      }
    }

    let decision: ImportDecision;
    if (errors.length) {
      decision = 'invalid';
    } else if (duplicateIncoming || matches.length > 1) {
      decision = 'conflict';
    } else if (!existingRow) {
      decision = 'new';
    } else {
      const changes = changedFields(row, existingRow, matchingKeys);
      decision = changes.length ? 'update' : 'unchanged';
      if (decision === 'update' && options.conflictResolution === 'skip') decision = 'conflict';
    }

    return {
      rowIndex,
      decision,
      businessKey,
      existingRow,
      row,
      changedFields: existingRow ? changedFields(row, existingRow, matchingKeys) : [],
      ignoredNullFields,
      errors,
    };
  });

  return {
    total: rows.length,
    newCount: rows.filter(r => r.decision === 'new').length,
    updateCount: rows.filter(r => r.decision === 'update').length,
    unchangedCount: rows.filter(r => r.decision === 'unchanged').length,
    conflictCount: rows.filter(r => r.decision === 'conflict').length,
    invalidCount: rows.filter(r => r.decision === 'invalid').length,
    rows,
    writesAllowed: false,
  };
}
