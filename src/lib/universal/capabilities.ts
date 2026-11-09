import { toDate, toNumber } from "./parse";
import { holt, mad, mean, median, ols, pearson, quantile, skewness, std, sum, fmt, pct } from "./stats";
import type { CapabilityResult, CapStatus, ColumnProfile, RawTable } from "./types";

export interface Ctx {
  t: RawTable;
  cols: ColumnProfile[];
  roles: { measure: string | null; measures: string[]; date: string | null; dimensions: string[]; entity: string | null; monetary: boolean };
  domains: string[];
  priorSameSignature: number;
}

const idx = (c: Ctx, name: string | null) => (name ? c.t.headers.indexOf(name) : -1);
const nums = (c: Ctx, name: string) => { const i = idx(c, name); return c.t.rows.map((r) => toNumber(r[i] ?? null)); };
const col = (c: Ctx, name: string | null) => c.cols.find((x) => x.name === name);
const byField = (c: Ctx, f: string) => c.cols.find((x) => x.field === f);

function base(id: string, title: string, group: CapabilityResult["group"], required: string[], available: string[]): CapabilityResult {
  return {
    id, title, group, status: "NOT_AVAILABLE", why: "", requiredInputs: required, availableInputs: available,
    missingInputs: required.filter((r) => !available.includes(r)), evidence: [], assumptions: [], limitations: [],
    provenance: { columns: [], rowRefs: [], method: "" },
  };
}
function set(r: CapabilityResult, status: CapStatus, why: string, extra: Partial<CapabilityResult> = {}) {
  return Object.assign(r, { status, why }, extra);
}

/** Monthly aggregation of the main measure (or row count when no measure exists). */
export function periodSeries(c: Ctx) {
  const di = idx(c, c.roles.date); if (di < 0) return [];
  const mi = idx(c, c.roles.measure);
  const m = new Map<string, { value: number; rows: number[] }>();
  c.t.rows.forEach((r, k) => {
    const d = toDate(r[di] ?? null, true); if (!d) return;
    const key = d.toISOString().slice(0, 7);
    const v = mi >= 0 ? toNumber(r[mi] ?? null) ?? 0 : 1;
    const e = m.get(key) ?? { value: 0, rows: [] }; e.value += v; e.rows.push(c.t.sourceRows[k]!); m.set(key, e);
  });
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, e]) => ({ period, ...e }));
}

export function groupBy(c: Ctx, dim: string, measure: string | null) {
  const di = idx(c, dim), mi = idx(c, measure);
  const m = new Map<string, { value: number; count: number; rows: number[]; vals: number[] }>();
  c.t.rows.forEach((r, k) => {
    const key = r[di] === null || r[di] === undefined ? "(فارغ)" : String(r[di]);
    const v = mi >= 0 ? toNumber(r[mi] ?? null) ?? 0 : 1;
    const e = m.get(key) ?? { value: 0, count: 0, rows: [], vals: [] };
    e.value += v; e.count++; e.vals.push(v); if (e.rows.length < 25) e.rows.push(c.t.sourceRows[k]!); m.set(key, e);
  });
  return [...m.entries()].map(([name, e]) => ({ name, ...e })).sort((a, b) => b.value - a.value);
}

