import { useEffect, useMemo, useState } from 'react';
import { ArrowUpLeft, BookmarkCheck, FileSearch, Filter, RotateCcw, Star } from 'lucide-react';
import { Link, useSearchParams } from '@/lib/router-compat';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { fetchAdvisorBusinessCases, setAdvisorBusinessCaseFollowed, type AdvisorBusinessCase } from '@/lib/report-decisions';

const statusLabel: Record<string, string> = {
  candidate: 'محفوظ',
  ready: 'جاهز للمراجعة',
  approved: 'معتمد',
  executed: 'منفذ',
  deferred: 'مؤجل',
  blocked: 'محجوب',
};

const priorityLabel: Record<string, string> = {
  P0: 'P0 · عاجل',
  P1: 'P1 · مرتفع',
  P2: 'P2 · متوسط',
  P3: 'P3 · متابعة',
};

export function AdvisorCasesPage() {
  const [params] = useSearchParams();
  const contextReportJobId = params.get('reportJobId')?.trim() || '';
  const contextSourceHash = params.get('sourceHash')?.trim() || '';
  const [cases, setCases] = useState<AdvisorBusinessCase[]>([]);
  const [filter, setFilter] = useState<'all' | 'followed' | 'open' | 'done'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setCases(await fetchAdvisorBusinessCases());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل قضايا Advisor');
      setCases([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const contextCases = useMemo(() => {
    if (!contextReportJobId || !contextSourceHash) return cases;
    return cases.filter((item) => item.reportJobId === contextReportJobId && item.sourceHash === contextSourceHash);
  }, [cases, contextReportJobId, contextSourceHash]);

  const visibleCases = useMemo(() => contextCases.filter((item) => {
    if (filter === 'followed') return item.followed;
    if (filter === 'done') return ['executed', 'approved'].includes(item.status);
    if (filter === 'open') return !['executed', 'approved', 'blocked'].includes(item.status);
    return true;
  }), [contextCases, filter]);

  const toggleFollow = async (item: AdvisorBusinessCase) => {
    setBusyId(item.id);
    try {
      await setAdvisorBusinessCaseFollowed(item.id, !item.followed);
      setCases((current) => current.map((entry) => entry.id === item.id ? { ...entry, followed: !entry.followed } : entry));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحديث المتابعة');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div dir="rtl" className="ag-advisor-cases-surface space-y-5">
      <section className="rounded-[18px] border border-primary-200 bg-ink-950 p-5 text-white shadow-card lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] font-black tracking-[.16em] text-primary-200">ADVISOR CASE BOOK</div>
            <h1 className="mt-2 text-2xl font-black">قضايا الأعمال من التقارير</h1>
            <p className="mt-2 max-w-3xl text-[11px] leading-6 text-ink-300">
              كل قضية هنا ناتجة عن Insight محفوظ مرتبط بقرار ومصدر ودليل. لا توجد بطاقة وهمية منفصلة عن التقرير.
              يمكنك العودة للقضية، متابعتها، ثم استئناف السلسلة نفسها من القرار إلى النتيجة.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label={contextReportJobId && contextSourceHash ? 'قضايا التقرير' : 'كل القضايا'} value={contextCases.length} />
            <Metric label="متابعة" value={contextCases.filter((item) => item.followed).length} />
            <Metric label="مفتوحة" value={contextCases.filter((item) => !['executed','approved','blocked'].includes(item.status)).length} />
            <Metric label="مكتملة" value={contextCases.filter((item) => ['executed','approved'].includes(item.status)).length} />
          </div>
        </div>
      </section>

      {contextReportJobId && contextSourceHash ? (
        <section dir="rtl" className="rounded-[18px] border border-primary-200 bg-primary-50/60 p-4 shadow-sm" aria-label="سياق التقرير الحالي في قضايا Advisor">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="text-[9px] font-black tracking-[.14em] text-primary-800">SOURCE-BOUND ADVISOR CASES</div>
              <h2 className="mt-1 text-base font-black text-ink-950">قضايا التقرير الحالي فقط</h2>
              <p className="mt-1 text-[10px] leading-5 text-ink-700">تم تقييد العرض على نفس reportJobId والبصمة المصدرية التي فتحت منها هذه المساحة؛ لا تختلط قضايا تقارير أخرى.</p>
              <div className="mt-2 flex flex-wrap gap-2 text-[8px] text-ink-500"><span className="rounded-full bg-white px-2 py-1 font-mono">job={contextReportJobId}</span><span className="rounded-full bg-white px-2 py-1 font-mono">hash={contextSourceHash}</span><span className="rounded-full bg-white px-2 py-1 font-black">{contextCases.length} قضية مرتبطة</span></div>
            </div>
            <Link to={'/reports/smart/' + encodeURIComponent(contextReportJobId) + '?sourceHash=' + encodeURIComponent(contextSourceHash)} className="btn-primary text-[10px]">العودة إلى التقرير الذكي <FileSearch size={12}/></Link>
          </div>
        </section>
      ) : null}

      <Card>
        <CardHeader
          kicker="CONTINUITY"
          title="احفظ ما يستحق المتابعة، ولا تفقد السياق"
          subtitle="الحالة، المصدر، سؤال الأعمال، الدليل، التوصية، المالك والنتيجة المتوقعة محفوظة مع القضية."
          action={
            <button type="button" onClick={() => void load()} className="btn-ghost text-[10px]" aria-label="تحديث القضايا">
              <RotateCcw size={13} /> تحديث
            </button>
          }
        />
        <CardBody>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="مرشحات قضايا Advisor">
            {([
              ['all', 'الكل'],
              ['followed', 'المتابعة'],
              ['open', 'المفتوحة'],
              ['done', 'المكتملة'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={'rounded-full px-3 py-2 text-[9px] font-black ' + (filter === key ? 'bg-primary-700 text-white' : 'border border-ink-200 bg-white text-ink-600 hover:bg-ink-50')}
                aria-selected={filter === key}
              >
                <Filter size={12} className="inline-block ml-1" />{label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="mt-5 rounded-xl border border-dashed border-ink-200 bg-ink-50/60 p-8 text-center text-[10px] text-ink-500">جارٍ تحميل القضايا المحفوظة من السجل الكانوني...</div>
          ) : error ? (
            <div className="mt-5 rounded-xl border border-danger-200 bg-danger-50 p-4 text-[10px] leading-5 text-danger-900"><strong>تعذر تحميل القضايا.</strong><div className="mt-1">{error}</div></div>
          ) : visibleCases.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed border-ink-200 bg-ink-50/60 p-8 text-center">
              <BookmarkCheck size={24} className="mx-auto text-ink-400" />
              <div className="mt-3 text-sm font-black text-ink-800">لا توجد قضية محفوظة في هذا المرشح</div>
              <p className="mt-1 text-[10px] leading-5 text-ink-500">من داخل Advisor احفظ الإشارة المهمة كقضية، وستظهر هنا مع نفس المصدر والدليل.</p>
              <Link to={contextReportJobId && contextSourceHash ? '/reports/smart/' + encodeURIComponent(contextReportJobId) + '?sourceHash=' + encodeURIComponent(contextSourceHash) : '/reports'} className="mt-3 inline-flex btn-secondary text-[10px]">{contextReportJobId && contextSourceHash ? 'العودة إلى التقرير الحالي' : 'العودة إلى مركز التقارير'} <ArrowUpLeft size={12}/></Link>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {visibleCases.map((item) => (
                <article key={item.id} className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-primary-50 px-2 py-1 text-[8px] font-black text-primary-800">{priorityLabel[item.priority] ?? item.priority}</span>
                        <span className="rounded-full bg-ink-50 px-2 py-1 text-[8px] font-black text-ink-600">{statusLabel[item.status] ?? item.status}</span>
                        {item.followed && <span className="rounded-full bg-warning-50 px-2 py-1 text-[8px] font-black text-warning-900"><Star size={10} className="inline-block ml-1" />متابعة</span>}
                      </div>
                      <h2 className="mt-2 text-base font-black text-ink-950">{item.issue}</h2>
                      <p className="mt-1 text-[10px] leading-5 text-ink-500">{item.question}</p>
                    </div>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void toggleFollow(item)}
                      className="btn-ghost text-[9px] disabled:opacity-50"
                    >
                      <Star size={13} />{item.followed ? 'إلغاء المتابعة' : 'متابعة القضية'}
                    </button>
                  </div>

                  <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                    <CaseField label="WHY" value={item.why} />
                    <CaseField label="SO WHAT / IMPACT" value={item.impact} />
                    <CaseField label="WHAT NEXT" value={item.whatNext} />
                    <CaseField label="EXPECTED OUTCOME" value={item.expectedOutcome} />
                  </div>
                  <details className="mt-2 rounded-xl border border-ink-100 bg-ink-50/60 p-3">
                    <summary className="cursor-pointer list-none text-[8px] font-black tracking-[.08em] text-ink-500">WHY THIS IS PRIORITY</summary>
                    <div className="mt-2 grid gap-1 sm:grid-cols-2 xl:grid-cols-5">
                      {item.priorityReason.map((reason) => <div key={reason} className="rounded-lg bg-white px-2 py-1.5 text-[8px] leading-4 text-ink-700">{reason}</div>)}
                    </div>
                  </details>

                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <CaseField label="OWNER" value={item.owner} />
                    <CaseField label="RECOMMENDATION" value={item.recommendation} />
                    <CaseField label="PROOF" value={item.evidence[0] ?? 'الدليل غير متاح'} mono />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Link
                      to={'/reports/smart/' + encodeURIComponent(item.reportJobId) + '?sourceHash=' + encodeURIComponent(item.sourceHash)}
                      className="btn-primary text-[9px]"
                    >
                      العودة إلى التقرير <FileSearch size={12}/>
                    </Link>
                    <Link
                      to={'/decision-experience?stage=decision&reportJobId=' + encodeURIComponent(item.reportJobId) + '&sourceHash=' + encodeURIComponent(item.sourceHash)}
                      className="btn-secondary text-[9px]"
                    >
                      استئناف القرار <ArrowUpLeft size={12}/>
                    </Link>
                    <span className="mr-auto text-[8px] text-ink-400">آخر تحديث: {new Date(item.updatedAt).toLocaleString('ar-YE')}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function CaseField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl bg-ink-50 p-3">
      <div className="text-[8px] font-black tracking-[.08em] text-ink-400">{label}</div>
      <div className={'mt-1 text-[9px] leading-5 text-ink-800 ' + (mono ? 'break-all font-mono' : 'font-bold')}>{value || 'غير متاح'}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <div className="text-[8px] text-ink-400">{label}</div>
      <div className="mt-1 text-lg font-black">{value}</div>
    </div>
  );
}
