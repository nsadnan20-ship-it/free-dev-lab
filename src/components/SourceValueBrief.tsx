import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, FileSearch } from 'lucide-react';
import { analyzeTable } from '@/lib/universal/pipeline';
import type { Cell } from '@/lib/universal/types';

export interface BriefSource { name: string; rows: Record<string, unknown>[] }

/** Different tables are evaluated separately: totals never cross incompatible schemas. */
export function SourceValueBrief({ sources }: { sources: BriefSource[] }) {
  const analyses = useMemo(() => sources.filter((s) => s.rows.length).map((source) => {
    const headers = [...new Set(source.rows.flatMap(Object.keys))].filter((h) => !h.startsWith('_source_'));
    const result = analyzeTable({ sheet: source.name, headers,
      rows: source.rows.map((row) => headers.map((h): Cell => typeof row[h] === 'number' ? row[h] as number : row[h] == null ? null : String(row[h]))),
      sourceRows: source.rows.map((row, i) => {
        const original = Number(row._source_row);
        return Number.isInteger(original) && original > 0 ? original : i + 1;
      }), headerRow: 1 }, source.name);
    return { source, result };
  }), [sources]);
  if (!analyses.length) return null;
  return <section aria-label="خلاصة المصدر" className="space-y-4 border-y border-border py-5 text-foreground">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-lg font-bold"><FileSearch size={20}/> ماذا تقول بيانات تقريرك؟</h2>
      <span className="text-sm text-muted-foreground">{analyses.length} جداول · {analyses.reduce((sum, a) => sum + a.source.rows.length, 0).toLocaleString('ar')} سجلات مقروءة</span>
    </div>
    {analyses.map(({ source, result }, index) => <div key={index} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{source.name}</h3><span className="text-xs text-muted-foreground">{result.rowCount.toLocaleString('ar')} سجل · {result.capabilities.filter((c) => c.status === 'AVAILABLE').length} تحليلات متاحة</span></div>
      <div className="grid gap-3 lg:grid-cols-2">
        {result.insights.slice(0, 4).map((insight) => <article key={insight.id} className="rounded-lg border border-border bg-card p-4 text-card-foreground">
          <h4 className="flex items-start gap-2 font-bold">{insight.severity === 'warning' || insight.severity === 'critical' ? <AlertTriangle size={18} className="shrink-0 text-warning-700"/> : <CheckCircle2 size={18} className="shrink-0 text-success-700"/>}{insight.what}</h4>
          <p className="mt-2 text-sm leading-6">{insight.soWhat}</p>
          <p className="mt-2 text-sm font-semibold">{insight.whatNext}</p>
          <div className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">{insight.proof.metrics.map((m) => `${m.label}: ${m.value}`).join(' · ')}{insight.proof.rowRefs.length > 0 && ` · السجلات: ${insight.proof.rowRefs.slice(0, 6).join('، ')}`}</div>
        </article>)}
      </div>
      {!result.insights.length && <p className="text-sm text-muted-foreground">لا توجد إشارة استثنائية مثبتة في هذا الجدول؛ لا يُستنتج من ذلك غياب المخاطر.</p>}
      {result.capabilities.filter((c) => c.status === 'REVIEW_REQUIRED' || c.status === 'INSUFFICIENT_SAMPLE').slice(0, 2).map((c) => <p key={c.id} className="flex gap-2 text-sm text-muted-foreground"><AlertTriangle size={16} className="shrink-0"/>{c.title}: {c.why}</p>)}
    </div>)}
  </section>;
}