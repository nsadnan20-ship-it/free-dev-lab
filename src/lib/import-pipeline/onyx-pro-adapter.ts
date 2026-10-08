import { findOnyxHeaders, ONYX_PRO_HEADER_CATALOG, type OnyxReportKind } from './onyx-pro-header-catalog';

type Row = Record<string, unknown>;

export interface OnyxAdaptedDataset {
  kind: OnyxReportKind;
  matchedHeaders: string[];
  canonicalHeaders: string[];
  rows: Row[];
  unknownHeaders: string[];
  confidence: number;
}

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFKC').replace(/[ً-ٟ]/g, '').replace(/[\s_\-./\\]+/g, ' ').trim();
}

function matchHeader(header: string) {
  const normalized = normalize(header);
  return ONYX_PRO_HEADER_CATALOG.find(def => def.aliases.some(alias => normalize(alias) === normalized));
}

function detectKind(matches: Array<{ kind: OnyxReportKind[] }>): OnyxReportKind {
  const scores = new Map<OnyxReportKind, number>();
  for (const match of matches) for (const kind of match.kind) scores.set(kind, (scores.get(kind) ?? 0) + 1);
  return [...scores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';
}

export function adaptOnyxRows(headers: string[], rows: Row[]): OnyxAdaptedDataset {
  const definitions = headers.map(matchHeader);
  const known = definitions.filter((x): x is NonNullable<typeof x> => Boolean(x));
  const kind = detectKind(known);
  const knownHeaderCount = known.length;
  const confidence = headers.length ? Math.round((knownHeaderCount / headers.length) * 100) : 0;
  const unknownHeaders = headers.filter((header, index) => !definitions[index]);
  const canonicalHeaders = [...new Set(known.map(def => def.canonical))];

  const rowsOut = rows.map(row => {
    const canonical: Row = {};
    for (const header of headers) {
      const definition = matchHeader(header);
      if (!definition) continue;
      const value = row[header];
      if (value === '' || value === null || value === undefined) continue;
      if (canonical[definition.canonical] === undefined) canonical[definition.canonical] = value;
    }
    return canonical;
  });

  return {
    kind,
    matchedHeaders: headers.filter((_, index) => Boolean(definitions[index])),
    canonicalHeaders,
    rows: rowsOut,
    unknownHeaders,
    confidence,
  };
}

export function isOnyxDataset(headers: string[]): boolean {
  return findOnyxHeaders(headers).length >= 2;
}
