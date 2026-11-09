import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { UploadCloud, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/use-session";
import { parseFile, sha256 } from "@/lib/universal/parse";
import { analyzeTable, reportSignature } from "@/lib/universal/pipeline";
import type { AnalysisResult } from "@/lib/universal/types";

export const Route = createFileRoute("/analyze")({
  head: () => ({
    meta: [
      { title: "تحليل تقرير جديد — مستشار التقارير" },
      { name: "description", content: "ارفع ملف Excel أو CSV أو JSON واحصل على تحليل استشاري كامل بدليل من بياناتك." },
      { property: "og:title", content: "تحليل تقرير جديد — مستشار التقارير" },
      { property: "og:description", content: "ارفع ملفك واحصل على رؤى وتوصيات ومهام يومية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnalyzePage,
});

function AnalyzePage() {
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const handleFile = async (file: File) => {
    if (!user) {
      toast.error("سجّل دخولك أولاً لحفظ التحليل");
      navigate({ to: "/" });
      return;
    }
    setBusy(true);
    try {
      setStatus("جارٍ قراءة الملف…");
      const tables = await parseFile(file);
      if (!tables.length) throw new Error("لم يتم العثور على جدول بيانات في الملف");
      const table = tables[0];

      setStatus("جارٍ التحليل الذكي…");
      const hash = await sha256(file);
      const signature = reportSignature(table);

      // Decision replay: how many previous analyses share this report family?
      const { data: prior } = await supabase
        .from("analyses")
        .select("id")
        .eq("user_id", user.id)
        .eq("file_hash", hash);

      const result: AnalysisResult = analyzeTable(table, file.name, {
        priorSameSignature: prior?.length ?? 0,
      });

      setStatus("جارٍ الحفظ…");
      const { data: row, error } = await supabase
        .from("analyses")
        .insert({
          user_id: user.id,
          file_name: file.name,
          file_hash: hash || signature,
          row_count: result.rowCount,
          column_count: result.columnCount,
          archetype: result.archetype.id,
          domain: result.domains.join(", ") || null,
          quality_score: result.qualityScore,
          available_count: result.capabilities.filter((c) => c.status === "AVAILABLE").length,
          engine_version: result.engineVersion,
          result: result as never,
        })
        .select("id")
        .single();
      if (error) throw error;

      if (result.tasks.length) {
        const today = new Date();
        const { error: tErr } = await supabase.from("work_tasks").insert(
          result.tasks.map((t) => ({
            user_id: user.id,
            analysis_id: row.id,
            finding_id: t.findingId,
            role: t.role,
            title: t.title,
            detail: t.detail,
            priority: t.priority,
            due_date: new Date(today.getTime() + t.dueInDays * 86400000).toISOString().slice(0, 10),
            status: "open",
          })),
        );
        if (tErr) throw tErr;
      }

      toast.success("تم التحليل والحفظ بنجاح");
      navigate({ to: "/analyses/$id", params: { id: row.id } });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
      setStatus("");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link to="/" className="text-lg font-bold text-foreground">مستشار التقارير</Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link to="/tasks" className="text-muted-foreground hover:text-foreground">مهامي</Link>
            {user ? (
              <button
                onClick={() => supabase.auth.signOut()}
                className="text-muted-foreground hover:text-foreground"
              >
                خروج
              </button>
            ) : (
              <Link to="/" className="text-muted-foreground hover:text-foreground">دخول</Link>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-3xl font-bold text-foreground">تحليل تقرير جديد</h1>
        <p className="mt-2 text-muted-foreground">
          ارفع ملف Excel أو CSV أو JSON — أي نوع تقرير — وسيحلله المحرك ويخرج الرؤى والتوصيات والمهام.
        </p>

        <button
          type="button"
          disabled={busy || loading}
          onClick={() => inputRef.current?.click()}
          className="mt-8 flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-card px-6 py-16 text-center transition-colors hover:border-primary hover:bg-accent disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          ) : (
            <UploadCloud className="h-10 w-10 text-primary" />
          )}
          <span className="text-lg font-semibold text-card-foreground">
            {busy ? status || "جارٍ العمل…" : "اضغط لاختيار الملف"}
          </span>
          <span className="text-sm text-muted-foreground">
            <FileSpreadsheet className="ml-1 inline h-4 w-4" />
            xlsx • xls • csv • json — بالعربية أو الإنجليزية
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.json,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />

        <p className="mt-4 text-center text-xs text-muted-foreground">
          يُحلَّل الملف داخل متصفحك، ثم تُحفظ النتيجة في حسابك فقط.
        </p>
      </main>
    </div>
  );
}
