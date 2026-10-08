import { SourceBoundReportSurface } from '@/components/SourceBoundReportSurface';
import { ArrowLeft, CheckCircle2, Eye, FileSearch, GitBranch, History, Landmark, RefreshCw, ShieldCheck } from 'lucide-react';
import { Link, useSearchParams } from '@/lib/router-compat';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui/States';
import { fetchDataQualitySnapshot } from '@/lib/data-quality-snapshot';

const states = [
  { title: 'موثق', text: 'بيانات قابلة للإثبات من المسار الكانوني.', tone: 'bg-success-50 text-success-700', icon: CheckCircle2 },
  { title: 'موثوق', text: 'حالة ثقة قابلة للاستخدام عندما يثبت المصدر والسياق المطلوب.', tone: 'bg-primary-50 text-primary-700', icon: ShieldCheck },
  { title: 'جزئي', text: 'متاحة جزئيًا مع حدود معلنة.', tone: 'bg-primary-50 text-primary-700', icon: GitBranch },
  { title: 'تحتاج مراجعة', text: 'تحتاج مراجعة قبل استخدامها في قرار.', tone: 'bg-warning-50 text-warning-700', icon: FileSearch },
  { title: 'محظور', text: 'محجوبة عن القرار حتى معالجة السبب.', tone: 'bg-danger-50 text-danger-700', icon: ShieldCheck },
  { title: 'بيانات غير كافية', text: 'المصدر الحالي لا يملك ما يكفي لإصدار نتيجة موثوقة.', tone: 'bg-ink-100 text-ink-700', icon: Eye },
] as const;

const evidenceSurfaces = [
  { title: 'حالة الدليل', detail: 'هوية الدليل ومصدره وسياقه عند توفر السجل.', path: '/import/analyze', available: true, icon: Landmark },
  { title: 'سلسلة المصدر والتتبع', detail: 'تتبع انتقال الحقيقة من المصدر إلى التحليل.', path: '/data-quality', available: true, icon: GitBranch },
  { title: 'السجل الزمني', detail: 'السجل الزمني المعتمد ليس شاشة مستقلة مثبتة حاليًا.', path: '', available: false, icon: History },
  { title: 'دليل القرار', detail: 'الدليل المرتبط بمساحة القرار الحالية.', path: '/decision-inbox', available: true, icon: ShieldCheck },
  { title: 'حوكمة المقارنة', detail: 'يتطلب سجل مقارنة وعينة كافية؛ لا تُعرض نتيجة مختلقة.', path: '', available: false, icon: FileSearch },
  { title: 'فحص المؤشر', detail: 'فحص المؤشر وحدود الحساب ومصدره.', path: '/metrics', available: true, icon: Eye },
];

