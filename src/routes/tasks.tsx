import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/use-session";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "لوحة المهام اليومية — مستشار التقارير" },
      { name: "description", content: "مهام فريقك المستخرجة من التحليلات، موزعة حسب التخصص والأولوية." },
      { property: "og:title", content: "لوحة المهام اليومية — مستشار التقارير" },
      { property: "og:description", content: "مهام فريقك المستخرجة من التحليلات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TasksPage,
});

const roleLabel: Record<string, string> = {
  sales: "المبيعات",
  purchasing: "المشتريات",
  inventory: "المخزون",
  finance: "المالية",
  data: "البيانات",
  management: "الإدارة",
  operations: "العمليات",
};

const priorityLabel: Record<string, string> = { high: "عالية", medium: "متوسطة", low: "منخفضة" };

function TasksPage() {
  const { user, loading } = useSession();
  const qc = useQueryClient();
  const [outcomeFor, setOutcomeFor] = useState<string | null>(null);
  const [outcome, setOutcome] = useState("");

  const { data: tasks } = useQuery({
    queryKey: ["work_tasks", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("work_tasks")
        .select("*")
        .order("due_date", { ascending: true });
      return data ?? [];
    },
  });

  const setStatus = async (id: string, status: string, note?: string) => {
    const { error } = await supabase
      .from("work_tasks")
      .update({ status, outcome_note: note ?? null, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(status === "done" ? "أُنجزت المهمة" : "تم التحديث");
      qc.invalidateQueries({ queryKey: ["work_tasks"] });
    }
  };

  const groups = ["open", "done"] as const;
  const byStatus = (s: string) => (tasks ?? []).filter((t) => (s === "open" ? t.status !== "done" : t.status === "done"));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link to="/" className="text-lg font-bold text-foreground">مستشار التقارير</Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link to="/analyze" className="text-muted-foreground hover:text-foreground">تحليل جديد</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">لوحة المهام اليومية</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          مهام مستخرجة من تحليلاتك، موزعة حسب تخصص كل موظف.
        </p>

        {loading && <p className="mt-8 text-sm text-muted-foreground">جارٍ التحميل…</p>}
        {!loading && !user && (
          <p className="mt-8 text-sm text-muted-foreground">
            <Link to="/" className="text-primary hover:underline">سجّل دخولك</Link> لعرض مهامك.
          </p>
        )}
        {user && tasks && tasks.length === 0 && (
          <p className="mt-8 text-sm text-muted-foreground">
            لا مهام بعد — <Link to="/analyze" className="text-primary hover:underline">حلّل تقريراً</Link> لتوليد مهام لفريقك.
          </p>
        )}

        {groups.map((g) => {
          const list = byStatus(g);
          if (!list.length) return null;
          return (
            <section key={g} className="mt-8">
              <h2 className="text-lg font-semibold text-foreground">
                {g === "open" ? `قيد التنفيذ (${list.length})` : `مكتملة (${list.length})`}
              </h2>
              <div className="mt-3 space-y-3">
                {list.map((t) => (
                  <article key={t.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                        {roleLabel[t.role] ?? t.role}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                        أولوية {priorityLabel[t.priority] ?? t.priority}
                      </span>
                      {t.due_date && (
                        <span className="text-muted-foreground">الاستحقاق: {t.due_date}</span>
                      )}
                    </div>
                    <h3 className="mt-2 font-semibold text-card-foreground">{t.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{t.detail}</p>
                    {t.outcome_note && (
                      <p className="mt-2 rounded-lg bg-muted p-2 text-xs text-muted-foreground">
                        النتيجة: {t.outcome_note}
                      </p>
                    )}
                    {t.status !== "done" && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={() => setOutcomeFor(outcomeFor === t.id ? null : t.id)}
                          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                        >
                          إنجاز مع نتيجة
                        </button>
                        <button
                          onClick={() => setStatus(t.id, "done")}
                          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                        >
                          إنجاز سريع
                        </button>
                      </div>
                    )}
                    {outcomeFor === t.id && (
                      <div className="mt-3 flex gap-2">
                        <input
                          value={outcome}
                          onChange={(e) => setOutcome(e.target.value)}
                          placeholder="ماذا حدث بعد التنفيذ؟ (يتعلم النظام منها)"
                          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                        />
                        <button
                          onClick={() => {
                            setStatus(t.id, "done", outcome);
                            setOutcomeFor(null);
                            setOutcome("");
                          }}
                          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                        >
                          حفظ
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