export function runCapabilities(c: Ctx): CapabilityResult[] {
  const n = c.t.rows.length;
  const numericCols = c.cols.filter((x) => x.kind === "numeric");
  const have: string[] = [];
  if (n) have.push("rows");
  if (c.roles.measure) have.push("measure");
  if (numericCols.length >= 2) have.push("2+ numeric");
  if (c.roles.date) have.push("date");
  if (c.roles.dimensions.length) have.push("dimension");
  if (c.roles.dimensions.length >= 2) have.push("2+ dimensions");
  if (c.roles.entity) have.push("entity");
  const series = periodSeries(c);
  const T = series.length;
  if (T >= 2) have.push("2+ periods");
  if (T >= 3) have.push("3+ periods");
  if (T >= 6) have.push("6+ periods");
  if (T >= 8) have.push("8+ periods");
  const hasProfit = !!byField(c, "profit"), hasCost = !!byField(c, "cost");
  if (hasProfit || hasCost) have.push("cost/profit");
  if (c.domains.length >= 2) have.push("2+ domains");
  const mainDim = c.roles.entity && c.roles.dimensions.includes(c.roles.entity) ? c.roles.entity : c.roles.dimensions[0] ?? c.roles.entity;
  const out: CapabilityResult[] = [];
  const mName = c.roles.measure;
  const mLabel = mName ?? "عدد الصفوف";
  const allRows = c.t.sourceRows;

  // 1 CORE METRICS
  {
    const r = base("core_metrics", "المؤشرات الأساسية", "describe", ["rows", "measure"], have);
    if (!n) set(r, "BLOCKED", "الملف لا يحتوي على صفوف بيانات.");
    else if (!numericCols.length) set(r, "REVIEW_REQUIRED", "لا توجد أعمدة رقمية؛ تم حساب عدد السجلات والقيم المميزة فقط.", {
      evidence: [{ label: "عدد السجلات", value: n }, ...c.cols.slice(0, 4).map((x) => ({ label: `قيم مميزة: ${x.name}`, value: x.distinct }))],
      provenance: { columns: c.t.headers, rowRefs: allRows.slice(0, 50), method: "count/distinct" },
    });
    else set(r, "AVAILABLE", "تم حساب المجموع والمتوسط والحدود لكل عمود رقمي.", {
      evidence: [{ label: "عدد السجلات", value: n }, ...numericCols.slice(0, 6).flatMap((x) => [{ label: `مجموع ${x.name}`, value: fmt(x.sum, 2) }, { label: `متوسط ${x.name}`, value: fmt(x.mean, 2) }])],
      output: numericCols.map((x) => ({ name: x.name, sum: x.sum, mean: x.mean, min: x.min, max: x.max })),
      provenance: { columns: numericCols.map((x) => x.name), rowRefs: allRows.slice(0, 50), method: "sum/mean/min/max على كل الصفوف" },
    });
    out.push(r);
  }

  // 2 QUALITY
  const quality = (() => {
    const r = base("quality", "جودة البيانات", "govern", ["rows"], have);
    const cells = n * c.cols.length || 1;
    const missing = sum(c.cols.map((x) => x.missing));
    const invalid = sum(c.cols.map((x) => x.invalid));
    const keys = c.t.rows.map((row) => JSON.stringify(row));
    const dupRows: number[] = []; const seen = new Set<string>();
    keys.forEach((k, i) => { if (seen.has(k)) dupRows.push(c.t.sourceRows[i]!); seen.add(k); });
    const empties = c.cols.filter((x) => x.kind === "empty").map((x) => x.name);
    const negMoney = c.cols.filter((x) => x.isMonetary && (x.negatives ?? 0) > 0);
    // intra-file arithmetic identities
    const identities: { rule: string; checked: number; broken: number; rows: number[] }[] = [];
    const g = byField(c, "grossAmount"), d = byField(c, "discount"), ne = byField(c, "netAmount"), co = byField(c, "cost"), pr = byField(c, "profit");
    const check = (rule: string, f: (row: number) => [number, number] | null) => {
      let checked = 0, broken = 0; const rows: number[] = [];
      for (let i = 0; i < n; i++) { const v = f(i); if (!v) continue; checked++; if (Math.abs(v[0] - v[1]) > Math.max(1, Math.abs(v[1]) * 0.01)) { broken++; if (rows.length < 20) rows.push(c.t.sourceRows[i]!); } }
      if (checked) identities.push({ rule, checked, broken, rows });
    };
    if (g && d && ne) { const a = nums(c, g.name), b = nums(c, d.name), e = nums(c, ne.name); check(`${g.name} − ${d.name} = ${ne.name}`, (i) => a[i] != null && b[i] != null && e[i] != null ? [a[i]! - b[i]!, e[i]!] : null); }
    if (ne && co && pr) { const a = nums(c, ne.name), b = nums(c, co.name), e = nums(c, pr.name); check(`${ne.name} − ${co.name} = ${pr.name}`, (i) => a[i] != null && b[i] != null && e[i] != null ? [a[i]! - b[i]!, e[i]!] : null); }
    const brokenRatio = identities.length ? sum(identities.map((x) => x.broken)) / Math.max(1, sum(identities.map((x) => x.checked))) : 0;
    const score = Math.max(0, Math.round(100 * (1 - missing / cells) * (1 - invalid / cells) * (1 - dupRows.length / Math.max(1, n)) * (1 - brokenRatio * 0.5)));
    if (!n) return set(r, "BLOCKED", "لا توجد صفوف لفحص جودتها.", { output: { score: 0 } });
    return set(r, "AVAILABLE", "فحص الاكتمال والقيم غير الصالحة والتكرار والمعادلات الحسابية داخل الملف.", {
      evidence: [
        { label: "درجة الجودة", value: `${score}/100` },
        { label: "خلايا فارغة", value: pct(missing / cells) },
        { label: "قيم غير صالحة لنوع العمود", value: invalid },
        { label: "صفوف مكررة تماماً", value: dupRows.length },
        ...identities.map((x) => ({ label: `معادلة: ${x.rule}`, value: `${x.broken} مخالفة من ${x.checked}` })),
      ],
      limitations: ["الفحص داخل ملف واحد؛ مطابقة مصدر خارجي تتطلب ملفاً ثانياً."],
      output: { score, missing, invalid, dupRows, empties, negMoney: negMoney.map((x) => ({ name: x.name, count: x.negatives })), identities },
      provenance: { columns: c.t.headers, rowRefs: [...dupRows, ...identities.flatMap((x) => x.rows)].slice(0, 50), method: "completeness × validity × uniqueness × consistency" },
    });
  })();
  out.push(quality);

  // 3 TRENDS
  const trend = (() => {
    const r = base("trends", "الاتجاهات الزمنية", "describe", ["date", "3+ periods"], have);
    if (!c.roles.date) return set(r, "NOT_AVAILABLE", "لا يوجد عمود تاريخ قابل للقراءة.");
    if (T < 3) return set(r, "INSUFFICIENT_SAMPLE", `يوجد ${T} فترة شهرية فقط؛ الاتجاه يحتاج 3 فترات على الأقل.`);
    const y = series.map((s) => s.value); const o = ols(y);
    const growth = y[0] ? (y[y.length - 1]! - y[0]) / Math.abs(y[0]) : 0;
    return set(r, "AVAILABLE", `تم تجميع ${mLabel} شهرياً عبر ${T} فترة وحساب خط الاتجاه.`, {
      evidence: [{ label: "الميل الشهري", value: fmt(o.slope, 2) }, { label: "R²", value: fmt(o.r2, 2) }, { label: "التغير من أول لآخر فترة", value: pct(growth) }],
      assumptions: ["الاتجاه الخطي تقريب أولي ولا يفسر الموسمية."],
      output: { slope: o.slope, r2: o.r2, growth, first: series[0]!.period, last: series[T - 1]!.period },
      provenance: { columns: [c.roles.date, mLabel], rowRefs: series.flatMap((s) => s.rows).slice(0, 50), method: "OLS على الإجمالي الشهري" },
    });
  })();
  out.push(trend);

  // 4 COMPARISONS
  const comparison = (() => {
    const r = base("comparisons", "المقارنات بين الفترات والشرائح", "describe", ["2+ periods|dimension"], have);
    const ev: { label: string; value: string | number }[] = []; let pop: { last: string; prev: string; change: number; lastV: number; prevV: number } | null = null;
    if (T >= 2) {
      const a = series[T - 2]!, b = series[T - 1]!;
      pop = { last: b.period, prev: a.period, lastV: b.value, prevV: a.value, change: a.value ? (b.value - a.value) / Math.abs(a.value) : 0 };
      ev.push({ label: `${b.period} مقابل ${a.period}`, value: pct(pop.change) });
    }
    let segs: ReturnType<typeof groupBy> = [];
    if (mainDim) { segs = groupBy(c, mainDim, mName); if (segs.length >= 2) ev.push({ label: `الأعلى مقابل الأدنى في ${mainDim}`, value: `${segs[0]!.name}: ${fmt(segs[0]!.value)} / ${segs[segs.length - 1]!.name}: ${fmt(segs[segs.length - 1]!.value)}` }); }
    if (!ev.length) return set(r, "NOT_AVAILABLE", "لا توجد فترات زمنية متعددة ولا بُعد تصنيفي للمقارنة.");
    return set(r, "AVAILABLE", "مقارنة آخر فترة بالسابقة ومقارنة الشرائح.", { evidence: ev, output: { pop },
      provenance: { columns: [c.roles.date, mainDim, mLabel].filter(Boolean) as string[], rowRefs: pop ? series.slice(-2).flatMap((s) => s.rows).slice(0, 40) : segs.slice(0, 2).flatMap((s) => s.rows), method: "فرق نسبي" } });
  })();
  out.push(comparison);

  // 5 CONCENTRATION
  const concentration = (() => {
    const r = base("concentration", "التركّز (باريتو/HHI)", "diagnose", ["dimension|entity", "measure"], have);
    if (!mainDim) return set(r, "NOT_AVAILABLE", "لا يوجد بُعد (عميل/صنف/فئة) لقياس التركّز.");
    const g = groupBy(c, mainDim, mName).filter((x) => x.value > 0);
    if (g.length < 3) return set(r, "INSUFFICIENT_SAMPLE", "أقل من 3 عناصر موجبة القيمة.");
    const total = sum(g.map((x) => x.value));
    const shares = g.map((x) => x.value / total);
    const hhi = sum(shares.map((s) => s * s));
    const k20 = Math.max(1, Math.ceil(g.length * 0.2));
    const top20 = sum(shares.slice(0, k20));
    let cum = 0, k80 = 0; for (const s of shares) { cum += s; k80++; if (cum >= 0.8) break; }
    return set(r, "AVAILABLE", `قياس توزيع ${mLabel} على ${g.length} عنصراً من ${mainDim}.`, {
      evidence: [{ label: "حصة الأكبر", value: `${g[0]!.name} — ${pct(shares[0]!)}` }, { label: "حصة أعلى 20%", value: pct(top20) }, { label: "عناصر تصنع 80%", value: `${k80} من ${g.length}` }, { label: "HHI", value: fmt(hhi * 10000) }],
      output: { dim: mainDim, top: g[0]!.name, topShare: shares[0], top20, k80, count: g.length, hhi, total, items: g.slice(0, 12).map((x) => ({ name: x.name, value: x.value })) },
      provenance: { columns: [mainDim, mLabel], rowRefs: g[0]!.rows, method: "حصص سوقية داخلية + مؤشر هيرفندال" },
    });
  })();
  out.push(concentration);

  // 6 SEGMENTATION
  const segmentation = (() => {
    const r = base("segmentation", "التقسيم والشرائح", "describe", ["dimension"], have);
    if (!c.roles.dimensions.length) return set(r, "NOT_AVAILABLE", "لا توجد أعمدة تصنيفية مناسبة.");
    const dims = c.roles.dimensions.slice(0, 4).map((d) => ({ dim: d, groups: groupBy(c, d, mName).slice(0, 15).map((g) => ({ name: g.name, value: g.value, count: g.count, avg: g.value / g.count })) }));
    return set(r, "AVAILABLE", `تقسيم ${mLabel} حسب ${dims.map((d) => d.dim).join("، ")}.`, {
      evidence: dims.map((d) => ({ label: `أكبر شريحة في ${d.dim}`, value: `${d.groups[0]?.name} (${fmt(d.groups[0]?.value)})` })),
      output: dims, provenance: { columns: [...dims.map((d) => d.dim), mLabel], rowRefs: allRows.slice(0, 30), method: "group-by sum/count/avg" },
    });
  })();
  out.push(segmentation);

  // 7 DEPENDENCY (association, never causation)
  const dependency = (() => {
    const r = base("dependency", "الارتباطات بين المتغيرات", "diagnose", ["2+ numeric", "rows≥8"], have);
    if (numericCols.length < 2) return set(r, "NOT_AVAILABLE", "يلزم عمودان رقميان على الأقل.");
    if (n < 8) return set(r, "INSUFFICIENT_SAMPLE", `${n} صفوف فقط؛ الارتباط يحتاج 8 على الأقل.`);
    const pairs: { a: string; b: string; r: number }[] = [];
    const cols = numericCols.slice(0, 10);
    for (let i = 0; i < cols.length; i++) for (let j = i + 1; j < cols.length; j++) {
      const A = nums(c, cols[i]!.name), B = nums(c, cols[j]!.name); const x: number[] = [], y: number[] = [];
      A.forEach((v, k) => { if (v != null && B[k] != null) { x.push(v); y.push(B[k]!); } });
      if (x.length >= 8) pairs.push({ a: cols[i]!.name, b: cols[j]!.name, r: pearson(x, y) });
    }
    pairs.sort((p, q) => Math.abs(q.r) - Math.abs(p.r));
    return set(r, "AVAILABLE", "حساب معامل بيرسون لكل زوج من الأعمدة الرقمية.", {
      evidence: pairs.slice(0, 4).map((p) => ({ label: `${p.a} ↔ ${p.b}`, value: fmt(p.r, 2) })),
      limitations: ["الارتباط لا يعني السببية؛ لا يُبنى عليه قرار سببي دون تجربة أو تصميم مقارن."],
      output: pairs, provenance: { columns: cols.map((x) => x.name), rowRefs: allRows.slice(0, 30), method: "Pearson r" },
    });
  })();
  out.push(dependency);

  // 8 DISTRIBUTION
  const mVals = mName ? (nums(c, mName).filter((v) => v != null) as number[]) : [];
  const distribution = (() => {
    const r = base("distribution", "التوزيع الإحصائي", "describe", ["measure", "rows≥5"], have);
    if (!mName) return set(r, "NOT_AVAILABLE", "لا يوجد مقياس رقمي.");
    if (mVals.length < 5) return set(r, "INSUFFICIENT_SAMPLE", "أقل من 5 قيم.");
    const s = [...mVals].sort((a, b) => a - b);
    const q = { p10: quantile(s, 0.1), p25: quantile(s, 0.25), p50: quantile(s, 0.5), p75: quantile(s, 0.75), p90: quantile(s, 0.9) };
    const sk = skewness(mVals);
    const bins = 10, lo = s[0]!, hi = s[s.length - 1]!, w = (hi - lo) / bins || 1;
    const hist = Array.from({ length: bins }, (_, i) => ({ from: lo + i * w, count: 0 }));
    mVals.forEach((v) => { hist[Math.min(bins - 1, Math.floor((v - lo) / w))]!.count++; });
    return set(r, "AVAILABLE", `وصف توزيع ${mName}.`, {
      evidence: [{ label: "الوسيط", value: fmt(q.p50, 2) }, { label: "المدى الربيعي", value: `${fmt(q.p25, 2)} – ${fmt(q.p75, 2)}` }, { label: "الالتواء", value: fmt(sk, 2) }],
      output: { ...q, skew: sk, hist }, provenance: { columns: [mName], rowRefs: allRows.slice(0, 30), method: "quantiles/skewness/histogram" },
    });
  })();
  out.push(distribution);

  // 9 OUTLIERS
  const outliers = (() => {
    const r = base("outliers", "القيم الشاذة", "diagnose", ["measure", "rows≥8"], have);
    if (!mName) return set(r, "NOT_AVAILABLE", "لا يوجد مقياس رقمي.");
    if (mVals.length < 8) return set(r, "INSUFFICIENT_SAMPLE", "أقل من 8 قيم.");
    const s = [...mVals].sort((a, b) => a - b); const q1 = quantile(s, 0.25), q3 = quantile(s, 0.75), iqr = q3 - q1;
    const loF = q1 - 1.5 * iqr, hiF = q3 + 1.5 * iqr;
    const raw = nums(c, mName); const flagged: { row: number; value: number }[] = [];
    raw.forEach((v, i) => { if (v != null && (v < loF || v > hiF)) flagged.push({ row: c.t.sourceRows[i]!, value: v }); });
    flagged.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    return set(r, "AVAILABLE", `قاعدة توكي (1.5×IQR) على ${mName}.`, {
      evidence: [{ label: "عدد القيم الشاذة", value: flagged.length }, { label: "الحد الأعلى", value: fmt(hiF, 2) }, { label: "أكبر قيمة شاذة", value: flagged[0] ? `${fmt(flagged[0].value, 2)} (صف ${flagged[0].row})` : "—" }],
      output: { count: flagged.length, hiF, loF, flagged: flagged.slice(0, 20), share: flagged.length ? sum(flagged.map((f) => f.value)) / (sum(mVals) || 1) : 0 },
      provenance: { columns: [mName], rowRefs: flagged.slice(0, 50).map((f) => f.row), method: "IQR fences" },
    });
  })();
  out.push(outliers);

  // 10 ANOMALIES (time)
  const anomalies = (() => {
    const r = base("anomalies", "الشذوذ الزمني", "diagnose", ["date", "6+ periods"], have);
    if (!c.roles.date) return set(r, "NOT_AVAILABLE", "يتطلب عمود تاريخ.");
    if (T < 6) return set(r, "INSUFFICIENT_SAMPLE", `${T} فترات؛ يلزم 6 على الأقل.`);
    const y = series.map((s) => s.value), md = median(y), m = mad(y) || std(y) / 1.4826 || 1;
    const flags = series.map((s) => ({ period: s.period, value: s.value, z: (s.value - md) / (1.4826 * m), rows: s.rows })).filter((x) => Math.abs(x.z) >= 3);
    return set(r, "AVAILABLE", "Robust z-score (الوسيط/MAD) على الإجمالي الشهري.", {
      evidence: [{ label: "فترات شاذة", value: flags.length }, ...flags.slice(0, 3).map((f) => ({ label: f.period, value: `z=${fmt(f.z, 1)}` }))],
      output: flags.map(({ rows: _r, ...f }) => f), provenance: { columns: [c.roles.date, mLabel], rowRefs: flags.flatMap((f) => f.rows).slice(0, 50), method: "robust z ≥ 3" },
    });
  })();
  out.push(anomalies);

  // 11 CHANGE POINTS
  const changePoint = (() => {
    const r = base("change_points", "نقاط التحوّل", "diagnose", ["date", "8+ periods"], have);
    if (!c.roles.date) return set(r, "NOT_AVAILABLE", "يتطلب عمود تاريخ.");
    if (T < 8) return set(r, "INSUFFICIENT_SAMPLE", `${T} فترات؛ يلزم 8 على الأقل.`);
    const y = series.map((s) => s.value); let best = { k: -1, t: 0, before: 0, after: 0 };
    for (let k = 3; k <= y.length - 3; k++) {
      const a = y.slice(0, k), b = y.slice(k); const se = Math.sqrt(std(a) ** 2 / a.length + std(b) ** 2 / b.length) || 1;
      const tv = Math.abs(mean(b) - mean(a)) / se; if (tv > best.t) best = { k, t: tv, before: mean(a), after: mean(b) };
    }
    if (best.k < 0 || best.t < 2.5) return set(r, "AVAILABLE", "لم تُرصد نقطة تحول ذات دلالة (t<2.5).", { evidence: [{ label: "أعلى t", value: fmt(best.t, 2) }], output: null, provenance: { columns: [c.roles.date, mLabel], rowRefs: [], method: "best single split, Welch t" } });
    return set(r, "AVAILABLE", "تقسيم السلسلة عند النقطة التي تعظم فرق المتوسطين.", {
      evidence: [{ label: "بداية التحول", value: series[best.k]!.period }, { label: "المتوسط قبل/بعد", value: `${fmt(best.before)} → ${fmt(best.after)}` }, { label: "t", value: fmt(best.t, 2) }],
      output: { period: series[best.k]!.period, ...best }, provenance: { columns: [c.roles.date, mLabel], rowRefs: series[best.k]!.rows.slice(0, 30), method: "best single split, Welch t" },
    });
  })();
  out.push(changePoint);

  // 12 DRIVERS (statistical, not causal)
  const drivers = (() => {
    const r = base("drivers", "محركات التغير", "diagnose", ["dimension", "measure"], have);
    if (!c.roles.dimensions.length || !mName) return set(r, "NOT_AVAILABLE", "يتطلب بُعداً تصنيفياً ومقياساً رقمياً.");
    if (n < 10) return set(r, "INSUFFICIENT_SAMPLE", "أقل من 10 صفوف.");
    const tot = mean(mVals), sst = sum(mVals.map((v) => (v - tot) ** 2)) || 1;
    const eta = c.roles.dimensions.slice(0, 6).map((d) => { const g = groupBy(c, d, mName); const ssb = sum(g.map((x) => x.count * (x.value / x.count - tot) ** 2)); return { dim: d, eta2: ssb / sst, groups: g.length }; }).filter((x) => x.groups < n).sort((a, b) => b.eta2 - a.eta2);
    let contrib: { name: string; delta: number }[] = [];
    const di = idx(c, c.roles.date);
    if (T >= 2 && mainDim && di >= 0) {
      const lastP = series[T - 1]!.period, prevP = series[T - 2]!.period, ii = idx(c, mainDim), mi = idx(c, mName);
      const m = new Map<string, number>();
      c.t.rows.forEach((row) => { const d = toDate(row[di] ?? null, true); if (!d) return; const p = d.toISOString().slice(0, 7); if (p !== lastP && p !== prevP) return; const k = String(row[ii] ?? "(فارغ)"); m.set(k, (m.get(k) ?? 0) + (p === lastP ? 1 : -1) * (toNumber(row[mi] ?? null) ?? 0)); });
      contrib = [...m.entries()].map(([name, delta]) => ({ name, delta })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 8);
    }
    return set(r, "AVAILABLE", "نسبة التباين المفسَّر (η²) لكل بُعد، وتفكيك تغير آخر فترة حسب العناصر.", {
      evidence: [...eta.slice(0, 3).map((e) => ({ label: `η² ${e.dim}`, value: pct(e.eta2) })), ...contrib.slice(0, 3).map((x) => ({ label: `مساهمة ${x.name}`, value: fmt(x.delta) }))],
      limitations: ["المحرك هنا إحصائي (يفسر التباين) وليس سببياً."],
      output: { eta, contrib }, provenance: { columns: [...c.roles.dimensions.slice(0, 6), mName], rowRefs: allRows.slice(0, 30), method: "ANOVA η² + delta decomposition" },
    });
  })();
  out.push(drivers);

  // 17 FORECAST + 18 UNCERTAINTY
  const forecast = (() => {
    const r = base("forecast", "التنبؤ", "predict", ["date", "6+ periods"], have);
    if (!c.roles.date) return set(r, "NOT_AVAILABLE", "لا يمكن التنبؤ دون عمود تاريخ.");
    if (T < 6) return set(r, "INSUFFICIENT_SAMPLE", `${T} فترات فقط؛ لن يتم اختلاق توقع بأقل من 6 فترات.`);
    const h = holt(series.map((s) => s.value), 3);
    const lastD = new Date(series[T - 1]!.period + "-01T00:00:00Z");
    const fc = h.forecast.map((f, i) => { const d = new Date(lastD); d.setUTCMonth(d.getUTCMonth() + i + 1); return { period: d.toISOString().slice(0, 7), ...f }; });
    return set(r, h.mape > 0.5 ? "REVIEW_REQUIRED" : "AVAILABLE", `تمهيد هولت الأسي لـ ${T} فترة، أفق 3 فترات.`, {
      evidence: [{ label: `توقع ${fc[0]!.period}`, value: fmt(fc[0]!.point) }, { label: "MAPE داخل العينة", value: pct(h.mape) }, { label: "α / β", value: `${h.alpha} / ${h.beta}` }],
      assumptions: ["استمرار النمط التاريخي دون صدمات خارجية."], limitations: h.mape > 0.5 ? ["خطأ التوقع التاريخي مرتفع؛ يحتاج مراجعة قبل الاعتماد."] : [],
      output: { forecast: fc, mape: h.mape, sigma: h.sigma }, provenance: { columns: [c.roles.date, mLabel], rowRefs: series.flatMap((s) => s.rows).slice(0, 50), method: "Holt linear ES" },
    });
  })();
  out.push(forecast);
  {
    const r = base("uncertainty", "عدم اليقين وفترات الثقة", "predict", ["measure", "rows≥10"], have);
    if (forecast.status === "AVAILABLE" || forecast.status === "REVIEW_REQUIRED") {
      const fc = (forecast.output as { forecast: { period: string; lo: number; hi: number }[] }).forecast;
      set(r, "AVAILABLE", "نطاق توقع 95% من تشتت البواقي.", { evidence: fc.map((f) => ({ label: f.period, value: `${fmt(f.lo)} – ${fmt(f.hi)}` })), output: { kind: "forecast", fc }, provenance: forecast.provenance });
    } else if (mVals.length >= 10) {
      const m = mean(mVals), se = std(mVals) / Math.sqrt(mVals.length);
      set(r, "AVAILABLE", `فترة ثقة 95% لمتوسط ${mName}.`, { evidence: [{ label: "المتوسط", value: fmt(m, 2) }, { label: "فترة الثقة 95%", value: `${fmt(m - 1.96 * se, 2)} – ${fmt(m + 1.96 * se, 2)}` }], assumptions: ["تقريب طبيعي لمتوسط العينة."], output: { kind: "mean", m, lo: m - 1.96 * se, hi: m + 1.96 * se }, provenance: { columns: [mName!], rowRefs: allRows.slice(0, 30), method: "normal CI" } });
    } else set(r, mName ? "INSUFFICIENT_SAMPLE" : "NOT_AVAILABLE", mName ? "أقل من 10 قيم." : "لا يوجد مقياس رقمي.");
    out.push(r);
  }

  // 19 SENSITIVITY
  {
    const r = base("sensitivity", "تحليل الحساسية", "predict", ["dimension", "measure"], have);
    if (concentration.status !== "AVAILABLE") set(r, concentration.status === "INSUFFICIENT_SAMPLE" ? "INSUFFICIENT_SAMPLE" : "NOT_AVAILABLE", "يعتمد على وجود شرائح موجبة القيمة.");
    else {
      const o = concentration.output as { items: { name: string; value: number }[]; total: number };
      const tornado = o.items.slice(0, 6).map((x) => ({ name: x.name, down: -0.1 * x.value, up: 0.1 * x.value, pctOfTotal: (0.1 * x.value) / o.total }));
      set(r, "AVAILABLE", "أثر تغير ±10% في كل عنصر رئيسي على الإجمالي.", { evidence: tornado.slice(0, 3).map((t) => ({ label: t.name, value: `±${pct(t.pctOfTotal)} من الإجمالي` })), assumptions: ["تغير مستقل لكل عنصر مع ثبات البقية."], output: tornado, provenance: concentration.provenance });
    }
    out.push(r);
  }
  // 20 WHAT-IF
  {
    const r = base("what_if", "ماذا لو", "prescribe", ["measure"], have);
    if (!mName) set(r, "NOT_AVAILABLE", "يحتاج مقياساً رقمياً لتطبيق السيناريوهات.");
    else set(r, "AVAILABLE", "سيناريوهات تفاعلية: تغيير نسبة على الإجمالي أو على شريحة محددة.", { output: { total: sum(mVals), segments: concentration.output ? (concentration.output as { items: unknown[] }).items : [] }, evidence: [{ label: "الأساس", value: fmt(sum(mVals)) }], assumptions: ["السيناريو حسابي ولا يتنبأ بسلوك السوق."], provenance: { columns: [mName], rowRefs: allRows.slice(0, 20), method: "linear scenario" } });
    out.push(r);
  }
  // 21 COUNTERFACTUAL (arithmetic)
  {
    const r = base("counterfactual", "التحليل المضاد (بدون…)", "prescribe", ["dimension|outliers", "measure"], have);
    const ev: { label: string; value: string }[] = []; const total = sum(mVals);
    if (concentration.status === "AVAILABLE") { const o = concentration.output as { top: string; topShare: number }; ev.push({ label: `بدون ${o.top}`, value: `${fmt(total * (1 - o.topShare))} (−${pct(o.topShare)})` }); }
    if (outliers.status === "AVAILABLE" && (outliers.output as { count: number }).count) { const o = outliers.output as { flagged: { value: number }[]; count: number }; const s = sum(o.flagged.map((f) => f.value)); ev.push({ label: `بدون ${o.count} قيمة شاذة (أعلى 20)`, value: fmt(total - s) }); }
    if (!ev.length) set(r, "NOT_AVAILABLE", "لا توجد شرائح أو قيم شاذة لبناء سيناريو مضاد.");
    else set(r, "AVAILABLE", "إعادة حساب الإجمالي باستبعاد العنصر المسيطر أو القيم الشاذة.", { evidence: ev, limitations: ["حساب محاسبي لا يدّعي ما كان سيحدث فعلياً (ليس استدلالاً سببياً)."], output: ev, provenance: { columns: [mainDim ?? "", mLabel].filter(Boolean), rowRefs: [...concentration.provenance.rowRefs, ...outliers.provenance.rowRefs].slice(0, 40), method: "exclusion recompute" } });
    out.push(r);
  }
  // 22 CAUSAL
  {
    const r = base("causal", "التحليل السببي", "diagnose", ["treatment/control column", "pre/post periods", "assignment design"], have);
    const design = c.cols.find((x) => /treatment|control|experiment|variant|cohort|تجرب|ضابط|حمله|حملة/i.test(x.name));
    if (design && c.roles.date) set(r, "REVIEW_REQUIRED", `يوجد عمود تصميم محتمل (${design.name})؛ يتطلب تأكيد آلية التوزيع قبل أي استنتاج سببي.`, { availableInputs: [...have, "treatment/control column"], missingInputs: ["assignment design"] });
    else set(r, "BLOCKED", "لا توجد مجموعة ضابطة أو تجربة أو تدخل موثق؛ لن يتم تحويل الارتباط إلى سببية.", { limitations: ["أي علاقة ظاهرة في الارتباطات هي تزامن إحصائي فقط."] });
    out.push(r);
  }
  // 23 OPTIMIZATION
  {
    const r = base("optimization", "التحسين وتوزيع الموارد", "prescribe", ["cost/profit", "dimension", "constraint (budget/capacity)"], have);
    const pr = byField(c, "profit"), ne = byField(c, "netAmount");
    if (pr && ne && mainDim) {
      const gp = groupBy(c, mainDim, pr.name), gn = new Map(groupBy(c, mainDim, ne.name).map((g) => [g.name, g.value]));
      const ranked = gp.map((g) => ({ name: g.name, profit: g.value, margin: (gn.get(g.name) ?? 0) ? g.value / gn.get(g.name)! : 0 })).sort((a, b) => b.margin - a.margin);
      set(r, "REVIEW_REQUIRED", "ترتيب العناصر حسب الهامش لتوجيه الجهد؛ لا يوجد قيد ميزانية/طاقة لحل أمثل كامل.", { evidence: ranked.slice(0, 3).map((x) => ({ label: x.name, value: `هامش ${pct(x.margin)}` })), missingInputs: ["constraint (budget/capacity)"], output: ranked.slice(0, 12), provenance: { columns: [mainDim, pr.name, ne.name], rowRefs: allRows.slice(0, 20), method: "margin ranking" } });
    } else set(r, "NOT_AVAILABLE", "يتطلب ربحاً/تكلفة وقيداً للموارد.");
    out.push(r);
  }
  // 25 PROCESS INTELLIGENCE
  {
    const r = base("process", "ذكاء العمليات", "diagnose", ["case id", "timestamp", "activity/status"], have);
    const act = c.cols.find((x) => x.kind === "categorical" && /status|stage|activity|step|state|حاله|حالة|مرحله|مرحلة|نشاط|اجراء|إجراء/i.test(x.name));
    const caseCol = byField(c, "documentNo") ?? c.cols.find((x) => x.kind === "identifier");
    if (act && caseCol && c.roles.date) {
      const g = groupBy(c, act.name, null);
      set(r, "AVAILABLE", `مراحل العملية من عمود ${act.name} عبر الحالات ${caseCol.name}.`, { evidence: g.slice(0, 5).map((x) => ({ label: x.name, value: x.count })), output: g.map((x) => ({ name: x.name, count: x.count })), provenance: { columns: [act.name, caseCol.name, c.roles.date], rowRefs: allRows.slice(0, 30), method: "activity frequency" } });
    } else set(r, "NOT_AVAILABLE", "يتطلب معرّف حالة + تاريخ + عمود مرحلة/حالة.", { missingInputs: [!caseCol && "case id", !c.roles.date && "timestamp", !act && "activity/status"].filter(Boolean) as string[] });
    out.push(r);
  }
  // 26 KNOWLEDGE GRAPH
  {
    const r = base("knowledge_graph", "شبكة الكيانات", "diagnose", ["2+ dimensions"], have);
    const dims = c.roles.dimensions.slice(0, 4);
    if (dims.length < 2) set(r, "NOT_AVAILABLE", "يلزم بعدان تصنيفيان على الأقل لبناء العلاقات.");
    else {
      const edges = new Map<string, { a: string; b: string; w: number }>(); const mi = idx(c, mName);
      c.t.rows.forEach((row) => { for (let i = 0; i < dims.length; i++) for (let j = i + 1; j < dims.length; j++) { const a = `${dims[i]}:${row[idx(c, dims[i]!)] ?? "—"}`, b = `${dims[j]}:${row[idx(c, dims[j]!)] ?? "—"}`; const k = a + "|" + b; const e = edges.get(k) ?? { a, b, w: 0 }; e.w += mi >= 0 ? Math.abs(toNumber(row[mi] ?? null) ?? 0) : 1; edges.set(k, e); } });
      const top = [...edges.values()].sort((x, y) => y.w - x.w).slice(0, 25);
      set(r, "AVAILABLE", `علاقات تزامن بين ${dims.join("، ")}.`, { evidence: top.slice(0, 3).map((e) => ({ label: `${e.a} ↔ ${e.b}`, value: fmt(e.w) })), output: top, provenance: { columns: dims, rowRefs: allRows.slice(0, 30), method: "co-occurrence graph" } });
    }
    out.push(r);
  }
  // 27 CROSS-DOMAIN
  {
    const r = base("cross_domain", "الاستدلال عبر المجالات", "diagnose", ["2+ domains"], have);
    const sq = byField(c, "salesQty") ?? byField(c, "quantity"), st = byField(c, "currentStock");
    if (sq && st && T >= 1) {
      const months = Math.max(1, T); const totalSold = sum(nums(c, sq.name).map((v) => v ?? 0)), stock = sum(nums(c, st.name).map((v) => v ?? 0));
      const cover = totalSold ? stock / (totalSold / (months * 30)) : null;
      set(r, "AVAILABLE", "ربط المبيعات بالمخزون لحساب أيام التغطية.", { evidence: [{ label: "أيام التغطية التقريبية", value: cover ? fmt(cover) : "—" }], assumptions: ["متوسط بيع يومي ثابت عبر الفترة."], output: { cover }, provenance: { columns: [sq.name, st.name], rowRefs: allRows.slice(0, 20), method: "stock / daily demand" } });
    } else if (c.domains.length >= 2) set(r, "REVIEW_REQUIRED", `مجالات مرصودة: ${c.domains.join("، ")}؛ لا توجد معادلة ربط معروفة بين أعمدتها بعد.`);
    else set(r, "NOT_AVAILABLE", `مجال واحد مرصود (${c.domains[0] ?? "غير محدد"}).`);
    out.push(r);
  }
  // 31 BENCHMARK (internal only, never fabricated external)
  {
    const r = base("benchmark", "المقارنة المرجعية", "diagnose", ["dimension (3+ peers)", "external benchmark source"], have);
    if (segmentation.status === "AVAILABLE") {
      const d = (segmentation.output as { dim: string; groups: { name: string; avg: number; count: number }[] }[])[0]!;
      const avgs = d.groups.filter((g) => g.count >= 2).map((g) => g.avg);
      if (avgs.length >= 3) { const md = median(avgs); set(r, "AVAILABLE", `مقارنة داخلية بين نظراء ${d.dim} مقابل الوسيط.`, { evidence: d.groups.slice(0, 4).map((g) => ({ label: g.name, value: md ? `${pct(g.avg / md - 1)} عن الوسيط` : "—" })), limitations: ["لا يوجد مرجع خارجي للصناعة؛ لم يتم اختلاق أي معيار خارجي."], missingInputs: ["external benchmark source"], output: { median: md, dim: d.dim }, provenance: segmentation.provenance }); }
      else set(r, "INSUFFICIENT_SAMPLE", "أقل من 3 نظراء لديهم صفان على الأقل.");
    } else set(r, "NOT_AVAILABLE", "لا يوجد نظراء ولا مرجع خارجي.");
    out.push(r);
  }
  // 16 CROSS-SOURCE RECONCILIATION
  {
    const r = base("reconciliation", "المطابقة عبر المصادر", "govern", ["second source with shared key"], have);
    const ids = (quality.output as { identities: unknown[] }).identities;
    set(r, "NOT_AVAILABLE", ids.length ? "يلزم ملف مصدر ثانٍ بمفتاح مشترك. (تم تنفيذ المعادلات الداخلية ضمن جودة البيانات.)" : "يلزم ملف مصدر ثانٍ بمفتاح مشترك للمطابقة.");
    out.push(r);
  }
  // 29 DECISION REPLAY
  {
    const r = base("decision_replay", "إعادة تشغيل القرارات", "govern", ["prior analysis of same report signature"], have);
    if (c.priorSameSignature > 0) set(r, "AVAILABLE", `يوجد ${c.priorSameSignature} تحليل سابق لنفس بنية التقرير يمكن مقارنة قراراته ونتائجه.`, { availableInputs: [...have, "prior analysis of same report signature"], missingInputs: [], output: { prior: c.priorSameSignature } });
    else set(r, "NOT_AVAILABLE", "هذه أول مرة يُرفع فيها تقرير بهذه البنية؛ ستتاح عند الرفع التالي.");
    out.push(r);
  }
  // 30 ACTIVE LEARNING
  {
    const r = base("active_learning", "التعلّم النشط", "govern", ["uncertain mappings"], have);
    const q = c.cols.filter((x) => x.mappingNeedsReview || (x.mappingMethod === "unmapped" && x.kind !== "empty"));
    if (q.length) set(r, "AVAILABLE", `${q.length} عمود يحتاج تأكيد معناه؛ تأكيدك يُحفظ ويُستخدم تلقائياً في التقارير القادمة.`, { evidence: q.slice(0, 6).map((x) => ({ label: x.name, value: x.field ? `مقترح: ${x.field} (${pct(x.mappingConfidence, 0)})` : "غير معروف" })), output: q.map((x) => ({ name: x.name, suggested: x.field })) });
    else set(r, "AVAILABLE", "كل الأعمدة مُعرّفة بثقة؛ لا أسئلة مطلوبة حالياً.", { output: [] });
    out.push(r);
  }
  // 32 PROVENANCE
  {
    const r = base("provenance", "تتبّع المصدر (صف/خلية)", "govern", ["rows"], have);
    set(r, n ? "AVAILABLE" : "BLOCKED", n ? `كل نتيجة مربوطة بأرقام صفوف الملف الأصلي (الترويسة في الصف ${c.t.headerRow}).` : "لا صفوف.", { evidence: [{ label: "صف الترويسة", value: c.t.headerRow }, { label: "الورقة", value: c.t.sheet ?? "—" }, { label: "صفوف مُتتبعة", value: n }], provenance: { columns: c.t.headers, rowRefs: allRows.slice(0, 50), method: "source row index" } });
    out.push(r);
  }
  return out;
}

