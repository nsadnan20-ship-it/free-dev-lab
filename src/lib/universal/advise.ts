import type { Ctx } from "./capabilities";
import { fmt, pct } from "./stats";
import type { CapabilityResult, Insight, Role, WorkTaskDraft } from "./types";

const get = (caps: CapabilityResult[], id: string) => caps.find((c) => c.id === id);
const ok = (c?: CapabilityResult) => c && (c.status === "AVAILABLE" || c.status === "REVIEW_REQUIRED");

export const ROLE_LABEL: Record<Role, string> = {
  sales: "المبيعات", purchasing: "المشتريات", inventory: "المخازن", finance: "المالية",
  data: "جودة البيانات", management: "الإدارة", operations: "العمليات",
};

function ownerFor(c: Ctx, dim?: string | null): Role {
  const d = dim ? c.cols.find((x) => x.name === dim)?.field : null;
  if (d && /customer|salesRep/.test(d)) return "sales";
  if (d && /supplier/.test(d)) return "purchasing";
  if (d && /product|category|brand|warehouse/.test(d)) return c.domains.includes("inventory") ? "inventory" : c.domains.includes("purchases") ? "purchasing" : "sales";
  if (c.domains.includes("finance")) return "finance";
  if (c.domains.includes("sales")) return "sales";
  if (c.domains.includes("purchases")) return "purchasing";
  if (c.domains.includes("inventory")) return "inventory";
  if (c.domains.includes("operations")) return "operations";
  return "management";
}

