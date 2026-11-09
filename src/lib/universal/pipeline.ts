import { detectReportArchetype } from "@/lib/report-intelligence/archetype-registry";
import { buildInsights, buildTasks, businessQuestions } from "./advise";
import { derivedCapabilities, groupBy, periodSeries, runCapabilities, type Ctx } from "./capabilities";
import { detectDomains, normHeader, pickRoles, profileColumns } from "./profile";
import type { AnalysisResult, ArchetypeAcceleration, PipelineStage, RawTable } from "./types";

export const ENGINE_VERSION = "universal-1.0.0";

/** Structural signature: same headers ⇒ same report family (enables decision replay). */
export function reportSignature(t: RawTable) {
  return t.headers.map(normHeader).sort().join("|");
}

export function analyzeTable(t: RawTable, fileName: string, opts: { learned?: Record<string, string>; priorSameSignature?: number } = {}): AnalysisResult {
  const stages: PipelineStage[] = [];
  const st = (id: string, label: string, status: PipelineStage["status"], note: string) => stages.push({ id, label, status, note });
  st("upload", "رفع", "done", fileName);
  st("discover", "اكتشاف", "done", `${t.sheet ? `ورقة «${t.sheet}»، ` : ""}ترويسة في الصف ${t.headerRow}`);
  st("parse", "قراءة", "done", `${t.rows.length} صف × ${t.headers.length} عمود`);
  const cols = profileColumns(t, opts.learned);
  st("normalize", "توحيد", "done", "أرقام عربية/فواصل/تواريخ/صفوف إجمالي مستبعدة");
  const mapped = cols.filter((c) => c.field).length;
  st("semantic", "ربط دلالي", mapped ? "done" : "review", `${mapped} من ${cols.length} عمود مربوط بحقل معياري`);
  const roles = pickRoles(cols, t.rows.length);
  const domains = detectDomains(cols, fileName);
  st("profile", "توصيف", "done", `مقياس: ${roles.measure ?? "—"} • تاريخ: ${roles.date ?? "—"} • أبعاد: ${roles.dimensions.length}`);

  // Archetype = specialised accelerator only; unknown reports still run every capability.
  let archetype: ArchetypeAcceleration = { state: "NOT_AVAILABLE", reason: "NO_MATCH", id: null, title: null, decisionQuestions: [], recommendationFocus: [] };
  try {
    const d = detectReportArchetype({ sourcePath: fileName, specialty: null, availableFields: cols.map((c) => c.field ?? c.name) as never });
    if (d.profile) archetype = { state: d.state, reason: d.reason, id: d.profile.id, title: d.profile.title, decisionQuestions: d.profile.decisionQuestions ?? [], recommendationFocus: d.profile.recommendationFocus ?? [] };
    else archetype = { ...archetype, state: d.state, reason: d.reason };
  } catch (e) {
    archetype = { ...archetype, state: "BLOCKED", reason: `ARCHETYPE_ERROR: ${(e as Error).message}` };
  }

  const ctx: Ctx = { t, cols, roles, domains, priorSameSignature: opts.priorSameSignature ?? 0 };
  const caps = runCapabilities(ctx);
  const q = caps.find((c) => c.id === "quality")!;
  const qualityScore = (q.output as { score: number }).score;
  st("quality", "جودة البيانات", qualityScore >= 70 ? "done" : "review", `${qualityScore}/100`);
  st("truth", "الحقيقة", "done", "كل رقم مشتق من صفوف الملف مع رقم الصف");
  st("detect", "رصد القدرات", "done", `${caps.length} قدرة مفحوصة`);
  const insights = buildInsights(ctx, caps);
  const questions = businessQuestions(ctx, caps, archetype.decisionQuestions);
  const derived = derivedCapabilities(ctx, caps, {
    risks: insights.filter((i) => i.kind === "warning").length,
    opps: insights.filter((i) => i.kind === "opportunity").length,
    total: insights.length, questions,
  });
  const capabilities = [...caps, ...derived];
  const avail = capabilities.filter((c) => c.status === "AVAILABLE").length;
  st("run", "تشغيل", "done", `${avail} متاحة من ${capabilities.length}`);
  st("explain", "تفسير", "done", "ماذا ← لماذا ← وماذا يعني ← الأثر ← الخطوة ← الدليل");
  st("advise", "توصية", "done", `${insights.length} نتيجة`);
  const tasks = buildTasks(insights);
  st("decide", "قرار", "review", "بانتظار اعتمادك لكل توصية");

  const series = periodSeries(ctx).map((s) => ({ period: s.period, value: s.value }));
  const segDim = roles.entity ?? roles.dimensions[0];
  const segments = segDim ? groupBy(ctx, segDim, roles.measure).slice(0, 12).map((g) => ({ name: g.name, value: g.value, count: g.count })) : [];

  return {
    engineVersion: ENGINE_VERSION, fileName, sheet: t.sheet, analyzedAt: new Date().toISOString(),
    rowCount: t.rows.length, columnCount: t.headers.length, columns: cols, roles, domains, qualityScore, archetype,
    capabilities, insights, tasks, stages,
    preview: { headers: t.headers, rows: t.rows.slice(0, 30), sourceRows: t.sourceRows.slice(0, 30) },
    series, segments,
  };
}