function TrustEvidenceGeneralPage() {
  const [snapshot, setSnapshot] = useState<Awaited<ReturnType<typeof fetchDataQualitySnapshot>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadSnapshot = useCallback(async () => {
    try {
      setRefreshing(true);
      setError(null);
      const next = await fetchDataQualitySnapshot();
      setSnapshot(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر قراءة حالة الثقة');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const status = snapshot?.status ?? 'INSUFFICIENT DATA';
  const statusLabel = status === 'OK'
    ? 'الحالة قابلة للاستخدام'
    : status === 'EMPTY'
      ? 'لا توجد بيانات مثبتة بعد'
      : status === 'INSUFFICIENT DATA'
        ? 'بيانات غير كافية'
        : 'الحالة تحتاج مراجعة';
  const issueTotal = useMemo(
    () => snapshot?.entities?.reduce((sum, entity) => sum + (entity.issues ?? 0), 0) ?? null,
    [snapshot],
  );
  const totalRecords = useMemo(
    () => snapshot?.entities?.reduce((sum, entity) => sum + (entity.total ?? 0), 0) ?? null,
    [snapshot],
  );
  const criticalIssueTotal = useMemo(
    () => snapshot?.issues?.filter((issue) => issue.severity === 'critical').reduce((sum, issue) => sum + issue.count, 0) ?? 0,
    [snapshot],
  );
  const nextStep = snapshot?.status === 'EMPTY'
    ? { label: 'ابدأ من المصدر', detail: 'أضف ملفًا أو مصدرًا حتى يمكن بناء حالة حقيقة وأدلة فعلية.', path: '/import' }
    : criticalIssueTotal > 0
      ? { label: 'أغلق المشكلات الحرجة', detail: 'ابدأ من جودة البيانات قبل استخدام النتائج في قرار.', path: '/data-quality' }
      : issueTotal && issueTotal > 0
        ? { label: 'مراجعة جودة البيانات', detail: 'راجع الحالات التي تمنع الثقة الكاملة قبل الانتقال إلى القرار.', path: '/data-quality' }
        : { label: 'فحص مصدر الدليل', detail: 'راجع المصدر وسياقه قبل الانتقال إلى القرار.', path: '/import/analyze' };

  if (!snapshot && !error) return <LoadingState message="جارٍ قراءة حالة الثقة من المصدر..." />;
  if (error) return <ErrorState message={error} onRetry={() => void loadSnapshot()} />;

  return <div dir="rtl" className="ag-trust-evidence-surface space-y-6 animate-fade-in pb-10">
    <PageHeader
      title="مركز الثقة والأدلة"
      subtitle="طبقة واحدة لفهم مصدر الرقم، حالته، حدوده، وما إذا كان صالحًا للاستخدام في قرار."
      actions={
        <button
          type="button"
          onClick={() => void loadSnapshot()}
          disabled={refreshing}
          className="btn-secondary inline-flex items-center gap-2 disabled:cursor-wait disabled:opacity-60"
          aria-label="تحديث حالة الثقة"
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'جارٍ التحديث' : 'تحديث الحالة'}
        </button>
      }
    />
    <section className="ag-command-hero overflow-hidden rounded-[1.75rem] p-6 text-white lg:p-8">
      <div className="max-w-4xl">
        <div className="text-[10px] font-black tracking-[.14em] text-primary-200">TRUTH CONTROL PLANE</div>
        <h2 className="mt-3 text-2xl font-black lg:text-3xl">لا رقم بلا سياق، ولا قرار بلا دليل.</h2>
        <p className="mt-3 text-sm leading-7 text-slate-300">الواجهة لا ترفع درجة الثقة من تلقاء نفسها. كل حالة مرتبطة بجودة المصدر أو حدود البيانات الفعلية.</p>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-4" role="status" aria-live="polite">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="text-[9px] font-black text-ink-300">CURRENT STATUS</div><div className="mt-1 text-lg font-black">{statusLabel}</div></div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="text-[9px] font-black text-ink-300">RECORDS CHECKED</div><div className="mt-1 text-lg font-black">{totalRecords == null ? 'غير متاح' : totalRecords}</div></div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="text-[9px] font-black text-ink-300">المشكلات المرصودة</div><div className="mt-1 text-lg font-black">{issueTotal ?? 'غير متاح'}</div></div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="text-[9px] font-black text-ink-300">CRITICAL</div><div className="mt-1 text-lg font-black">{criticalIssueTotal}</div></div>
      </div>
    </section>

    <section className="ag-decision-strip" aria-label="ملخص الثقة">
      <div className="ag-decision-cell"><span className="ag-decision-label">الحالة الحالية</span><span className="ag-decision-value">{statusLabel}</span></div>
      <div className="ag-decision-cell"><span className="ag-decision-label">السجلات</span><span className="ag-decision-value">{totalRecords == null ? 'غير متاح' : totalRecords}</span></div>
      <div className="ag-decision-cell"><span className="ag-decision-label">المشكلات</span><span className="ag-decision-value">{issueTotal ?? 'غير متاح'}</span></div>
      <div className="ag-decision-cell"><span className="ag-decision-label">الحرجة</span><span className="ag-decision-value">{criticalIssueTotal}</span></div>
      <div className="ag-decision-cell"><span className="ag-decision-label">الخطوة التالية</span><span className="ag-decision-value">{nextStep.label}</span></div>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {states.map(({ title, text, tone, icon: Icon }) => <Card key={title} className="ag-dashboard-module"><CardBody>
        <div className="flex items-center justify-between gap-3"><span className={'rounded-full px-2.5 py-1 text-[9px] font-black '+tone}>{title}</span><Icon size={18} className="text-ink-400"/></div>
        <p className="mt-4 text-xs leading-6 text-ink-500">{text}</p>
      </CardBody></Card>)}
    </section>

    <section className="grid gap-4 xl:grid-cols-[.9fr_1.1fr]">
      <Card>
        <CardHeader title="حالة جودة البيانات الحالية" subtitle={snapshot?.status === 'EMPTY' ? 'لا توجد بيانات بعد' : 'قراءة المصدر الحالية'} />
        <CardBody>
          {snapshot?.entities?.length ? (
            <div className="space-y-2.5">
              {snapshot.entities.slice(0, 8).map(entity => (
                <div key={entity.name} className="flex items-center justify-between gap-3 rounded-xl border border-ink-100 bg-ink-50/40 px-3 py-3">
                  <span className="min-w-0 text-xs font-bold text-ink-800">{entity.name}</span>
                  <span className="shrink-0 text-xs font-black text-ink-500">{entity.issues ?? 'غير متاح'} مشكلة</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="لا توجد بيانات مثبتة بعد"
              message="ابدأ بمصدر حقيقي حتى تتحول هذه المساحة إلى حالة جودة وأدلة قابلة للفحص."
              action={<Link to="/import" className="btn-primary text-[11px]">إضافة مصدر</Link>}
            />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="مسارات الإثبات" subtitle="كل مسار موصول بما هو متاح فعليًا، وما لم يثبت يبقى معلنًا." />
        <CardBody className="grid gap-2.5 sm:grid-cols-2">
          {evidenceSurfaces.map(surface => surface.available
            ? <Link key={surface.title} to={surface.path} className="group flex items-start gap-3 rounded-xl border border-ink-100 bg-white p-3 transition hover:border-primary-200 hover:bg-primary-50/40">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700"><surface.icon size={15}/></div>
                <span className="min-w-0 flex-1"><strong className="block text-xs text-ink-800">{surface.title}</strong><span className="mt-1 block text-[10px] leading-5 text-ink-400">{surface.detail}</span><span className="mt-2 block text-[9px] font-black text-primary-700">فتح المسار <ArrowLeft size={11} className="inline"/></span></span>
              </Link>
            : <div key={surface.title} className="rounded-xl border border-warning-200 bg-warning-50/50 p-3">
                <div className="flex items-start gap-3"><surface.icon size={15} className="mt-0.5 shrink-0 text-warning-700"/><div><div className="text-xs font-black text-ink-800">{surface.title}</div><div className="mt-1 text-[10px] leading-5 text-warning-900">{surface.detail}</div><span className="mt-2 inline-flex rounded-full bg-white px-2 py-1 text-[8px] font-black text-warning-800">غير مثبت</span></div></div>
              </div>)}
        </CardBody>
      </Card>
    </section>

    <Link to={nextStep.path} className="block rounded-[16px] border border-primary-200 bg-primary-50/60 p-4 transition hover:border-primary-300 hover:bg-primary-50" aria-label={'الخطوة التالية: ' + nextStep.label}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="text-[9px] font-black tracking-[.12em] text-primary-700">الخطوة التالية للثقة</div><div className="mt-1 text-sm font-black text-ink-950">{nextStep.label}</div><div className="mt-1 text-[10px] leading-5 text-ink-600">{nextStep.detail}</div></div>
        <span className="inline-flex items-center gap-2 rounded-xl bg-ink-950 px-3 py-2 text-[10px] font-black text-white">فتح الآن <ArrowLeft size={13}/></span>
      </div>
    </Link>

    <div className="rounded-2xl border border-warning-200 bg-warning-50/60 p-4 text-xs leading-6 text-warning-800">
      الثقة لا تُستنتج من شكل الواجهة. أي نقص في المصدر أو السلسلة أو العينة يبقى معلنًا كحالة تحتاج مراجعة أو تمنع الاعتماد.
    </div>
  </div>;
}

export function TrustEvidencePage() {
  const [params] = useSearchParams();
  const reportJobId = params.get('reportJobId')?.trim() ?? '';
  const sourceHash = params.get('sourceHash')?.trim() ?? '';
  if (reportJobId) {
    return <SourceBoundReportSurface mode="trust" jobId={reportJobId} expectedSourceHash={sourceHash} />;
  }
  return <TrustEvidenceGeneralPage />;
}