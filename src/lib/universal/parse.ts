import Papa from "papaparse";
import type { Cell, RawTable } from "./types";

const AR_DIGITS = /[٠-٩]/g;

export function toNumber(v: Cell): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(AR_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/٫/g, ".").replace(/٬/g, ",");
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[^\d.,\-+eE]/g, "");
  if (!s || !/\d/.test(s)) return null;
  if (s.includes(",") && s.includes(".")) s = s.replace(/,/g, "");
  else if (s.includes(",")) s = /,\d{3}(,|$)/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

export function toDate(v: Cell, allowSerial = false): Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    if (allowSerial && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000));
    return null;
  }
  const s = String(v).trim().replace(AR_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660));
  let m = s.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?/);
  if (m) return safe(+m[1]!, +m[2]!, m[3] ? +m[3] : 1);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let y = +m[3]!; if (y < 100) y += 2000;
    const a = +m[1]!, b = +m[2]!;
    return a > 12 ? safe(y, b, a) : b > 12 ? safe(y, a, b) : safe(y, b, a); // default day-first (Arabic locale)
  }
  m = s.match(/^(\d{1,2})[-/](\d{4})$/);
  if (m) return safe(+m[2]!, +m[1]!, 1);
  return null;
}

function safe(y: number, mo: number, d: number): Date | null {
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo - 1, d));
}

/** Detect the header row: first row in the top 15 with the most non-empty text cells. */
function detectHeader(grid: Cell[][]): number {
  let best = 0, bestScore = -1;
  for (let i = 0; i < Math.min(15, grid.length); i++) {
    const row = grid[i] ?? [];
    const filled = row.filter((c) => c !== null && String(c).trim() !== "");
    const texty = filled.filter((c) => typeof c === "string" && toNumber(c) === null).length;
    const score = texty * 2 + filled.length;
    if (score > bestScore && filled.length >= 2) { best = i; bestScore = score; }
  }
  return best;
}

export function gridToTable(grid: Cell[][], sheet: string | null): RawTable {
  const h = detectHeader(grid);
  const rawHeaders = (grid[h] ?? []).map((c, i) => (c === null || String(c).trim() === "" ? `عمود ${i + 1}` : String(c).trim()));
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((x) => {
    const n = seen.get(x) ?? 0; seen.set(x, n + 1);
    return n ? `${x} (${n + 1})` : x;
  });
  const rows: Cell[][] = [];
  const sourceRows: number[] = [];
  for (let i = h + 1; i < grid.length; i++) {
    const r = grid[i] ?? [];
    if (!r.some((c) => c !== null && String(c).trim() !== "")) continue;
    const first = String(r.find((c) => c !== null && String(c).trim() !== "") ?? "");
    // drop subtotal/total footer rows — they double count
    if (/^(الإجمالي|الاجمالي|المجموع|إجمالي عام|total|grand total|subtotal)\b/i.test(first.trim())) continue;
    rows.push(headers.map((_, j) => normalizeCell(r[j])));
    sourceRows.push(i + 1);
  }
  return { sheet, headers, rows, sourceRows, headerRow: h + 1 };
}

function normalizeCell(c: unknown): Cell {
  if (c === undefined || c === null) return null;
  if (typeof c === "number") return c;
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  const s = String(c).trim();
  return s === "" ? null : s;
}

export async function parseFile(file: File): Promise<RawTable[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt") || name.endsWith(".tsv")) {
    const text = await file.text();
    return [parseCsvText(text)];
  }
  if (/\.(xlsx|xlsm|xls|ods)$/.test(name)) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const out: RawTable[] = [];
    for (const sn of wb.SheetNames) {
      const ws = wb.Sheets[sn];
      if (!ws) continue;
      const grid = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: null }) as Cell[][];
      const t = gridToTable(grid, sn);
      if (t.rows.length) out.push(t);
    }
    return out;
  }
  if (name.endsWith(".json")) {
    const data = JSON.parse(await file.text());
    const arr: Record<string, unknown>[] = Array.isArray(data) ? data : Object.values(data).find(Array.isArray) as Record<string, unknown>[] ?? [];
    const headers = [...new Set(arr.flatMap((o) => Object.keys(o ?? {})))];
    return [gridToTable([headers, ...arr.map((o) => headers.map((h) => (o?.[h] ?? null) as Cell))], null)];
  }
  throw new Error("UNSUPPORTED_FORMAT");
}

export function parseCsvText(text: string): RawTable {
  const res = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), { skipEmptyLines: false });
  return gridToTable(res.data as Cell[][], null);
}

export async function sha256(file: File): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
