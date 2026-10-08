import { SourceBoundReportSurface } from '@/components/SourceBoundReportSurface';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock3, Filter, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Link, useSearchParams } from '@/lib/router-compat';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui/States';
import { fetchImportRecords, fetchWorkerHealthSnapshot, type WorkerHealthSnapshot } from '@/lib/queries-compat';
import { fetchDecisionWorkItems, startSourceDecisionWorkItem, completeSourceDecisionWorkItem, type DecisionWorkItemRecord } from '@/lib/report-decisions';
import { loadPersistedOutcomes, type DecisionOutcome } from '@/lib/analytics/outcome-feedback';
import { resolveCurrentCompanyId } from '@/lib/supabase';
import type { ImportRecord } from '@/lib/types';
import { formatNumber } from '@/lib/format';

type FilterKey = 'all' | 'active' | 'review' | 'completed' | 'failed';
type DecisionWorkFilter = 'all' | 'open' | 'in_progress' | 'completed' | 'overdue';
const statusLabel = (s: string | null) => ({ queued: 'بالانتظار', processing: 'قيد التنفيذ', completed: 'مكتمل', partial: 'مكتمل جزئيًا', failed: 'فشل', cancelled: 'ملغى' }[s ?? ''] ?? 'غير معروف');
const statusClass = (s: string | null) => s === 'completed' ? 'bg-success-50 text-success-700' : s === 'failed' ? 'bg-danger-50 text-danger-700' : s === 'partial' ? 'bg-warning-50 text-warning-700' : s === 'processing' ? 'bg-primary-50 text-primary-700' : 'bg-ink-50 text-ink-600';
function matches(row: ImportRecord, filter: FilterKey) {
  if (filter === 'all') return true;
  if (filter === 'active') return row.status === 'queued' || row.status === 'processing';
  if (filter === 'review') return row.status === 'partial' || (row.invalid_rows ?? 0) > 0 || (row.quarantined_rows ?? 0) > 0;
  if (filter === 'completed') return row.status === 'completed';
  return row.status === 'failed' || row.status === 'cancelled';
}