/** Capabilities that depend on derived findings — run after advise builds insights. */
export function derivedCapabilities(c: Ctx, caps: CapabilityResult[], insightCounts: { risks: number; opps: number; total: number; questions: { q: string; answered: boolean; a: string }[] }): CapabilityResult[] {
  const have = caps.filter((x) => x.status === "AVAILABLE").map((x) => x.id);
  const mk = (id: string, title: string, group: CapabilityResult["group"]) => base(id, title, group, ["findings"], have);
  const risks = mk("risks", "المخاطر", "diagnose");
  set(risks, insightCounts.risks ? "AVAILABLE" : "AVAILABLE", insightCounts.risks ? `${insightCounts.risks} خطر مستخرج من القدرات المنفذة.` : "لم تُرصد مخاطر من الأدلة المتاحة.", { evidence: [{ label: "عدد المخاطر", value: insightCounts.risks }] });
  const opps = mk("opportunities", "الفرص", "prescribe");
  set(opps, "AVAILABLE", insightCounts.opps ? `${insightCounts.opps} فرصة مستخرجة.` : "لم تُرصد فرص واضحة من الأدلة المتاحة.", { evidence: [{ label: "عدد الفرص", value: insightCounts.opps }] });
  const bq = mk("business_questions", "أسئلة العمل", "describe");
  const answered = insightCounts.questions.filter((q) => q.answered).length;
  set(bq, "AVAILABLE", `أُجيب عن ${answered} من ${insightCounts.questions.length} سؤالاً.`, { output: insightCounts.questions, evidence: insightCounts.questions.slice(0, 4).map((q) => ({ label: q.q, value: q.a })) });
  const portfolio = mk("decision_portfolio", "محفظة القرارات", "prescribe");
  set(portfolio, insightCounts.total ? "AVAILABLE" : "INSUFFICIENT_SAMPLE", insightCounts.total ? `${insightCounts.total} قرار مقترح مرتب حسب الأولوية بانتظار الاعتماد.` : "لا توجد نتائج كافية لبناء قرارات.");
  // VOI: which missing input unlocks most blocked capabilities
  const voi = mk("voi", "قيمة المعلومة الإضافية", "govern");
  const counts = new Map<string, number>();
  caps.filter((x) => x.status !== "AVAILABLE").forEach((x) => x.missingInputs.forEach((m) => counts.set(m, (counts.get(m) ?? 0) + 1)));
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  set(voi, "AVAILABLE", ranked.length ? `أعلى قيمة: إضافة «${ranked[0]![0]}» تفتح ${ranked[0]![1]} قدرة.` : "كل القدرات القابلة للتطبيق مفعّلة.", { evidence: ranked.slice(0, 5).map(([k, v]) => ({ label: k, value: `${v} قدرة` })), output: ranked });
  return [risks, opps, bq, portfolio, voi];
}