export function buildInsights(c: Ctx, caps: CapabilityResult[]) {
  const ins: Insight[] = [];
  const unit = c.roles.monetary ? "" : ` (${c.roles.measure ?? "سجل"})`;
  const money = (v: number) => `${fmt(v)}${unit}`;
  const mLabel = c.roles.measure ?? "عدد السجلات";

  const q = get(caps, "quality");
  if (q?.output) {
    const o = q.output as { score: number; dupRows: number[]; identities: { rule: string; broken: number; checked: number; rows: number[] }[]; empties: string[]; negMoney: { name: string; count: number }[] };
    if (o.score < 85 || o.dupRows.length) ins.push({
      id: "dq-score", capability: "quality", severity: o.score < 60 ? "critical" : "warning", kind: "warning",
      what: `درجة جودة البيانات ${o.score}/100${o.dupRows.length ? ` مع ${o.dupRows.length} صف مكرر` : ""}.`,
      why: "خلايا فارغة أو قيم لا تطابق نوع العمود أو صفوف مكررة.", soWhat: "كل الأرقام والتوصيات تعتمد على هذه البيانات؛ الأخطاء تنتقل إلى القرار.",
      impact: o.dupRows.length ? `${o.dupRows.length} صف قد يضخّم الإجماليات` : null,
      whatNext: "مراجعة الصفوف المشار إليها وتصحيحها في النظام المصدر ثم إعادة الرفع.", whatIf: "إذا تُركت دون تصحيح، تبقى الثقة في التوقعات والمقارنات منخفضة.",
      proof: { columns: q.provenance.columns.slice(0, 6), rowRefs: o.dupRows.slice(0, 20), metrics: q.evidence.slice(0, 4) }, owner: "data", expectedOutcome: "رفع درجة الجودة فوق 90", confidence: null,
    });
    for (const id of o.identities.filter((x) => x.broken > 0)) ins.push({
      id: `dq-identity-${id.rule}`, capability: "quality", severity: id.broken / id.checked > 0.05 ? "critical" : "warning", kind: "warning",
      what: `${id.broken} صف يخالف المعادلة ${id.rule}.`, why: "القيم المحسوبة في الملف لا تتسق حسابياً.", soWhat: "قد يدل على خصومات غير مسجلة أو تكلفة خاطئة أو تعديل يدوي.",
      impact: `${pct(id.broken / id.checked)} من الصفوف المفحوصة`, whatNext: "تدقيق الصفوف المذكورة مع المحاسب ومطابقتها بالمستند الأصلي.", whatIf: null,
      proof: { columns: id.rule.split(/[−=]/).map((s) => s.trim()), rowRefs: id.rows, metrics: [{ label: "مخالفات", value: id.broken }, { label: "مفحوص", value: id.checked }] }, owner: "finance", expectedOutcome: "صفر مخالفات حسابية", confidence: null,
    });
  }

  const conc = get(caps, "concentration");
  if (ok(conc)) {
    const o = conc!.output as { dim: string; top: string; topShare: number; top20: number; k80: number; count: number; total: number };
    const risky = o.topShare >= 0.25 || o.top20 >= 0.8;
    ins.push({
      id: "concentration", capability: "concentration", severity: risky ? "warning" : "info", kind: risky ? "warning" : "advisory",
      what: `${o.top} يمثل ${pct(o.topShare)} من ${mLabel}، و${o.k80} من ${o.count} عنصراً تصنع 80%.`,
      why: `توزيع ${mLabel} على ${o.dim} غير متساوٍ${risky ? " بدرجة عالية" : ""}.`,
      soWhat: risky ? "الاعتماد على عدد قليل يرفع المخاطر عند فقدان أي منها." : "التوزيع مقبول ويمكن التركيز على الأكثر أثراً.",
      impact: `تعرّض ${money(o.total * o.topShare)} لعنصر واحد`, whatNext: risky ? `خطة حماية لـ ${o.top} وتنمية العناصر من المرتبة ${o.k80 + 1} فما بعد.` : `متابعة أعلى ${o.k80} عنصراً أسبوعياً.`,
      whatIf: `لو فُقد ${o.top} لانخفض الإجمالي إلى ${money(o.total * (1 - o.topShare))}.`,
      proof: { columns: conc!.provenance.columns, rowRefs: conc!.provenance.rowRefs, metrics: conc!.evidence }, owner: ownerFor(c, o.dim), expectedOutcome: risky ? "خفض حصة الأكبر تحت 25% خلال 3 أشهر" : null, confidence: null,
    });
  }

  const tr = get(caps, "trends");
  if (ok(tr)) {
    const o = tr!.output as { slope: number; r2: number; growth: number; first: string; last: string };
    const down = o.slope < 0;
    ins.push({
      id: "trend", capability: "trends", severity: down && o.r2 > 0.3 ? "warning" : down ? "info" : "opportunity", kind: down ? "warning" : "opportunity",
      what: `${mLabel} ${down ? "يتراجع" : "يرتفع"} بمعدل ${fmt(Math.abs(o.slope))} شهرياً (${pct(o.growth)} من ${o.first} إلى ${o.last}).`,
      why: `خط الاتجاه يفسر ${pct(o.r2, 0)} من التباين الشهري.`, soWhat: down ? "استمرار التراجع يضغط على الإيراد والسيولة." : "زخم إيجابي يمكن البناء عليه.",
      impact: `${down ? "−" : "+"}${money(Math.abs(o.slope) * 3)} خلال 3 أشهر إذا استمر الاتجاه`, whatNext: down ? "تحديد العناصر المسببة للتراجع (انظر المحركات) ووضع خطة تصحيح." : "تعزيز القنوات/العناصر الصاعدة وتأمين المخزون اللازم.",
      whatIf: `لو انعكس الاتجاه، يتغير الإجمالي الفصلي بنحو ${money(Math.abs(o.slope) * 6)}.`,
      proof: { columns: tr!.provenance.columns, rowRefs: tr!.provenance.rowRefs.slice(0, 20), metrics: tr!.evidence }, owner: ownerFor(c), expectedOutcome: down ? "إيقاف التراجع خلال فترتين" : null, confidence: Math.round(o.r2 * 100) / 100,
    });
  }

  const cmp = get(caps, "comparisons");
  const pop = (cmp?.output as { pop: { last: string; prev: string; change: number; lastV: number; prevV: number } | null } | undefined)?.pop;
  if (pop && Math.abs(pop.change) >= 0.15) ins.push({
    id: "pop", capability: "comparisons", severity: pop.change < 0 ? "warning" : "opportunity", kind: pop.change < 0 ? "warning" : "opportunity",
    what: `${pop.last}: ${mLabel} ${pop.change < 0 ? "انخفض" : "ارتفع"} ${pct(Math.abs(pop.change))} مقارنة بـ ${pop.prev}.`,
    why: "فرق كبير بين آخر فترتين.", soWhat: "قد تكون الفترة الأخيرة غير مكتملة أو حدث تغير فعلي يستدعي التحقق.",
    impact: money(pop.lastV - pop.prevV), whatNext: "التأكد من اكتمال بيانات الفترة الأخيرة ثم مراجعة المساهمين في التغير.", whatIf: null,
    proof: { columns: cmp!.provenance.columns, rowRefs: cmp!.provenance.rowRefs.slice(0, 20), metrics: [{ label: pop.prev, value: fmt(pop.prevV) }, { label: pop.last, value: fmt(pop.lastV) }] }, owner: ownerFor(c), expectedOutcome: null, confidence: null,
  });

  const outl = get(caps, "outliers");
  if (ok(outl) && (outl!.output as { count: number }).count) {
    const o = outl!.output as { count: number; flagged: { row: number; value: number }[]; hiF: number };
    ins.push({
      id: "outliers", capability: "outliers", severity: "warning", kind: "warning",
      what: `${o.count} قيمة شاذة في ${c.roles.measure}، أكبرها ${fmt(o.flagged[0]!.value)} (صف ${o.flagged[0]!.row}).`,
      why: `تتجاوز الحد الإحصائي ${fmt(o.hiF)}.`, soWhat: "قد تكون صفقة استثنائية حقيقية أو خطأ إدخال يشوّه المتوسطات.",
      impact: null, whatNext: "مراجعة الصفوف وتصنيف كل قيمة: خطأ يُصحح أم حالة استثنائية تُوثق.", whatIf: "استبعادها يغير المتوسط — انظر التحليل المضاد.",
      proof: { columns: [c.roles.measure!], rowRefs: o.flagged.map((f) => f.row), metrics: outl!.evidence }, owner: "data", expectedOutcome: "تصنيف 100% من القيم الشاذة", confidence: null,
    });
  }

  const an = get(caps, "anomalies");
  if (ok(an) && (an!.output as unknown[]).length) {
    const f = (an!.output as { period: string; value: number; z: number }[])[0]!;
    ins.push({ id: "anomaly", capability: "anomalies", severity: "warning", kind: "warning", what: `فترة ${f.period} شاذة (z=${fmt(f.z, 1)}) بقيمة ${fmt(f.value)}.`, why: "بعيدة جداً عن الوسيط الشهري.", soWhat: "حدث غير عادي يجب فهمه قبل استخدامه في التخطيط.", impact: null, whatNext: "التحقق من الأحداث في هذه الفترة (عروض، انقطاع، تسويات).", whatIf: null, proof: { columns: an!.provenance.columns, rowRefs: an!.provenance.rowRefs.slice(0, 20), metrics: an!.evidence }, owner: ownerFor(c), expectedOutcome: null, confidence: null });
  }

  const cp = get(caps, "change_points");
  if (ok(cp) && cp!.output) {
    const o = cp!.output as { period: string; before: number; after: number };
    ins.push({ id: "changepoint", capability: "change_points", severity: o.after < o.before ? "warning" : "opportunity", kind: "advisory", what: `تحوّل هيكلي بدءاً من ${o.period}: المتوسط من ${fmt(o.before)} إلى ${fmt(o.after)}.`, why: "فرق معنوي إحصائياً بين ما قبل وما بعد.", soWhat: "خط الأساس القديم لم يعد صالحاً للمقارنة أو الأهداف.", impact: money((o.after - o.before) * 3) + " فصلياً", whatNext: "تحديث الأهداف وخط الأساس، وتوثيق سبب التحول.", whatIf: null, proof: { columns: cp!.provenance.columns, rowRefs: cp!.provenance.rowRefs, metrics: cp!.evidence }, owner: "management", expectedOutcome: null, confidence: null });
  }

  const dr = get(caps, "drivers");
  if (ok(dr)) {
    const o = dr!.output as { eta: { dim: string; eta2: number }[]; contrib: { name: string; delta: number }[] };
    const top = o.contrib[0];
    if (top) ins.push({ id: "driver-delta", capability: "drivers", severity: top.delta < 0 ? "warning" : "opportunity", kind: "advisory", what: `${top.name} هو أكبر مساهم في تغير آخر فترة (${top.delta > 0 ? "+" : ""}${fmt(top.delta)}).`, why: "تفكيك الفرق بين آخر فترتين حسب العناصر.", soWhat: "التركيز على هذا العنصر يعطي أكبر أثر.", impact: money(top.delta), whatNext: `مراجعة وضع ${top.name} مع المسؤول عنه هذا الأسبوع.`, whatIf: null, proof: { columns: dr!.provenance.columns, rowRefs: [], metrics: o.contrib.slice(0, 4).map((x) => ({ label: x.name, value: fmt(x.delta) })) }, owner: ownerFor(c, c.roles.entity), expectedOutcome: null, confidence: null });
    else if (o.eta[0] && o.eta[0].eta2 > 0.3) ins.push({ id: "driver-eta", capability: "drivers", severity: "info", kind: "guidance", what: `${o.eta[0].dim} يفسر ${pct(o.eta[0].eta2, 0)} من تباين ${mLabel}.`, why: "تحليل التباين بين الشرائح.", soWhat: "إدارة هذا البعد هي الرافعة الأقوى إحصائياً (ليست سببية مثبتة).", impact: null, whatNext: `بناء خطة لكل شريحة في ${o.eta[0].dim}.`, whatIf: null, proof: { columns: [o.eta[0].dim], rowRefs: [], metrics: dr!.evidence }, owner: ownerFor(c, o.eta[0].dim), expectedOutcome: null, confidence: null });
  }

  const fc = get(caps, "forecast");
  if (ok(fc)) {
    const o = fc!.output as { forecast: { period: string; point: number; lo: number; hi: number }[]; mape: number };
    ins.push({ id: "forecast", capability: "forecast", severity: "info", kind: "guidance", what: `التوقع لـ ${o.forecast[0]!.period}: ${fmt(o.forecast[0]!.point)} (النطاق ${fmt(o.forecast[0]!.lo)} – ${fmt(o.forecast[0]!.hi)}).`, why: "نموذج هولت على السلسلة الشهرية.", soWhat: "أساس للتخطيط والمشتريات والتدفق النقدي.", impact: null, whatNext: "استخدام الحد الأدنى للتخطيط المتحفظ والحد الأعلى لتأمين الطاقة.", whatIf: "لو جاء الفعلي خارج النطاق، يُعاد تقدير النموذج.", proof: { columns: fc!.provenance.columns, rowRefs: [], metrics: fc!.evidence }, owner: c.domains.includes("inventory") || c.domains.includes("purchases") ? "purchasing" : "finance", expectedOutcome: `خطأ توقع ≤ ${pct(Math.max(0.1, o.mape))}`, confidence: Math.max(0, Math.round((1 - o.mape) * 100) / 100) });
  }

  const cd = get(caps, "cross_domain");
  const cover = ok(cd) ? (cd!.output as { cover: number | null } | undefined)?.cover : null;
  if (cover != null) ins.push({ id: "coverage", capability: "cross_domain", severity: cover < 15 ? "critical" : cover > 120 ? "warning" : "info", kind: cover < 15 ? "warning" : cover > 120 ? "opportunity" : "guidance", what: `المخزون يغطي نحو ${fmt(cover)} يوماً من الطلب.`, why: "نسبة الرصيد إلى متوسط البيع اليومي.", soWhat: cover < 15 ? "خطر نفاد قريب." : cover > 120 ? "رأس مال مجمد في مخزون زائد." : "التغطية ضمن نطاق مقبول.", impact: null, whatNext: cover < 15 ? "إصدار طلب شراء عاجل للأصناف الأعلى حركة." : cover > 120 ? "خطة تصريف/إيقاف شراء للأصناف الراكدة." : "مراقبة أسبوعية.", whatIf: null, proof: { columns: cd!.provenance.columns, rowRefs: [], metrics: cd!.evidence }, owner: cover < 15 ? "purchasing" : "inventory", expectedOutcome: "تغطية بين 30 و60 يوماً", confidence: null });

  const opt = get(caps, "optimization");
  if (ok(opt) && opt!.output) {
    const r = opt!.output as { name: string; margin: number }[];
    const low = r[r.length - 1];
    if (low && low.margin < 0.05) ins.push({ id: "low-margin", capability: "optimization", severity: low.margin < 0 ? "critical" : "warning", kind: "warning", what: `${low.name} بهامش ${pct(low.margin)}.`, why: "الربح منخفض أو سالب مقارنة بالمبيعات.", soWhat: "كل وحدة إضافية قد تُضعف الربحية.", impact: null, whatNext: "مراجعة التسعير أو التكلفة أو الخصومات لهذا العنصر.", whatIf: null, proof: { columns: opt!.provenance.columns, rowRefs: [], metrics: opt!.evidence }, owner: "finance", expectedOutcome: "هامش ≥ 10%", confidence: null });
  }

  const al = get(caps, "active_learning");
  if (al && (al.output as unknown[]).length) ins.push({ id: "mapping-review", capability: "active_learning", severity: "info", kind: "guidance", what: `${(al.output as unknown[]).length} عمود يحتاج تأكيد معناه.`, why: "لم يتم التعرف على العنوان بثقة كافية.", soWhat: "تأكيد المعنى يفتح قدرات إضافية ويُحفظ للتقارير القادمة.", impact: null, whatNext: "افتح تبويب البيانات وأكّد معنى الأعمدة.", whatIf: null, proof: { columns: (al.output as { name: string }[]).map((x) => x.name), rowRefs: [], metrics: al.evidence }, owner: "data", expectedOutcome: null, confidence: null });

  const order = { critical: 0, warning: 1, opportunity: 2, info: 3 };
  ins.sort((a, b) => order[a.severity] - order[b.severity]);
  return ins;
}

