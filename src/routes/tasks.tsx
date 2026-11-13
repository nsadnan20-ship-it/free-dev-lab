import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/use-session";
import { Button } from '@/components/ui/Button';

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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: tasks, error: loadError, isPending, refetch } = useQuery({
    queryKey: ["work_tasks", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_tasks")
        .select("*")
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const setStatus = async (id: string, status: string, note?: string) => {
    setBusyId(id);
    setSaveError(null);
    try {
    const changes = { status, updated_at: new Date().toISOString(), ...(note !== undefined ? { outcome_note: note.trim() } : {}) };
    const { data, error } = await supabase
      .from("work_tasks")
      .update(changes)
      .eq("id", id).select('id').single();
    if (error) throw error;
    if (!data) throw new Error('لم يتم حفظ التغيير؛ تحقق من صلاحية المهمة');
      toast.success(status === "done" ? "أُنجزت المهمة" : "تم التحديث");
      await qc.invalidateQueries({ queryKey: ["work_tasks"] });
      if (outcomeFor === id) { setOutcomeFor(null); setOutcome(''); }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'تعذر حفظ نتيجة المهمة؛ بقيت ملاحظاتك محفوظة في الحقل';
      setSaveError(message);
      toast.error(message);
    } finally {
      setBusyId(null);
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

        {(loading || (user && isPending)) && <p role="status" className="mt-8 text-sm text-muted-foreground">جارٍ التحميل…</p>}
        {loadError && <div role="alert" className="mt-4 text-sm text-foreground">تعذر تحميل المهام. <Button variant="ghost" onClick={() => void refetch()}>إعادة المحاولة</Button></div>}
        {saveError && <p role="alert" className="mt-4 text-sm text-foreground">{saveError}</p>}
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
                    <Link to="/analyses/$id" params={{ id: t.analysis_id }} className="mt-2 inline-block text-xs text-primary">التقرير والدليل</Link>
                    {t.outcome_note && (
                      <p className="mt-2 rounded-lg bg-muted p-2 text-xs text-muted-foreground">
                        النتيجة: {t.outcome_note}
                      </p>
                    )}
                    {t.status !== "done" && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          disabled={busyId !== null}
                          onClick={() => { setOutcomeFor(outcomeFor === t.id ? null : t.id); setOutcome(t.outcome_note ?? ''); setSaveError(null); }}
                          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                        >
                          إنجاز مع نتيجة
                        </Button>
                        <Button variant="secondary"
                          disabled={busyId !== null}
                          onClick={() => setStatus(t.id, "done")}
                          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                        >
                          إنجاز سريع
                        </Button>
                      </div>
                    )}
                    {outcomeFor === t.id && (
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <input
                          aria-label="نتيجة التنفيذ"
                          value={outcome}
                          onChange={(e) => setOutcome(e.target.value)}
                          placeholder="ماذا حدث بعد التنفيذ؟"
                          className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                        />
                        <Button
                          disabled={busyId !== null || !outcome.trim()}
                          onClick={() => void setStatus(t.id, "done", outcome)}
                          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                        >
                          {busyId === t.id ? 'جارٍ الحفظ…' : 'حفظ'}
                        </Button>
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
