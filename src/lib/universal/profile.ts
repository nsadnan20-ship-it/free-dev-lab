import { getCanonicalFieldDefinitions, matchCanonicalField } from "@/lib/report-intelligence/canonical-schema";
import { mapHeader } from "@/lib/report-intelligence/semantic-field-mapper";
import { toDate, toNumber } from "./parse";
import type { ColumnProfile, RawTable } from "./types";

export const normHeader = (h: string) =>
  h.trim().toLowerCase().replace(/[إأآ]/g, "ا").replace(/ة/g, "ه").replace(/[ًٌٍَُِّْ]/g, "").replace(/[\s_\-./()]+/g, "");

const FIELDS = new Map(getCanonicalFieldDefinitions().map((d: { field: string; type: string }) => [d.field.toLowerCase(), d]));
const MONETARY = /amount|value|price|cost|profit|revenue|sales|total|balance|paid|debit|credit|مبلغ|قيمه|قيمة|سعر|تكلف|ربح|مبيعات|ايراد|إيراد|رصيد|مدين|دائن|اجمالي|إجمالي|صافي/i;
const DATEISH = /date|time|month|period|day|تاريخ|شهر|فتره|فترة|يوم|سنه|سنة/i;
const IDISH = /(^|\b)(id|no|code|number|ref|sku)\b|رقم|كود|رمز|مرجع/i;

export function profileColumns(t: RawTable, learned: Record<string, string> = {}): ColumnProfile[] {
  return t.headers.map((name, index) => {
    const vals = t.rows.map((r) => r[index] ?? null);
    const nonNullVals = vals.filter((v) => v !== null);
    const nonNull = nonNullVals.length;
    const nums = nonNullVals.map(toNumber);
    const numOk = nums.filter((n): n is number => n !== null);
    const dateish = DATEISH.test(name);
    const dates = nonNullVals.map((v) => toDate(v, dateish));
    const dateOk = dates.filter(Boolean).length;
    const distinct = new Set(nonNullVals.map(String)).size;

    // semantic mapping: learned feedback > canonical field name > alias > fuzzy
    const key = normHeader(name);
    let field: string | null = null;
    let method: ColumnProfile["mappingMethod"] = "unmapped";
    let conf = 0;
    if (learned[key]) { field = learned[key]!; method = "learned"; conf = 1; }
    else if (FIELDS.has(name.trim().toLowerCase())) { field = (FIELDS.get(name.trim().toLowerCase()) as { field: string }).field; method = "exact"; conf = 1; }
    else {
      const m = matchCanonicalField(name);
      if (m) { field = m; method = "alias"; conf = 1; }
      else {
        const f = mapHeader(name);
        if (f.field) { field = f.field; method = "fuzzy"; conf = f.confidence; }
      }
    }
    const def = field ? (FIELDS.get(field.toLowerCase()) as { type: string } | undefined) : undefined;

    let kind: ColumnProfile["kind"];
    if (!nonNull) kind = "empty";
    else if (def?.type === "date" || (dateOk / nonNull >= 0.8 && (dateish || numOk.length / nonNull < 0.8))) kind = "date";
    else if (numOk.length / nonNull >= 0.85 && !(def?.type === "text")) {
      kind = IDISH.test(name) && distinct / nonNull > 0.95 ? "identifier" : "numeric";
    } else if (distinct / nonNull > 0.9 && nonNull > 20) kind = IDISH.test(name) || def?.type === "text" ? "identifier" : "text";
    else kind = "categorical";

    const p: ColumnProfile = {
      name, index, kind, field, mappingMethod: method, mappingConfidence: conf,
      mappingNeedsReview: method === "fuzzy" && conf < 0.85,
      nonNull, missing: vals.length - nonNull, distinct,
      sample: [...new Set(nonNullVals.slice(0, 50).map(String))].slice(0, 4),
      invalid: kind === "numeric" ? nonNull - numOk.length : kind === "date" ? nonNull - dateOk : 0,
    };
    if (kind === "numeric") {
      p.min = Math.min(...numOk); p.max = Math.max(...numOk);
      p.sum = numOk.reduce((s, x) => s + x, 0); p.mean = p.sum / (numOk.length || 1);
      p.negatives = numOk.filter((x) => x < 0).length;
      p.isMonetary = def?.type === "currency" || MONETARY.test(name);
    }
    return p;
  });
}