export function buildTasks(ins: Insight[]): WorkTaskDraft[] {
  return ins.map((i, k) => ({
    id: `t-${k}`, findingId: i.id, role: i.owner,
    title: i.whatNext, detail: i.what,
    priority: i.severity === "critical" ? "high" : i.severity === "warning" ? "medium" : "low",
    dueInDays: i.severity === "critical" ? 0 : i.severity === "warning" ? 2 : 7,
  }));
}

export function businessQuestions(c: Ctx, caps: CapabilityResult[], archetypeQuestions: string[]) {
  const av = (id: string) => !!ok(get(caps, id));
  const ev = (id: string, i = 0) => String(get(caps, id)?.evidence[i]?.value ?? "");
  const qs = [
    { q: "ما الحجم الإجمالي؟", answered: av("core_metrics"), a: av("core_metrics") ? ev("core_metrics", 1) || ev("core_metrics", 0) : "لا يوجد مقياس رقمي" },
    { q: "من/ما الأكبر أثراً؟", answered: av("concentration"), a: av("concentration") ? ev("concentration", 0) : "يتطلب بُعداً تصنيفياً" },
    { q: "هل الأداء يتحسن أم يتراجع؟", answered: av("trends"), a: av("trends") ? ev("trends", 2) : get(caps, "trends")!.why },
    { q: "ماذا نتوقع للفترة القادمة؟", answered: av("forecast"), a: av("forecast") ? ev("forecast", 0) : get(caps, "forecast")!.why },
    { q: "هل البيانات موثوقة؟", answered: true, a: ev("quality", 0) },
    { q: "ما الذي يفسر التغير؟", answered: av("drivers"), a: av("drivers") ? ev("drivers", 0) : get(caps, "drivers")!.why },
    { q: "هل توجد حالات غير طبيعية؟", answered: av("outliers"), a: av("outliers") ? ev("outliers", 0) + " قيمة شاذة" : get(caps, "outliers")!.why },
    { q: "هل نعرف السبب الحقيقي؟", answered: false, a: get(caps, "causal")!.why },
  ];
  for (const q of archetypeQuestions.slice(0, 4)) qs.push({ q, answered: false, a: "سؤال تخصصي من نموذج التقرير المطابق — راجع الأدلة أعلاه." });
  return qs;
}
