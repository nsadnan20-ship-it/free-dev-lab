import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock3, FileSearch, ShieldCheck, Target } from 'lucide-react';
import { Link, useSearchParams } from '@/lib/router-compat';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { fetchBusinessReplay, type BusinessReplay, type ReplayEvent } from '@/lib/business-replay';
import { formatNumber } from '@/lib/format';

function stateLabel(value: unknown): string {
  const labels: Record<string,string> = { TRUSTED:'موثوق', VERIFIED:'موثق', REVIEW:'مراجعة', BLOCKED:'محظور', INSUFFICIENT_DATA:'بيانات غير كافية', PENDING_EVIDENCE:'بانتظار الدليل', COMPLETED:'مكتمل', IN_PROGRESS:'قيد التنفيذ', OPEN:'مفتوح' };
  if (value == null || value === '') return 'غير متاح';
  return labels[String(value)] ?? 'غير متاح';
}


function eventTone(event: ReplayEvent): string {
  if (event.kind === 'outcome') return 'border-success-200 bg-success-50';
  if (event.kind === 'work') return 'border-primary-200 bg-primary-50';
  if (event.kind === 'decision') return 'border-warning-200 bg-warning-50';
  if (event.kind === 'stage') return 'border-ink-200 bg-ink-50';
  return 'border-ink-200 bg-white';
}

export function BusinessReplayPage() {
  const [params] = useSearchParams();
  const jobId = params.get('reportJobId')?.trim() || '';
  const sourceHash = params.get('sourceHash')?.trim() || '';
  const [replay, setReplay] = useState<BusinessReplay | null>(null);
  const [loading, setLoading] = useState(Boolean(jobId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId || !sourceHash) {
      setReplay(null);
      setLoading(false);
      setError('REPLAY_SOURCE_CONTEXT_REQUIRED');
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    void fetchBusinessReplay(jobId, sourceHash).then((value) => {
      if (active) setReplay(value);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [jobId, sourceHash]);

  if (loading) return <LoadingState message="جارٍ بناء إعادة تشغيل القرار من السجلات المثبتة..." />;
  if (error) return <ErrorState message={error} />;
  if (!replay) return null;

  const source = replay.report;
  return (
    <div dir="rtl" className="ag-replay-surface space-y-5 pb-10">
      <section className="rounded-[18px] border border-primary-200 bg-primary-50/60 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="text-[9px] font-black tracking-[.14em] text-primary-800">إعادة تشغيل مسار القرار</div>
            <h1 className="mt-1 text-xl font-black text-ink-950">إعادة تشغيل مسار القرار لهذا التقرير</h1>
            <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-ink-600">
              <span>الصفوف: {source.rowCount == null ? 'غير متاح' : formatNumber(source.rowCount)}</span>
              <span>•</span>
              <span>الثقة: {stateLabel(source.trustState)}</span>
              <span>•</span>
              <span>الدليل: {stateLabel(source.evidenceStatus)}</span>
            </div>
            
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={'/reports/smart/' + source.jobId + '?sourceHash=' + encodeURIComponent(source.sourceHash)} className="btn-primary text-[10px]">التقرير الذكي <ArrowLeft size={12}/></Link>
            <Link to={'/work-center?reportJobId=' + source.jobId + '&sourceHash=' + encodeURIComponent(source.sourceHash)} className="btn-secondary text-[10px]">مركز العمل <ArrowLeft size={12}/></Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-ink-200 bg-white p-4"><div className="text-[10px] text-ink-400">الأحداث</div><div className="mt-1 text-2xl font-black">{formatNumber(replay.events.length)}</div></div>
        <div className="rounded-2xl border border-ink-200 bg-white p-4"><div className="text-[10px] text-ink-400">القرارات</div><div className="mt-1 text-2xl font-black">{formatNumber(replay.decisions.length)}</div></div>
        <div className="rounded-2xl border border-ink-200 bg-white p-4"><div className="text-[10px] text-ink-400">المراحل</div><div className="mt-1 text-2xl font-black">{formatNumber(source.stages.length)}</div></div>
      </section>

      <section className="rounded-[18px] border border-ink-200 bg-white p-5 shadow-card lg:p-6">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-primary-700"/>
          <div>
            <div className="section-kicker">السجل الزمني المربوط بالتقرير</div>
            <h2 className="mt-1 text-lg font-black">ما الذي حدث فعليًا لهذا التقرير؟</h2>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {replay.events.length ? replay.events.map((event, index) => (
            <article key={event.key} className={'rounded-xl border p-4 ' + eventTone(event)}>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white">
                  {event.kind === 'outcome' ? <Target size={16} className="text-success-700"/> :
                    event.kind === 'work' ? <CheckCircle2 size={16} className="text-primary-700"/> :
                    event.kind === 'decision' ? <FileSearch size={16} className="text-warning-700"/> :
                    <Clock3 size={16} className="text-ink-500"/>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white px-2 py-1 text-[9px] font-black text-ink-600">{index + 1}</span>
                    <span className="text-xs font-black text-ink-900">{event.title}</span>
                    <span className="rounded-full bg-white px-2 py-1 text-[9px] font-bold text-ink-600">{stateLabel(event.status)}</span>
                    {event.at && <span className="text-[9px] text-ink-400">{new Date(event.at).toLocaleString('ar-YE')}</span>}
                  </div>
                  <div className="mt-2 text-[11px] leading-6 text-ink-700">{event.detail}</div>
                </div>
              </div>
            </article>
          )) : <div className="rounded-xl border border-warning-200 bg-warning-50 p-4 text-[10px] text-warning-900">لا توجد أحداث مثبتة لهذا المصدر حتى الآن.</div>}
        </div>
      </section>
    </div>
  );
}