const DOMAIN_FIELDS: Record<string, string[]> = {
  sales: ["customerCode", "customerName", "salesRep", "salesQty", "sellingPrice", "targetAmount"],
  purchases: ["supplierCode", "supplierName", "purchaseQty", "orderedQty", "receivedQty", "leadTimeDays"],
  inventory: ["currentStock", "openingStock", "inbound", "outbound", "warehouse", "adjustmentQty"],
  finance: ["debit", "credit", "paidAmount", "dueDate", "accountCode", "accountName", "asset", "liability", "equity"],
  product: ["productCode", "productName", "category", "brand"],
};
const DOMAIN_WORDS: Record<string, RegExp> = {
  sales: /مبيع|عميل|زبون|sales|customer|revenue/i,
  purchases: /مشتري|مورد|purchase|supplier|vendor/i,
  inventory: /مخزون|مخزن|رصيد|stock|inventory|warehouse/i,
  finance: /مدين|دائن|حساب|قيد|سداد|تحصيل|debit|credit|ledger|cash|invoice|payment/i,
  hr: /موظف|راتب|حضور|إجازة|اجازه|employee|salary|attendance/i,
  operations: /طلب|شحن|توصيل|order|shipment|delivery|ticket|status|حالة/i,
};

export function detectDomains(cols: ColumnProfile[], fileName: string): string[] {
  const fields = new Set(cols.map((c) => c.field).filter(Boolean) as string[]);
  const text = `${fileName} ${cols.map((c) => c.name).join(" ")}`;
  const out = new Set<string>();
  for (const [d, fs] of Object.entries(DOMAIN_FIELDS)) if (fs.some((f) => fields.has(f))) out.add(d);
  for (const [d, re] of Object.entries(DOMAIN_WORDS)) if (re.test(text)) out.add(d);
  out.delete("product");
  return [...out];
}

const MEASURE_PRIORITY = ["netAmount", "grossAmount", "profit", "salesQty", "quantity", "paidAmount", "debit", "currentStock", "purchaseQty"];

export function pickRoles(cols: ColumnProfile[], rowCount: number) {
  const numeric = cols.filter((c) => c.kind === "numeric" && (c.nonNull ?? 0) > 0);
  const measures = [...numeric].sort((a, b) => {
    const pa = a.field ? MEASURE_PRIORITY.indexOf(a.field) : -1, pb = b.field ? MEASURE_PRIORITY.indexOf(b.field) : -1;
    if (pa !== pb) return (pb === -1 ? -1 : pa === -1 ? 1 : pa - pb);
    if (!!a.isMonetary !== !!b.isMonetary) return a.isMonetary ? -1 : 1;
    return Math.abs(b.sum ?? 0) - Math.abs(a.sum ?? 0);
  });
  const date = cols.find((c) => c.kind === "date" && c.field === "documentDate") ?? cols.find((c) => c.kind === "date") ?? null;
  const dimensions = cols
    .filter((c) => (c.kind === "categorical" || (c.kind === "text" && c.distinct <= 300)) && c.distinct >= 2 && c.distinct <= Math.max(3, rowCount * 0.9))
    .sort((a, b) => a.distinct - b.distinct);
  const entityPref = ["customerName", "productName", "supplierName", "accountName", "salesRep", "customerCode", "productCode", "supplierCode"];
  const entity = cols.find((c) => c.field && entityPref.includes(c.field) && c.kind !== "numeric")
    ?? [...dimensions].sort((a, b) => b.distinct - a.distinct)[0] ?? null;
  const measure = measures[0] ?? null;
  return {
    measure: measure?.name ?? null,
    measures: measures.map((m) => m.name),
    date: date?.name ?? null,
    dimensions: dimensions.map((d) => d.name),
    entity: entity?.name ?? null,
    monetary: !!measure?.isMonetary,
  };
}