function WorkCenterGeneralPage() {
  const [rows, setRows] = useState<ImportRecord[]>([]);
  const [decisionWorkItems, setDecisionWorkItems] = useState<DecisionWorkItemRecord[]>([]);
  const [outcomes, setOutcomes] = useState<DecisionOutcome[]>([]);
  const [workActions, setWorkActions] = useState<Record<string, 'starting' | 'completing' | 'error'>>({});
  const [workImpacts, setWorkImpacts] = useState<Record<string, string>>({});
  const [workerHealth, setWorkerHealth] = useState<WorkerHealthSnapshot | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [decisionWorkFilter, setDecisionWorkFilter] = useState<DecisionWorkFilter>('all');
  const [workParams] = useSearchParams();
  const reportJobIdParam = workParams.get('reportJobId')?.trim() ?? '';
  const sourceHashParam = workParams.get('sourceHash')?.trim() ?? '';
  useEffect(() => {
    const requested = workParams.get('decisionWorkFilter');
    if (requested === 'all' || requested === 'open' || requested === 'in_progress' || requested === 'completed' || requested === 'overdue') {
      setDecisionWorkFilter(requested);
    }
  }, [workParams]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const companyId = await resolveCurrentCompanyId();
      if (!companyId) throw new Error('TENANT_REQUIRED');
      const [imports, health, workItems, persistedOutcomes] = await Promise.all([
        fetchImportRecords(),
        fetchWorkerHealthSnapshot(),
        fetchDecisionWorkItems(200),
        loadPersistedOutcomes(companyId),
      ]);
      setRows(imports);
      setWorkerHealth(health);
      setDecisionWorkItems(workItems);
      setOutcomes(persistedOutcomes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل تحميل مركز العمليات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const startWork = useCallback(async (item: DecisionWorkItemRecord) => {
    setWorkActions((current) => ({ ...current, [item.id]: 'starting' }));
    try {
      await startSourceDecisionWorkItem(item.id);
      await load();
    } catch {
      setWorkActions((current) => ({ ...current, [item.id]: 'error' }));
    } finally {
      setWorkActions((current) => {
        const next = { ...current };
        if (next[item.id] !== 'error') delete next[item.id];
        return next;
      });
    }
  }, [load]);

  const completeWork = useCallback(async (item: DecisionWorkItemRecord) => {
    const snapshotId = item.evidenceSnapshotId;
    if (!snapshotId || !item.sourceReportJobId || !item.sourceHash) {
      setWorkActions((current) => ({ ...current, [item.id]: 'error' }));
      return;
    }
    const rawImpact = workImpacts[item.id]?.trim() ?? '';
    const parsedImpact = rawImpact ? Number(rawImpact.replace(/,/g, '')) : null;
    if (parsedImpact != null && !Number.isFinite(parsedImpact)) {
      setWorkActions((current) => ({ ...current, [item.id]: 'error' }));
      return;
    }
    setWorkActions((current) => ({ ...current, [item.id]: 'completing' }));
    try {
      await completeSourceDecisionWorkItem({
        workItemId: item.id,
        actualImpact: parsedImpact,
        evidenceSnapshotId: snapshotId,
        reportJobId: item.sourceReportJobId,
        sourceHash: item.sourceHash,
      });
      await load();
    } catch {
      setWorkActions((current) => ({ ...current, [item.id]: 'error' }));
    } finally {
      setWorkActions((current) => {
        const next = { ...current };
        if (next[item.id] !== 'error') delete next[item.id];
        return next;
      });
    }
  }, [load, workImpacts]);

  const filtered = useMemo(() => rows.filter(r => matches(r, filter)), [rows, filter]);
  const isOverdue = (item: DecisionWorkItemRecord) =>
    Boolean(item.dueAt) &&
    Date.parse(item.dueAt as string) < Date.now() &&
    item.status !== 'COMPLETED';

  const scopedDecisionWorkItems = useMemo(() => decisionWorkItems.filter((item) => {
    if (!reportJobIdParam) return true;
    if (item.sourceReportJobId !== reportJobIdParam) return false;
    return !sourceHashParam || item.sourceHash === sourceHashParam;
  }), [decisionWorkItems, reportJobIdParam, sourceHashParam]);

  const filteredDecisionWork = useMemo(() => scopedDecisionWorkItems.filter((item) =>
    decisionWorkFilter === 'all'
      ? true
      : decisionWorkFilter === 'open'
        ? item.status === 'OPEN'
        : decisionWorkFilter === 'in_progress'
          ? item.status === 'IN_PROGRESS'
          : decisionWorkFilter === 'completed'
            ? item.status === 'COMPLETED'
            : isOverdue(item)
  ), [scopedDecisionWorkItems, decisionWorkFilter]);

  const decisionWorkCounts = useMemo(() => ({
    open: scopedDecisionWorkItems.filter(item => item.status === 'OPEN').length,
    inProgress: scopedDecisionWorkItems.filter(item => item.status === 'IN_PROGRESS').length,
    completed: scopedDecisionWorkItems.filter(item => item.status === 'COMPLETED').length,
    overdue: scopedDecisionWorkItems.filter(isOverdue).length,
  }), [scopedDecisionWorkItems]);

  const sourceContextFromWork = (item: DecisionWorkItemRecord) => {
    const sourceRef = item.evidenceRefs.find((ref): ref is Record<string, unknown> => Boolean(ref) && typeof ref === 'object' && (ref as Record<string, unknown>).type === 'SOURCE_REPORT');
    return sourceRef ?? null;
  };

  const workStatusLabel = (status: string) =>
    status === 'OPEN' ? 'مفتوح' : status === 'IN_PROGRESS' ? 'قيد التنفيذ' : status === 'COMPLETED' ? 'مكتمل' : status === 'CANCELLED' ? 'ملغى' : 'يحتاج مراجعة';
  const priorityLabel = (priority: unknown) => {
    const value = String(priority ?? '').toUpperCase();
    return value === 'URGENT' || value === 'P0' ? 'عاجل' : value === 'HIGH' || value === 'P1' ? 'مرتفع' : value === 'MEDIUM' || value === 'P2' ? 'متوسط' : value === 'LOW' || value === 'P3' ? 'منخفض' : 'غير محدد';
  };
  const queueEmptyState = rows.length === 0
    ? { title: 'لا توجد عمليات تشغيل مثبتة', message: 'لا توجد عمليات استيراد مسجلة لهذا المستأجر حتى الآن؛ ابدأ بالمصدر الموحد لبناء أول دورة تشغيل قابلة للتتبع.' }
    : { title: 'لا توجد عمليات مطابقة', message: 'غيّر عامل التصفية أو اعرض السجل الكامل للوصول إلى العمليات المسجلة.' };
  const counts = useMemo(() => ({
    active: rows.filter(r => r.status === 'queued' || r.status === 'processing').length,
    review: rows.filter(r => r.status === 'partial' || (r.invalid_rows ?? 0) > 0 || (r.quarantined_rows ?? 0) > 0).length,
    completed: rows.filter(r => r.status === 'completed').length,
    failed: rows.filter(r => r.status === 'failed' || r.status === 'cancelled').length,
  }), [rows]);
  const zeroProgressActive = useMemo(
    () => rows.filter(r => (r.status === 'queued' || r.status === 'processing') && Number(r.progress ?? 0) === 0).length,
    [rows],
  );
  const historyWindowNotice = rows.length >= 500
    ? 'المعروض هو أحدث 500 عملية ضمن نافذة القراءة الحالية؛ لا يُستخدم كإجمالي تاريخي كامل.'
    : 'المعروض هو السجل الذي أعادته نافذة القراءة الحالية.';

  const nextAction = (workerHealth?.expiredActive ?? 0) > 0
    ? { kind: 'refresh' as const, tone: 'danger' as const, title: 'إعادة فحص العامل الآن', message: 'هناك leases منتهية مثبتة في القراءة الحالية؛ أعد قراءة الحالة بعد دورة recovery التشغيلية بدل اعتبار الطابور سليمًا.', label: 'إعادة فحص العامل' }
    : workerHealth && !workerHealth.activeReadComplete
      ? { kind: 'refresh' as const, tone: 'warning' as const, title: 'قراءة العامل جزئية', message: 'لم تُقرأ كل leases النشطة؛ لا يمكن تحويل القراءة الجزئية إلى حكم سلامة كامل. أعد الفحص عند الحاجة.', label: 'إعادة قراءة العامل' }
      : zeroProgressActive > 0
        ? { kind: 'filter' as const, filter: 'active' as FilterKey, tone: 'warning' as const, title: 'تحقق من العمليات دون تقدم', message: 'هناك عمليات نشطة بتقدم 0%. هذه إشارة تشغيلية للمراجعة وليست دليل نجاح أو فشل تلقائي.', label: 'عرض العمليات دون تقدم' }
        : counts.review > 0
        ? { kind: 'filter' as const, filter: 'review' as FilterKey, tone: 'warning' as const, title: 'راجع الاستثناءات أولًا', message: 'هناك عمليات تحتوي على مراجعة أو صفوف غير صالحة/معزولة؛ ابدأ بها قبل اعتبار الطابور مستقرًا.', label: 'عرض المراجعة' }
        : counts.failed > 0
          ? { kind: 'filter' as const, filter: 'failed' as FilterKey, tone: 'danger' as const, title: 'راجع عمليات الفشل', message: 'هناك عمليات فاشلة أو ملغاة؛ افتحها قبل بدء دورة جديدة حتى لا يضيع سبب التعثر.', label: 'عرض الفشل' }
          : counts.active > 0
            ? { kind: 'filter' as const, filter: 'active' as FilterKey, tone: 'primary' as const, title: 'تابع العمليات النشطة', message: 'هناك عمليات في الطابور أو التنفيذ. اعرضها مباشرة بدل القفز إلى سجل مكتمل.', label: 'عرض النشطة' }
            : rows.length === 0
              ? { kind: 'import' as const, tone: 'primary' as const, title: 'ابدأ أول دورة تشغيل من المصدر الموحد', message: 'لا توجد عمليات مسجلة لهذا المستأجر بعد؛ نقطة البدء الصحيحة هي الاستيراد الكانوني الموحد.', label: 'إدخال مصدر' }
              : { kind: 'import' as const, tone: 'success' as const, title: 'لا يوجد استثناء حرج مثبت الآن', message: 'السجل الحالي لا يحتوي على حالات نشطة أو مراجعة أو فشل؛ يمكنك بدء مصدر جديد دون إنشاء مسار بديل.', label: 'إدخال مصدر جديد' };

  if (loading) return <LoadingState message="جارٍ تحميل حالة العمليات..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return <div dir="rtl" className="ag-work-center-surface space-y-5 animate-fade-in pb-10">
    <PageHeader
      title="مركز العمل"
      subtitle="طابور العمل والاستثناءات: ما الذي ينتظر، ما الذي يحتاج مراجعة، وما الذي اكتمل فعليًا."
      actions={<button type="button" onClick={() => void load()} className="btn-secondary inline-flex items-center gap-2"><RefreshCw size={16}/> تحديث</button>}
    />

    <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
      <Card className="ag-operational-hero hero-surface overflow-hidden">
        <CardBody>
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-primary-700"><Activity size={15}/> الحقيقة التشغيلية</div>
              <h2 className="mt-2 text-xl font-black tracking-tight text-ink-950">كل عملية مرتبطة بمصدر وحالة فعلية</h2>
              <p className="mt-2 max-w-2xl text-[12px] leading-6 text-ink-500">هذه الصفحة تقرأ حالة الاستيراد المعتمدة فقط؛ لا تنشئ حالة بديلة ولا تعتبر العرض المحلي دليلًا على نجاح قاعدة البيانات.</p>
            </div>
            <div className="card-subtle px-4 py-3 text-xs text-ink-600">
              <div className="flex items-center gap-2 font-bold text-ink-800"><ShieldCheck size={15} className="text-primary-600"/> مصدر الحالة</div>
              <div className="mt-1 font-semibold text-ink-700">مسار المصدر والحالة الكانونية</div>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([
              ['النشطة', counts.active, Activity, 'primary'],
              ['المراجعة', counts.review, AlertTriangle, 'warning'],
              ['المكتملة', counts.completed, CheckCircle2, 'success'],
              ['الفشل / الإلغاء', counts.failed, XCircle, 'danger'],
            ] as const).map(([label, value, Icon]) => (
              <button key={label} type="button" onClick={() => setFilter(label === 'النشطة' ? 'active' : label === 'المراجعة' ? 'review' : label === 'المكتملة' ? 'completed' : 'failed')} className="card-subtle p-3 text-right transition-colors hover:border-ink-300 hover:bg-white">
                <Icon size={16} className="mb-2 text-primary-600"/>
                <div className="display-number text-[1.45rem]">{formatNumber(value)}</div>
                <div className="mt-1 text-[11px] font-semibold text-ink-500">{label}</div>
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="منطق الحالة" subtitle="قراءة فقط؛ لا يوجد مسار موازٍ للحالة."/>
        <CardBody>
          <div className="space-y-3">
            {[
              ['المصدر', 'الملف/العملية الأصلية', 'text-primary-600'],
              ['المعالجة', 'queued → processing', 'text-accent-600'],
              ['التحقق', 'صالح / مراجعة / مرفوض', 'text-warning-600'],
              ['النتيجة', 'اكتمل فقط عند وجود حالة نهائية مصدرية', 'text-success-600'],
            ].map(([label, detail, tone]) => (
              <div key={label} className="flex items-start gap-3 rounded-xl border border-ink-100 bg-ink-50/60 p-3">
                <span className={`mt-0.5 h-2 w-2 rounded-full bg-current ${tone}`}/>
                <div><div className="text-xs font-bold text-ink-800">{label}</div><div className="mt-1 text-xs text-ink-500">{detail}</div></div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </section>

    <section className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
      <Card>
        <CardHeader title="صحة العامل" subtitle="قراءة مباشرة من مسار التنفيذ durable؛ لا تُعلن الحالة سليمة إذا بقيت lease منتهية." action={workerHealth ? <span className={`badge ${workerHealth.expiredActive > 0 ? 'badge-danger' : workerHealth.activeReadComplete ? 'badge-success' : 'badge-warning'}`}>{(workerHealth.expiredActive ?? 0) > 0 ? 'تحتاج تدخل' : workerHealth.activeReadComplete ? 'لا توجد leases منتهية' : 'قراءة جزئية'}</span> : undefined}/>
        <CardBody>
          {workerHealth ? <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-ink-100 bg-ink-50 p-4"><div className="text-[10px] text-ink-400">بالانتظار</div><div className="mt-2 text-2xl font-black text-ink-950">{formatNumber(workerHealth.queued)}</div></div>
            <div className="rounded-2xl border border-ink-100 bg-ink-50 p-4"><div className="text-[10px] text-ink-400">قيد التنفيذ</div><div className="mt-2 text-2xl font-black text-ink-950">{formatNumber(workerHealth.active)}</div></div>
            <div className={`rounded-2xl border p-4 ${(workerHealth.expiredActive ?? 0) > 0 ? 'border-danger-200 bg-danger-50/60' : 'border-success-200 bg-success-50/60'}`}><div className="text-[10px] text-ink-500">leases منتهية</div><div className={`mt-2 text-2xl font-black ${(workerHealth.expiredActive ?? 0) > 0 ? 'text-danger-700' : 'text-success-700'}`}>{formatNumber(workerHealth.expiredActive)}</div></div>
          </div> : <div className="text-xs text-ink-400">لم تتوفر قراءة العامل بعد.</div>}
          {workerHealth && !workerHealth.activeReadComplete && <div className="mt-3 rounded-xl border border-warning-200 bg-warning-50/70 px-3 py-2 text-[10px] leading-5 text-warning-900">القراءة محدودة بـ500 lease نشطة؛ لا تُفسَّر كحكم كامل على العامل.</div>}
        </CardBody>
      </Card>
      <Card variant={nextAction.tone === 'danger' ? 'alert' : nextAction.tone === 'warning' ? 'alert' : nextAction.tone === 'success' ? 'evidence' : 'standard'}>
        <CardHeader title="الإجراء التالي" subtitle="يُشتق مباشرة من الحالة التشغيلية الحالية؛ المعالجة الفعلية تبقى داخل المسارات الكانونية." />
        <CardBody>
          <div className="flex items-start gap-3">
            <ShieldCheck size={18} className={nextAction.tone === 'danger' ? 'text-danger-700 mt-0.5' : nextAction.tone === 'warning' ? 'text-warning-700 mt-0.5' : nextAction.tone === 'success' ? 'text-success-700 mt-0.5' : 'text-primary-700 mt-0.5'} />
            <div className="min-w-0">
              <div className="text-sm font-black text-ink-900">{nextAction.title}</div>
              <div aria-live="polite" className="mt-1 text-[11px] leading-5 text-ink-600">{nextAction.message}</div>
              <div className="mt-4">
                {nextAction.kind === 'refresh' && (
                  <button type="button" onClick={() => void load()} className="btn-secondary text-xs">{nextAction.label}</button>
                )}
                {nextAction.kind === 'filter' && (
                  <button type="button" onClick={() => setFilter(nextAction.filter)} className="btn-secondary text-xs">{nextAction.label}</button>
                )}
                {nextAction.kind === 'import' && (
                  <Link to="/import" className="btn-primary inline-flex text-xs">{nextAction.label}</Link>
                )}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </section>

    <section className="rounded-[18px] border border-primary-200 bg-primary-50/40 p-5 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="section-kicker">تنفيذ القرارات</div>
          <h2 className="mt-1 text-lg font-black text-ink-950">قرارات تحولت إلى عمل</h2>
          <p className="mt-1 text-[11px] leading-5 text-ink-600">هذه المهام محفوظة في النظام الحاكم ومربوطة بمصدرها. مركز العمل يعرض الحالة؛ تفاصيل البدء والإغلاق والدليل تبقى مرتبطة بالتقرير.</p>
        </div>
        <div className="flex flex-wrap gap-2" role="toolbar" aria-label="تصفية عناصر القرار">
          {(['all','open','in_progress','completed','overdue'] as DecisionWorkFilter[]).map((key) => (
            <button key={key} type="button" onClick={() => setDecisionWorkFilter(key)} aria-pressed={decisionWorkFilter === key} className={'rounded-full px-3 py-1.5 text-[10px] font-bold ' + (decisionWorkFilter === key ? 'bg-ink-950 text-white' : 'bg-white text-ink-600 hover:bg-ink-50')}>
              {key === 'all' ? 'الكل' : key === 'open' ? 'مفتوح' : key === 'in_progress' ? 'قيد التنفيذ' : key === 'completed' ? 'مكتمل' : 'متأخر'}
            </button>
          ))}
        </div>
      </div>

      {reportJobIdParam && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3" aria-label="نطاق التقرير الحالي">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[9px] font-black tracking-[.12em] text-indigo-700">نطاق هذا التقرير</div>
              <div className="mt-1 text-[11px] font-black text-indigo-950">مركز العمل يعرض الإجراءات المرتبطة بهذا التقرير فقط</div>
              <div className="mt-1 text-[9px] text-indigo-800">السجل مرتبط بـ reportJobId{sourceHashParam ? ' + sourceHash' : ''}; لا يتم خلطه مع أعمال تقارير أخرى.</div>
            </div>
            <Link to={'/reports/smart/' + encodeURIComponent(reportJobIdParam) + (sourceHashParam ? '?sourceHash=' + encodeURIComponent(sourceHashParam) : '')} className="btn-secondary text-[9px]">العودة للتقرير</Link>
          </div>
        </div>
      )}
      <div className="mt-4 rounded-xl border border-primary-100 bg-primary-50/50 p-3" aria-label="سياق العمل الحالي">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="section-kicker">لماذا · الدليل · الإجراء · النتيجة</div>
            <div className="mt-1 text-[11px] font-black text-ink-900">مركز العمل يربط المهمة بالدليل، الإجراء، والنتيجة المسجلة.</div>
            <p className="mt-1 text-[9px] leading-5 text-ink-500">ابدأ المهمة فقط عندما تكون الحالة مفتوحة، وأغلقها بعد إدخال الأثر الفعلي مع Evidence مثبت. النتيجة والتعلّم تظهران من السجل المحفوظ.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/command-center" className="btn-secondary text-[9px]">مركز القيادة</Link>
            <Link to="/decision-inbox" className="btn-ghost text-[9px]">مركز القرارات</Link>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-ink-100 bg-white p-3"><div className="text-[9px] text-ink-400">مفتوحة</div><div className="mt-1 text-xl font-black text-ink-950">{formatNumber(decisionWorkCounts.open)}</div></div>
        <div className="rounded-xl border border-ink-100 bg-white p-3"><div className="text-[9px] text-ink-400">قيد التنفيذ</div><div className="mt-1 text-xl font-black text-primary-700">{formatNumber(decisionWorkCounts.inProgress)}</div></div>
        <div className="rounded-xl border border-ink-100 bg-white p-3"><div className="text-[9px] text-ink-400">مكتملة</div><div className="mt-1 text-xl font-black text-success-700">{formatNumber(decisionWorkCounts.completed)}</div></div>
        <div className="rounded-xl border border-danger-200 bg-danger-50/60 p-3"><div className="text-[9px] text-danger-700">متأخرة</div><div className="mt-1 text-xl font-black text-danger-700">{formatNumber(decisionWorkCounts.overdue)}</div></div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-ink-200 bg-white">
        {filteredDecisionWork.length ? (
          <>
          <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full text-right text-[10px]">
            <thead className="bg-ink-50"><tr>
              <th className="whitespace-nowrap px-3 py-2 font-black text-ink-600">العمل</th>
              <th className="whitespace-nowrap px-3 py-2 font-black text-ink-600">الحالة</th>
              <th className="whitespace-nowrap px-3 py-2 font-black text-ink-600">المسؤول</th>
              <th className="whitespace-nowrap px-3 py-2 font-black text-ink-600">الأولوية</th>
              <th className="whitespace-nowrap px-3 py-2 font-black text-ink-600">الموعد</th>
              <th className="whitespace-nowrap px-3 py-2 font-black text-ink-600">الأثر</th>
              <th className="whitespace-nowrap px-3 py-2 font-black text-ink-600">المصدر</th>
              <th className="whitespace-nowrap px-3 py-2 font-black text-ink-600">الإجراء</th>
            </tr></thead>
            <tbody>
              {filteredDecisionWork.map((item) => {
                const source = sourceContextFromWork(item);
                const sourceHashValue = typeof source?.sourceHash === 'string' ? source.sourceHash : '';
                const reportJobIdValue = typeof source?.reportExecutionJobId === 'string' ? source.reportExecutionJobId : '';
                return (
                  <tr key={item.id} className="border-t border-ink-100">
                    <td className="max-w-[280px] px-3 py-3">
                      <div className="font-black text-ink-900">{item.title}</div>
                      <div className="mt-1 text-[8px] text-ink-400">مرتبط بالتقرير والدليل</div>
                    </td>
                    <td className="px-3 py-3"><span className="rounded-full bg-ink-50 px-2 py-1 font-bold text-ink-700">{workStatusLabel(item.status)}</span></td>
                    <td className="px-3 py-3 text-ink-600">{item.assigneeLabel ?? 'غير متاح'}</td>
                    <td className="px-3 py-3 text-ink-600">{priorityLabel(item.priority)}</td>
                    <td className="px-3 py-3 text-ink-600">{item.dueAt ? new Date(item.dueAt).toLocaleDateString('ar-YE') : 'غير محدد'}</td>
                    <td className="px-3 py-3 text-ink-600">
                      <div>{item.actualImpact != null ? formatNumber(item.actualImpact) : item.expectedImpact != null ? 'متوقع ' + formatNumber(item.expectedImpact) : 'غير متاح'}</div>
                      {item.expectedImpact != null && item.actualImpact != null && (
                        <div className={'mt-1 text-[8px] font-black ' + (item.actualImpact - item.expectedImpact >= 0 ? 'text-success-700' : 'text-danger-700')}>
                          Delta: {formatNumber(item.actualImpact - item.expectedImpact)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {reportJobIdValue && sourceHashValue
                        ? <span className="text-[9px] text-ink-500">مرتبط بالمصدر الأصلي</span>
                        : <span className="text-ink-400">غير مربوط</span>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {item.status === 'OPEN' && (
                          <button
                            type="button"
                            onClick={() => void startWork(item)}
                            disabled={workActions[item.id] === 'starting'}
                            className="btn-primary text-[9px] disabled:opacity-50"
                            data-testid={'work-center-start-' + item.id}
                          >
                            {workActions[item.id] === 'starting' ? 'جارٍ البدء...' : 'بدء'}
                          </button>
                        )}
                        {item.status === 'IN_PROGRESS' && item.evidenceSnapshotId && (
                          <div className="flex flex-wrap items-center gap-1">
                            <input
                              inputMode="decimal"
                              value={workImpacts[item.id] ?? ''}
                              onChange={(event) => setWorkImpacts((current) => ({ ...current, [item.id]: event.target.value }))}
                              placeholder="الأثر الفعلي"
                              aria-label={'الأثر الفعلي ' + item.title}
                              className="min-h-8 w-24 rounded-lg border border-ink-200 bg-white px-2 text-[9px] outline-none focus:border-primary-400"
                            />
                            <button
                              type="button"
                              onClick={() => void completeWork(item)}
                              disabled={workActions[item.id] === 'completing'}
                              className="btn-primary text-[9px] disabled:opacity-50"
                              data-testid={'work-center-complete-' + item.id}
                            >
                              {workActions[item.id] === 'completing' ? 'جارٍ الإغلاق...' : 'إغلاق'}
                            </button>
                          </div>
                        )}
                        {item.status === 'IN_PROGRESS' && !item.evidenceSnapshotId && (
                          <span className="rounded-lg border border-warning-200 bg-warning-50 px-2 py-1 text-[8px] font-bold text-warning-900">الدليل غير متاح — افتح المصدر</span>
                        )}
                        {reportJobIdValue && sourceHashValue
                          ? <>
                              <Link to={'/reports/smart/' + reportJobIdValue + '?sourceHash=' + encodeURIComponent(sourceHashValue)} className="btn-secondary text-[9px]">المصدر</Link>
                              <Link to={'/reports/smart/' + reportJobIdValue + '?sourceHash=' + encodeURIComponent(sourceHashValue) + '#decision-evidence-inspector'} className="btn-ghost text-[9px]">التتبع</Link>
                            </>
                          : <span className="text-ink-400">غير متاح</span>}
                      </div>
                      {workActions[item.id] === 'error' && <div role="alert" className="mt-1 text-[8px] font-bold text-danger-700">تعذر تنفيذ الإجراء أو readback؛ بقيت الحالة دون تغيير محلي.</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="grid gap-2 p-2 md:hidden">
          {filteredDecisionWork.map((item) => {
            const sourceHashValue = typeof item.sourceHash === 'string' ? item.sourceHash : '';
            const reportJobIdValue = typeof item.sourceReportJobId === 'string' ? item.sourceReportJobId : '';
            return (
              <article key={item.id} className="rounded-xl border border-ink-200 bg-ink-50/55 p-3" aria-label={'عنصر عمل ' + item.title}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-black text-ink-900">{item.title}</div>
                    <div className="mt-1 text-[8px] text-ink-400">مسار عمل محفوظ وقابل للتتبع</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-primary-50 px-2 py-1 text-[8px] font-black text-primary-800">{workStatusLabel(item.status)}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[9px]">
                  <div className="rounded-lg bg-white p-2"><div className="text-ink-400">المسؤول</div><div className="mt-1 font-bold text-ink-800">{item.assigneeLabel ?? 'غير متاح'}</div></div>
                  <div className="rounded-lg bg-white p-2"><div className="text-ink-400">الموعد</div><div className="mt-1 font-bold text-ink-800">{item.dueAt ? new Date(item.dueAt).toLocaleDateString('ar-YE') : 'غير محدد'}</div></div>
                  <div className="rounded-lg bg-white p-2"><div className="text-ink-400">المتوقع</div><div className="mt-1 font-bold text-ink-800">{item.expectedImpact == null ? 'غير متاح' : formatNumber(item.expectedImpact)}</div></div>
                  <div className="rounded-lg bg-white p-2"><div className="text-ink-400">الفعلي</div><div className="mt-1 font-bold text-ink-800">{item.actualImpact == null ? 'غير متاح' : formatNumber(item.actualImpact)}</div></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {item.status === 'OPEN' && <button type="button" onClick={() => void startWork(item)} disabled={workActions[item.id] === 'starting'} className="btn-primary text-[9px]">{workActions[item.id] === 'starting' ? 'جارٍ البدء...' : 'بدء'}</button>}
                  {item.status === 'IN_PROGRESS' && item.evidenceSnapshotId && (
                    <>
                      <input inputMode="decimal" value={workImpacts[item.id] ?? ''} onChange={(event) => setWorkImpacts((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="الأثر الفعلي" aria-label={'الأثر الفعلي ' + item.title} className="min-h-8 w-28 rounded-lg border border-ink-200 bg-white px-2 text-[9px] outline-none focus:border-primary-400" />
                      <button type="button" onClick={() => void completeWork(item)} disabled={workActions[item.id] === 'completing'} className="btn-primary text-[9px]">{workActions[item.id] === 'completing' ? 'جارٍ الإغلاق...' : 'إغلاق'}</button>
                    </>
                  )}
                  {item.status === 'IN_PROGRESS' && !item.evidenceSnapshotId && <span className="rounded-lg border border-warning-200 bg-warning-50 px-2 py-1 text-[8px] font-bold text-warning-900">الدليل غير متاح</span>}
                  {reportJobIdValue && sourceHashValue && <Link to={'/reports/smart/' + reportJobIdValue + '?sourceHash=' + encodeURIComponent(sourceHashValue) + '#decision-evidence-inspector'} className="btn-secondary text-[9px]">التتبع</Link>}
                </div>
                {workActions[item.id] === 'error' && <div role="alert" className="mt-2 text-[8px] font-bold text-danger-700">تعذر تنفيذ الإجراء أو إعادة القراءة؛ بقيت الحالة كما هي في النظام.</div>}
              </article>
            );
          })}
        </div>
        </>
        ) : <div className="p-6 text-center text-[10px] text-ink-500">لا توجد عناصر عمل مطابقة داخل نافذة مركز العمل الحالية.</div>}
      </div>
    </section>

    <section className="rounded-[18px] border border-primary-200 bg-white p-5 shadow-sm" aria-label="نتائج القرار والتعلم">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="section-kicker">النتيجة → التعلّم</div>
          <h2 className="mt-1 text-lg font-black text-ink-950">ما الذي تعلّمناه من التنفيذ؟</h2>
          <p className="mt-1 text-[11px] leading-5 text-ink-600">هذه قراءة من سجلات النتائج المحفوظة لنفس المستأجر. لا يتم تحويل غياب النتيجة إلى نجاح أو تقدير.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] font-bold text-ink-500">
          <span className="rounded-full bg-ink-50 px-2.5 py-1.5">الإجمالي: {formatNumber(outcomes.length)}</span>
          <span className="rounded-full bg-success-50 px-2.5 py-1.5 text-success-800">إيجابي: {formatNumber(outcomes.filter(item => item.label === 'correct').length)}</span>
          <span className="rounded-full bg-warning-50 px-2.5 py-1.5 text-warning-900">جزئي: {formatNumber(outcomes.filter(item => item.label === 'partial').length)}</span>
          <span className="rounded-full bg-danger-50 px-2.5 py-1.5 text-danger-800">سلبي: {formatNumber(outcomes.filter(item => item.label === 'incorrect').length)}</span>
        </div>
      </div>
      {outcomes.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-ink-200 bg-ink-50/60 p-5 text-center text-[10px] leading-5 text-ink-500">
          لا توجد نتيجة موثقة كافية حتى الآن. الحالة: <strong>غير متاح</strong> — لا يتم إنشاء تعلم بديل.
        </div>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {outcomes.slice(-3).reverse().map((outcome, index) => {
            const delta = outcome.expectedValue != null && outcome.actualValue != null
              ? outcome.actualValue - outcome.expectedValue
              : null;
            const label = outcome.label === 'correct' ? 'إيجابي' : outcome.label === 'partial' ? 'جزئي' : outcome.label === 'incorrect' ? 'سلبي' : 'غير متاح';
            return (
              <article key={outcome.decisionFingerprint + outcome.observedAt + index} className="rounded-xl border border-ink-200 bg-ink-50/70 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className={'rounded-full px-2 py-1 text-[9px] font-black ' + (outcome.label === 'correct' ? 'bg-success-50 text-success-800' : outcome.label === 'incorrect' ? 'bg-danger-50 text-danger-800' : outcome.label === 'partial' ? 'bg-warning-50 text-warning-900' : 'bg-ink-100 text-ink-600')}>{label}</span>
                  <span className="text-[9px] text-ink-400">{new Date(outcome.observedAt).toLocaleString('ar-YE')}</span>
                </div>
                <div className="mt-3 text-[9px] text-ink-400">بصمة القرار محفوظة للتتبع الداخلي</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-white p-2"><div className="text-[8px] text-ink-400">المتوقع</div><div className="mt-1 text-xs font-black text-ink-900">{outcome.expectedValue == null ? 'غير متاح' : formatNumber(outcome.expectedValue)}</div></div>
                  <div className="rounded-lg bg-white p-2"><div className="text-[8px] text-ink-400">الفعلي</div><div className="mt-1 text-xs font-black text-ink-900">{outcome.actualValue == null ? 'غير متاح' : formatNumber(outcome.actualValue)}</div></div>
                </div>
                <div className="mt-2 rounded-lg border border-primary-100 bg-primary-50/60 p-2 text-[9px] leading-5 text-primary-900">
                  <strong>تعلم قابل للتتبع:</strong> {delta == null ? 'لا توجد قيمة كافية لاستخراج فرق؛ تبقى الحالة غير مكتملة.' : 'فرق النتيجة عن المتوقع = ' + formatNumber(delta)}
                </div>
                <div className="mt-2 text-[9px] text-ink-500">الدليل: {outcome.evidenceSnapshotId ? 'موجود' : 'غير متاح'} · الإجراء: {outcome.actionId ?? 'غير متاح'}</div>
              </article>
            );
          })}
        </div>
      )}
    </section>

    <section className="ag-decision-strip" aria-label="ملخص التشغيل">
      <div className="ag-decision-cell"><span className="ag-decision-label">{rows.length >= 500 ? 'نافذة العرض' : 'السجل المعروض'}</span><span className="ag-decision-value">{rows.length >= 500 ? 'أحدث 500' : formatNumber(rows.length)}</span></div>
      <div className="ag-decision-cell"><span className="ag-decision-label">نشطة</span><span className="ag-decision-value">{formatNumber(counts.active)}</span></div>
      <div className="ag-decision-cell"><span className="ag-decision-label">تحتاج مراجعة</span><span className="ag-decision-value">{formatNumber(counts.review)}</span></div>
      <div className="ag-decision-cell"><span className="ag-decision-label">مكتملة</span><span className="ag-decision-value">{formatNumber(counts.completed)}</span></div>
      <div className="ag-decision-cell"><span className="ag-decision-label">فشل / إلغاء</span><span className="ag-decision-value">{formatNumber(counts.failed)}</span></div>
      <div className="ag-decision-cell"><span className="ag-decision-label">نشطة بلا تقدم</span><span className="ag-decision-value">{formatNumber(zeroProgressActive)}</span></div>
    </section>

    <Card>
      <CardHeader title="طابور العمل" subtitle="ابدأ من الاستثناءات والحالات النشطة، ثم استخدم نافذة العرض الحالية دون اعتبارها إجمالي التاريخ."/>
      <CardBody>
        <div role="status" className="mb-4 rounded-xl border border-ink-200 bg-ink-50/70 px-3 py-2 text-[10px] leading-5 text-ink-500">
          {historyWindowNotice}
        </div>
        <div className="mb-5 flex flex-wrap items-center gap-2" role="toolbar" aria-label="تصفية العمليات">
          <Filter size={16} className="text-ink-400"/>
          {(['all','active','review','completed','failed'] as FilterKey[]).map(k => (
            <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filter === k ? 'bg-ink-950 text-white' : 'bg-ink-50 text-ink-600 hover:bg-ink-100'}`}>
              {k === 'all' ? 'الكل' : k === 'active' ? 'النشطة' : k === 'review' ? 'المراجعة' : k === 'completed' ? 'المكتملة' : 'الفاشلة'}
            </button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <EmptyState
            title={queueEmptyState.title}
            message={queueEmptyState.message}
            action={rows.length === 0 ? (
              <Link to="/import" className="btn-primary mt-1 inline-flex items-center gap-2">إدخال مصدر من المسار الموحد</Link>
            ) : (
              <button type="button" onClick={() => setFilter('all')} className="btn-secondary mt-1">عرض كل العمليات</button>
            )}
          />
        ) : (
          <DataTable
            data={filtered}
            emptyMessage="لا توجد عمليات"
            columns={[
              { key: 'file', label: 'المصدر', render: (r: ImportRecord) => <div><div className="font-semibold text-ink-800">{r.file_name}</div><div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-ink-400"><span>{r.source_type || 'مصدر عام'}</span><span>•</span><span>المعرّف التشغيلي محفوظ داخليًا</span></div></div> },
              { key: 'status', label: 'الحالة', align: 'center', render: (r: ImportRecord) => <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(r.status)}`}>{statusLabel(r.status)}</span> },
              { key: 'progress', label: 'التقدم', align: 'center', render: (r: ImportRecord) => r.progress == null ? '—' : <div className="min-w-24" aria-label={'تقدم العملية ' + Math.max(0, Math.min(100, r.progress)) + '%'}><div className="text-xs font-bold">{Math.max(0, Math.min(100, r.progress))}%</div>{(r.status === 'queued' || r.status === 'processing') && Number(r.progress ?? 0) === 0 && <div className="mt-1 text-[10px] font-bold text-warning-700">بدون تقدم</div>}<div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(100, r.progress))} aria-label="نسبة اكتمال العملية"><div className="h-full rounded-full bg-primary-500" style={{ width: `${Math.max(0, Math.min(100, r.progress))}%` }}/></div></div> },
              { key: 'valid', label: 'البيانات المقبولة', align: 'center', render: (r: ImportRecord) => r.valid_rows == null ? 'غير متاح' : formatNumber(r.valid_rows) },
              { key: 'exceptions', label: 'الاستثناءات', align: 'center', render: (r: ImportRecord) => <span className={(r.invalid_rows ?? 0) + (r.quarantined_rows ?? 0) > 0 ? 'font-semibold text-warning-700' : 'text-ink-500'}>{formatNumber((r.invalid_rows ?? 0) + (r.quarantined_rows ?? 0))}</span> },
              { key: 'updated', label: 'آخر تحديث', align: 'center', render: (r: ImportRecord) => <span className="inline-flex items-center gap-1 text-xs text-ink-500"><Clock3 size={13}/>{new Date(r.completed_at ?? r.created_at).toLocaleString('ar-YE')}</span> },
            ]}
          />
        )}
      </CardBody>
    </Card>
  </div>;
}

export function WorkCenterPage() {
  const [params] = useSearchParams();
  const reportJobId = params.get('reportJobId')?.trim() ?? '';
  const sourceHash = params.get('sourceHash')?.trim() ?? '';
  if (reportJobId) {
    return <SourceBoundReportSurface mode="work" jobId={reportJobId} expectedSourceHash={sourceHash} />;
  }
  return <WorkCenterGeneralPage />;
}