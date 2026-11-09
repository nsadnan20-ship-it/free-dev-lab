import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, Lightbulb, Compass, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { AnalysisResult, Insight, CapabilityResult } from "@/lib/universal/types";

export const Route = createFileRoute("/analyses/$id")({
  head: () => ({
    meta: [
      { title: "نتائج التحليل — مستشار التقارير" },
      { name: "description", content: "الرؤى والتوصيات والمهام المستخرجة من تقريرك، بدليل من صفوف الملف." },
      { property: "og:title", content: "نتائج التحليل — مستشار التقارير" },
      { property: "og:description", content: "الرؤى والتوصيات والمهام المستخرجة من تقريرك." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ params }) => {
    const { data, error } = await supabase
      .from("analyses")
      .select("*")
      .eq("id", params.id)
      .single();
    if (error || !data) throw notFound();
    return data;
  },
  component: AnalysisPage,
});

const kindIcon = {
  warning: AlertTriangle,
  opportunity: Lightbulb,
  advisory: Compass,
  guidance: Info,
} as const;

const kindLabel = {
  warning: "تحذير",
  opportunity: "فرصة",
  advisory: "استشارة",
  guidance: "إرشاد",
} as const;

const statusLabel: Record<string, string> = {
  AVAILABLE: "متاحة",
  NOT_AVAILABLE: "غير متاحة",
  INSUFFICIENT_SAMPLE: "عينة غير كافية",
  REVIEW_REQUIRED: "تحتاج مراجعة",
  BLOCKED: "محجوبة",
};

type Tab = "overview" | "insights" | "capabilities" | "data";

function AnalysisPage() {
  const row = Route.useLoaderData();
  const result = row.result as unknown as AnalysisResult;
  const [tab, setTab] = useState<Tab>("overview");

  const { data: decisions, refetch: refetchDecisions } = useQuery({
    queryKey: ["decisions", row.id],
    queryFn: async () => {
      const { data } = await supabase.from("decisions").select("*").eq("analysis_id", row.id);
      return data ?? [];
    },
  });

  const decide = async (findingId: string, verdict: "approved" | "rejected") => {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id;
    if (!uid) return toast.error("سجّل دخولك أولاً");
    const { error } = await supabase.from("decisions").upsert(
      { user_id: uid, analysis_id: row.id, finding_id: findingId, verdict },
      { onConflict: "analysis_id,finding_id" },
    );
    if (error) toast.error(error.message);
    else {
      toast.success(verdict === "approved" ? "تم اعتماد التوصية" : "تم رفض التوصية");
      refetchDecisions();
    }
  };

  const decisionOf = (id: string) => decisions?.find((d) => d.finding_id === id)?.verdict;

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "نظرة عامة" },
    { id: "insights", label: `الرؤى (${result.insights.length})` },
    { id: "capabilities", label: `القدرات (${result.capabilities.length})` },
    { id: "data", label: "البيانات" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link to="/" className="text-lg font-bold text-foreground">مستشار التقارير</Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link to="/analyze" className="text-muted-foreground hover:text-foreground">تحليل جديد</Link>
            <Link to="/tasks" className="text-muted-foreground hover:text-foreground">مهامي</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">{result.fileName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {result.rowCount} صف × {result.columnCount} عمود • جودة البيانات {result.qualityScore}/100
          {result.archetype.title ? ` • النموذج: ${result.archetype.title}` : " • تقرير عام (بدون نموذج متخصص)"}
        </p>

        <div className="mt-6 flex gap-2 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium ${
                tab === t.id
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="mt-6 space-y-6">
            <section className="grid gap-4 md:grid-cols-3">
              <Stat label="رؤى مستخرجة" value={result.insights.length} />
              <Stat label="قدرات متاحة" value={result.capabilities.filter((c) => c.status === "AVAILABLE").length} />
              <Stat label="مهام مقترحة" value={result.tasks.length} />
            </section>

            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold text-card-foreground">مراحل المعالجة</h2>
              <ol className="mt-3 space-y-2">
                {result.stages.map((s) => (
                  <li key={s.id} className="flex items-start gap-2 text-sm">
                    <CheckCircle2
                      className={`mt-0.5 h-4 w-4 shrink-0 ${s.status === "done" ? "text-primary" : "text-muted-foreground"}`}
                    />
                    <span className="font-medium text-foreground">{s.label}:</span>
                    <span className="text-muted-foreground">{s.note}</span>
                  </li>
                ))}
              </ol>
            </section>

            {result.series.length > 1 && (
              <section className="rounded-xl border border-border bg-card p-5">
                <h2 className="font-semibold text-card-foreground">الاتجاه عبر الفترات</h2>
                <div className="mt-3 flex h-40 items-end gap-1">
                  {(() => {
                    const max = Math.max(...result.series.map((s) => Math.abs(s.value)), 1);
                    return result.series.map((s) => (
                      <div key={s.period} className="flex flex-1 flex-col items-center gap-1">
                        <div
                          className="w-full rounded-t bg-primary/80"
                          style={{ height: `${Math.max(4, (Math.abs(s.value) / max) * 120)}px` }}
                          title={`${s.period}: ${s.value.toLocaleString("ar")}`}
                        />
                        <span className="text-[10px] text-muted-foreground">{s.period}</span>
                      </div>
                    ));
                  })()}
                </div>
              </section>
            )}

            {result.segments.length > 0 && (
              <section className="rounded-xl border border-border bg-card p-5">
                <h2 className="font-semibold text-card-foreground">أعلى الشرائح</h2>
                <ul className="mt-3 space-y-2">
                  {(() => {
                    const max = Math.max(...result.segments.map((s) => Math.abs(s.value)), 1);
                    return result.segments.map((s) => (
                      <li key={s.name} className="text-sm">
                        <div className="flex justify-between">
                          <span className="text-foreground">{s.name}</span>
                          <span className="text-muted-foreground">{s.value.toLocaleString("ar")}</span>
                        </div>
                        <div className="mt-1 h-1.5 rounded bg-muted">
                          <div className="h-1.5 rounded bg-primary" style={{ width: `${(Math.abs(s.value) / max) * 100}%` }} />
                        </div>
                      </li>
                    ));
                  })()}
                </ul>
              </section>
            )}
          </div>
        )}

        {tab === "insights" && (
          <div className="mt-6 space-y-4">
            {result.insights.length === 0 && (
              <p className="text-sm text-muted-foreground">لم تُستخرج رؤى من هذا الملف.</p>
            )}
            {result.insights.map((i) => (
              <InsightCard key={i.id} insight={i} verdict={decisionOf(i.id)} onDecide={decide} />
            ))}
          </div>
        )}

        {tab === "capabilities" && (
          <div className="mt-6 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-right font-medium">القدرة</th>
                  <th className="px-3 py-2 text-right font-medium">الحالة</th>
                  <th className="px-3 py-2 text-right font-medium">لماذا</th>
                </tr>
              </thead>
              <tbody>
                {result.capabilities.map((c: CapabilityResult) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-3 py-2 text-foreground">{c.title}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          c.status === "AVAILABLE"
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {statusLabel[c.status] ?? c.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{c.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "data" && (
          <div className="mt-6 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-right font-medium">#</th>
                  {result.preview.headers.map((h, j) => (
                    <th key={j} className="px-2 py-2 text-right font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.preview.rows.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-2 py-1.5 text-muted-foreground">{result.preview.sourceRows[i]}</td>
                    {r.map((c, j) => (
                      <td key={j} className="px-2 py-1.5 text-foreground">{String(c ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 text-center">
      <div className="text-3xl font-bold text-foreground">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

function InsightCard({
  insight: i,
  verdict,
  onDecide,
}: {
  insight: Insight;
  verdict: string | undefined;
  onDecide: (id: string, v: "approved" | "rejected") => void;
}) {
  const Icon = kindIcon[i.kind] ?? Info;
  return (
    <article className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-primary" />
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {kindLabel[i.kind]}
        </span>
        {verdict && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
            {verdict === "approved" ? "معتمدة" : "مرفوضة"}
          </span>
        )}
      </div>
      <h3 className="mt-2 font-semibold text-card-foreground">{i.what}</h3>
      <dl className="mt-3 space-y-2 text-sm">
        <Row k="لماذا" v={i.why} />
        <Row k="وماذا يعني" v={i.soWhat} />
        {i.impact && <Row k="الأثر" v={i.impact} />}
        <Row k="الخطوة التالية" v={i.whatNext} />
        {i.whatIf && <Row k="ماذا لو" v={i.whatIf} />}
      </dl>
      <div className="mt-3 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
        الدليل: أعمدة [{i.proof.columns.join("، ")}] • صفوف: {i.proof.rowRefs.slice(0, 8).join("، ")}
        {i.proof.rowRefs.length > 8 ? "…" : ""}
        {i.proof.metrics.length > 0 && (
          <> • {i.proof.metrics.map((m) => `${m.label}: ${m.value}`).join(" • ")}</>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onDecide(i.id, "approved")}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          اعتماد
        </button>
        <button
          onClick={() => onDecide(i.id, "rejected")}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
        >
          رفض
        </button>
      </div>
    </article>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 font-medium text-foreground">{k}:</dt>
      <dd className="text-muted-foreground">{v}</dd>
    </div>
  );
}
