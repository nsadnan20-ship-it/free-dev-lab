import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpLeft,
  Bookmark,
  CheckCircle2,
  Clock3,
  FileSearch,
  Filter,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { Link, useSearchParams } from '@/lib/router-compat';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { PriorityBadge, SeverityBadge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/States';
import { resolveCurrentCompanyId, supabase } from '@/lib/supabase';
import { requestSourceDecisionApproval, saveAdvisorBusinessCase } from '@/lib/report-decisions';

type InboxFilter = 'all' | 'attention' | 'approval' | 'work' | 'outcome' | 'critical';

type InboxItem = {
  decisionId: string;
  decisionKey: string;
  decisionType: string;
  status: string;
  createdAt: string | null;
  signalTitle: string;
  signalMessage: string;
  severity: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  owner: string;
  deadline: string | null;
  sourceHash: string | null;
  reportJobId: string | null;
  evidenceSnapshotId: string | null;
  passportStatus: string;
  passportReadiness: string;
  sourcePath: string | null;
  recommendationId: string | null;
  recommendationTitle: string | null;
  recommendationStatus: string | null;
  approvalId: string | null;
  approvalStatus: string | null;
  workItemId: string | null;
  workItemStatus: string | null;
  outcomeId: string | null;
  outcomeStatus: string | null;
  expectedImpact: number | null;
  actualImpact: number | null;
};

const VIEW_KEY = 'aghbari:decision-inbox:view:v1';

function priorityForSeverity(value: string): InboxItem['priority'] {
  if (value === 'critical') return 'P0';
  if (value === 'high') return 'P1';
  if (value === 'medium') return 'P2';
  return 'P3';
}

function formatDate(value: string | null): string {
  if (!value) return 'غير محدد';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'غير محدد';
  return date.toLocaleString('ar-YE', { dateStyle: 'medium', timeStyle: 'short' });
}

function nextAction(item: InboxItem): { label: string; href: string } {
  const context = item.reportJobId && item.sourceHash
    ? '&reportJobId=' + encodeURIComponent(item.reportJobId) + '&sourceHash=' + encodeURIComponent(item.sourceHash)
    : '';
  if (item.status === 'PROPOSED' && !item.approvalStatus) {
    return { label: 'بدء القرار', href: '/decision-experience?stage=decision&decisionId=' + encodeURIComponent(item.decisionId) + context };
  }
  if (item.approvalStatus === 'PENDING') {
    return { label: 'متابعة الاعتماد', href: '/decision-experience?stage=approval&decisionId=' + encodeURIComponent(item.decisionId) + context };
  }
  if (item.status === 'APPROVED' && !item.workItemId) {
    return { label: 'فتح العمل', href: '/work-center?decisionId=' + encodeURIComponent(item.decisionId) + context };
  }
  if (item.workItemId && item.workItemStatus !== 'COMPLETED') {
    return { label: 'متابعة العمل', href: '/work-center?decisionWorkFilter=' + (item.workItemStatus === 'IN_PROGRESS' ? 'in_progress' : 'open') + context };
  }
  if (item.workItemId && !item.outcomeId) {
    return { label: 'تسجيل النتيجة', href: '/decision-experience?stage=outcome&decisionId=' + encodeURIComponent(item.decisionId) + context };
  }
  return { label: 'إعادة التشغيل', href: '/replay?decisionId=' + encodeURIComponent(item.decisionId) + context };
}

function filterItem(item: InboxItem, filter: InboxFilter): boolean {
  if (filter === 'approval') return item.approvalStatus === 'PENDING';
  if (filter === 'work') return Boolean(item.workItemId) && item.workItemStatus !== 'COMPLETED';
  if (filter === 'outcome') return Boolean(item.workItemId) && !item.outcomeId;
  if (filter === 'critical') return item.priority === 'P0' || item.priority === 'P1';
  if (filter === 'attention') return item.status === 'PROPOSED' || item.approvalStatus === 'PENDING' || Boolean(item.workItemId && item.workItemStatus !== 'COMPLETED') || Boolean(item.workItemId && !item.outcomeId);
  return true;
}

export function DecisionInboxPage() {
  const [params] = useSearchParams();
  const contextReportJobId = params.get('reportJobId')?.trim() || '';
  const contextSourceHash = params.get('sourceHash')?.trim() || '';
  const [items, setItems] = useState<InboxItem[]>([]);
  const [filter, setFilter] = useState<InboxFilter>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(VIEW_KEY) || '{}') as { filter?: InboxFilter };
      return saved.filter && ['all', 'attention', 'approval', 'work', 'outcome', 'critical'].includes(saved.filter) ? saved.filter : 'attention';
    } catch {
      return 'attention';
    }
  });
  const [query, setQuery] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(VIEW_KEY) || '{}') as { query?: string };
      return saved.query ?? '';
    } catch {
      return '';
    }
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyDecisionId, setBusyDecisionId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    try {
      if (silent) setRefreshing(true); else setLoading(true);
      setError(null);
      const companyId = await resolveCurrentCompanyId();
      if (!companyId) throw new Error('TENANT_REQUIRED');

      const { data: decisions, error: decisionError } = await supabase
        .from('business_intelligence_decisions')
        .select('id,decision_key,decision_type,status,evidence,created_at,approved_at,approved_by,recommendation_id')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (decisionError) throw decisionError;

      const rows = decisions ?? [];
      const decisionIds = rows.map((row) => String(row.id));
      const recommendationIds = rows.map((row) => row.recommendation_id).filter((value): value is string => Boolean(value));
      const snapshotIds = rows
        .map((row) => {
          const evidence = row.evidence && typeof row.evidence === 'object' ? row.evidence as Record<string, unknown> : {};
          return typeof evidence.evidenceSnapshotId === 'string' ? evidence.evidenceSnapshotId : null;
        })
        .filter((value): value is string => Boolean(value));

      const [recommendations, approvals, work, outcomes, passports, snapshots] = await Promise.all([
        recommendationIds.length
          ? supabase.from('recommendations').select('id,title,status,evidence_snapshot_id').eq('company_id', companyId).in('id', recommendationIds)
          : Promise.resolve({ data: [], error: null }),
        decisionIds.length
          ? supabase.from('decision_approvals').select('id,decision_id,status,requested_by,decided_by').eq('company_id', companyId).in('decision_id', decisionIds).order('requested_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        decisionIds.length
          ? supabase.from('decision_work_items').select('id,decision_id,status,assignee_label,due_at,actual_impact').eq('company_id', companyId).in('decision_id', decisionIds).order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        decisionIds.length
          ? supabase.from('recommendation_outcomes').select('id,decision_id,status,actual_impact').eq('company_id', companyId).in('decision_id', decisionIds).order('observed_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        snapshotIds.length
          ? supabase.from('report_evidence_passports').select('id,evidence_snapshot_id,source_hash,verification_status,decision_readiness').eq('company_id', companyId).in('evidence_snapshot_id', snapshotIds)
          : Promise.resolve({ data: [], error: null }),
        snapshotIds.length
          ? supabase.from('report_evidence_snapshots').select('id,source_path,canonical_coverage_status,authoritative_row_count').eq('company_id', companyId).in('id', snapshotIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      for (const result of [recommendations, approvals, work, outcomes, passports, snapshots]) {
        if (result.error) throw result.error;
      }

      const recById = new Map((recommendations.data ?? []).map((row) => [String(row.id), row]));
      const approvalByDecision = new Map<string, { id: string; status: string }>();
      for (const row of approvals.data ?? []) {
        const key = String(row.decision_id);
        if (!approvalByDecision.has(key)) approvalByDecision.set(key, { id: String(row.id), status: String(row.status ?? 'PENDING') });
      }
      const workByDecision = new Map<string, { id: string; status: string; assignee: string | null; dueAt: string | null; actualImpact: number | null }>();
      for (const row of work.data ?? []) {
        const key = String(row.decision_id);
        if (!workByDecision.has(key)) workByDecision.set(key, {
          id: String(row.id),
          status: String(row.status ?? 'OPEN'),
          assignee: row.assignee_label == null ? null : String(row.assignee_label),
          dueAt: row.due_at == null ? null : String(row.due_at),
          actualImpact: row.actual_impact == null ? null : Number(row.actual_impact),
        });
      }
      const outcomeByDecision = new Map<string, { id: string; status: string; actualImpact: number | null }>();
      for (const row of outcomes.data ?? []) {
        const key = String(row.decision_id);
        if (!outcomeByDecision.has(key)) outcomeByDecision.set(key, {
          id: String(row.id),
          status: String(row.status ?? 'INSUFFICIENT'),
          actualImpact: row.actual_impact == null ? null : Number(row.actual_impact),
        });
      }
      const passportBySnapshot = new Map((passports.data ?? []).map((row) => [String(row.evidence_snapshot_id), row]));
      const snapshotById = new Map((snapshots.data ?? []).map((row) => [String(row.id), row]));

      const mapped: InboxItem[] = rows.map((row) => {
        const evidence = row.evidence && typeof row.evidence === 'object' ? row.evidence as Record<string, unknown> : {};
        const snapshotId = typeof evidence.evidenceSnapshotId === 'string' ? evidence.evidenceSnapshotId : null;
        const passport = snapshotId ? passportBySnapshot.get(snapshotId) : null;
        const snapshot = snapshotId ? snapshotById.get(snapshotId) : null;
        const recommendation = row.recommendation_id == null ? null : recById.get(String(row.recommendation_id));
        const approval = approvalByDecision.get(String(row.id));
        const workItem = workByDecision.get(String(row.id));
        const outcome = outcomeByDecision.get(String(row.id));
        const severity = String(evidence.severity ?? 'medium');
        const priority = priorityForSeverity(severity);
        return {
          decisionId: String(row.id),
          decisionKey: String(row.decision_key),
          decisionType: String(row.decision_type),
          status: String(row.status ?? 'PROPOSED'),
          createdAt: row.created_at == null ? null : String(row.created_at),
          signalTitle: String(evidence.signalTitle ?? recommendation?.title ?? 'قضية قرار'),
          signalMessage: String(evidence.signalMessage ?? recommendation?.title ?? 'الإشارة لا تملك وصفًا محفوظًا بعد.'),
          severity,
          priority,
          owner: workItem?.assignee ?? 'غير محدد',
          deadline: workItem?.dueAt ?? null,
          sourceHash: evidence.sourceHash == null ? null : String(evidence.sourceHash),
          reportJobId: evidence.reportExecutionJobId == null ? null : String(evidence.reportExecutionJobId),
          evidenceSnapshotId: snapshotId,
          passportStatus: passport?.verification_status == null ? 'UNVERIFIED' : String(passport.verification_status),
          passportReadiness: passport?.decision_readiness == null ? 'REVIEW' : String(passport.decision_readiness),
          sourcePath: snapshot?.source_path == null ? null : String(snapshot.source_path),
          recommendationId: row.recommendation_id == null ? null : String(row.recommendation_id),
          recommendationTitle: recommendation?.title == null ? null : String(recommendation.title),
          recommendationStatus: recommendation?.status == null ? null : String(recommendation.status),
          approvalId: approval?.id ?? null,
          approvalStatus: approval?.status ?? null,
          workItemId: workItem?.id ?? null,
          workItemStatus: workItem?.status ?? null,
          outcomeId: outcome?.id ?? null,
          outcomeStatus: outcome?.status ?? null,
          expectedImpact: null,
          actualImpact: outcome?.actualImpact ?? workItem?.actualImpact ?? null,
        };
      });
      setItems(mapped);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل صندوق القرار');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ filter, query }));
  }, [filter, query]);

  const contextItems = useMemo(() => {
    if (!contextReportJobId || !contextSourceHash) return items;
    return items.filter((item) => item.reportJobId === contextReportJobId && item.sourceHash === contextSourceHash);
  }, [items, contextReportJobId, contextSourceHash]);

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contextItems.filter((item) => {
      if (!filterItem(item, filter)) return false;
      if (!q) return true;
      return [item.signalTitle, item.signalMessage, item.sourcePath, item.decisionKey, item.owner]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [contextItems, filter, query]);

  const saveAsCase = async (item: InboxItem) => {
    setBusyDecisionId(item.decisionId);
    setSaveMessage(null);
    try {
      await saveAdvisorBusinessCase({
        decisionKey: item.decisionKey,
        decisionId: item.decisionId,
        issue: item.signalTitle,
        question: 'ماذا يحتاج هذا القرار الآن؟',
        why: item.signalMessage,
        impact: item.actualImpact == null ? 'الأثر المالي غير مثبت بعد.' : 'الأثر الفعلي المسجل: ' + item.actualImpact,
        evidence: [
          'التقرير المرتبط بالقرار',
          item.evidenceSnapshotId ? 'لقطة دليل مثبتة' : 'لا توجد لقطة دليل',
          item.sourceHash ? 'مصدر التقرير مرتبط' : 'لا يوجد مصدر تقرير مرتبط',
        ],
        whatNext: nextAction(item).label,
        recommendation: item.recommendationTitle ?? 'لا توجد توصية منفصلة.',
        priority: item.priority,
        priorityReason: ['مستوى الدليل: ' + item.passportStatus, 'جاهزية القرار: ' + item.passportReadiness],
        owner: item.owner,
        expectedOutcome: 'متابعة القضية من الدليل إلى العمل ثم النتيجة.',
        sourceHash: item.sourceHash ?? '',
        reportJobId: item.reportJobId ?? '',
        signalId: item.decisionKey,
        signalTitle: item.signalTitle,
      });
      setSaveMessage('تم حفظ القضية في Advisor Cases.');
    } catch (cause) {
      setSaveMessage(cause instanceof Error ? cause.message : 'تعذر حفظ القضية');
    } finally {
      setBusyDecisionId(null);
    }
  };

  const requestApproval = async (item: InboxItem) => {
    setBusyDecisionId(item.decisionId);
    try {
      await requestSourceDecisionApproval(item.decisionId, 'طلب اعتماد من Decision Inbox');
      setSaveMessage('تم إرسال القرار للاعتماد.');
      await load(true);
    } catch (cause) {
      setSaveMessage(cause instanceof Error ? cause.message : 'تعذر طلب الاعتماد');
    } finally {
      setBusyDecisionId(null);
    }
  };

  if (loading) return <LoadingState message="جاري بناء صندوق القرار من القرارات والأدلة والعمل والنتائج المحفوظة..." />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  const counts = {
    attention: contextItems.filter((item) => filterItem(item, 'attention')).length,
    approval: contextItems.filter((item) => item.approvalStatus === 'PENDING').length,
    work: contextItems.filter((item) => Boolean(item.workItemId) && item.workItemStatus !== 'COMPLETED').length,
    outcome: contextItems.filter((item) => Boolean(item.workItemId) && !item.outcomeId).length,
    critical: contextItems.filter((item) => item.priority === 'P0' || item.priority === 'P1').length,
  };

  return (
    <div dir="rtl" className="ag-decision-inbox-surface space-y-5 pb-10 animate-fade-in">
      <PageHeader
        title="صندوق القرار"
        subtitle="ما الذي يحتاج منك قرارًا أو متابعة الآن؟ كل صف أدناه مرتبط بسجل قرار، دليل مصدر، ومراحل الموافقة والعمل والنتيجة الموجودة فعليًا."
        actions={
          <>
            <Link to="/command-center" className="btn-secondary text-[11px]"><ArrowUpLeft size={13}/> الصورة التنفيذية</Link>
            <button type="button" onClick={() => void load(true)} disabled={refreshing} className="btn-ghost text-[11px]"><RefreshCw size={13} className={refreshing ? 'animate-spin' : ''}/> تحديث</button>
          </>
        }
      />

      {contextReportJobId && contextSourceHash ? (
        <section dir="rtl" className="rounded-[18px] border border-primary-200 bg-primary-50/60 p-4 shadow-sm" aria-label="سياق التقرير الحالي في صندوق القرار">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="text-[9px] font-black tracking-[.14em] text-primary-800">SOURCE-BOUND DECISION INBOX</div>
              <h2 className="mt-1 text-base font-black text-ink-950">قرارات التقرير الحالي فقط</h2>
              <p className="mt-1 text-[10px] leading-5 text-ink-700">تم تقييد الصندوق على نفس التقرير والبصمة المصدرية؛ لا تختلط قرارات تقارير أخرى.</p>
              <div className="mt-2 flex flex-wrap gap-2 text-[8px] text-ink-500"><span className="rounded-full bg-white px-2 py-1 font-mono">job={contextReportJobId}</span><span className="rounded-full bg-white px-2 py-1 font-mono">hash={contextSourceHash}</span><span className="rounded-full bg-white px-2 py-1 font-black">{contextItems.length} قرار مرتبط</span></div>
            </div>
            <Link to={'/reports/smart/' + encodeURIComponent(contextReportJobId) + '?sourceHash=' + encodeURIComponent(contextSourceHash)} className="btn-primary text-[10px]">العودة إلى التقرير الذكي <FileSearch size={12}/></Link>
          </div>
        </section>
      ) : null}

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5" aria-label="فلاتر صندوق القرار">
        {([
          ['attention', 'يحتاج انتباهًا', counts.attention, AlertTriangle],
          ['approval', 'اعتماد', counts.approval, ShieldCheck],
          ['work', 'عمل مفتوح', counts.work, Play],
          ['outcome', 'نتيجة ناقصة', counts.outcome, CheckCircle2],
          ['critical', 'P0/P1', counts.critical, Sparkles],
        ] as const).map(([key, label, count, Icon]) => (
          <button key={key} type="button" onClick={() => setFilter(key)} className={'rounded-[14px] border p-3 text-right transition ' + (filter === key ? 'border-primary-300 bg-primary-50 shadow-sm' : 'border-ink-200 bg-white hover:border-primary-200 hover:bg-primary-50/40')} aria-pressed={filter === key}>
            <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 text-[10px] font-black text-ink-500">{<Icon size={14}/>} {label}</span><span className="text-lg font-black tabular-nums text-ink-950">{count}</span></div>
          </button>
        ))}
      </section>

      <Card variant="evidence">
        <CardBody>
          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <label className="flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 py-2.5 focus-within:border-primary-300">
              <Search size={15} className="text-ink-400"/>
              <span className="sr-only">بحث صندوق القرار</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث في القرار، الإشارة، المصدر، المالك..." className="w-full bg-transparent text-[11px] font-semibold text-ink-900 outline-none placeholder:text-ink-400" />
            </label>
            <div className="flex items-center gap-2 text-[10px] text-ink-500"><Filter size={14}/> {visibleItems.length} قضية معروضة · العرض محفوظ على هذا الجهاز <Bookmark size={14} className="text-primary-600"/></div>
          </div>
          {saveMessage && <div className="mt-3 rounded-xl border border-primary-100 bg-primary-50 p-3 text-[10px] font-bold text-primary-900" role="status">{saveMessage}</div>}
        </CardBody>
      </Card>

      {visibleItems.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 size={22} className="text-success-600"/>}
          title="لا توجد قضايا مطابقة لهذا العرض"
          message="هذا ليس فراغًا عامًا: لا توجد سجلات قرار Canonical تطابق الفلتر الحالي. غيّر الفلتر أو ارجع إلى التقارير/الذكاء لبناء قضية حقيقية."
          action={<Link to="/intelligence" className="btn-secondary text-[10px]">استكشاف الإشارات</Link>}
        />
      ) : (
        <section className="space-y-3" aria-label="قائمة القرارات">
          {visibleItems.map((item) => {
            const action = nextAction(item);
            const busy = busyDecisionId === item.decisionId;
            return (
              <article key={item.decisionId} className="rounded-[16px] border border-ink-200 bg-white p-4 shadow-card">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <PriorityBadge priority={item.priority === 'P0' ? 'critical' : item.priority === 'P1' ? 'high' : item.priority === 'P2' ? 'medium' : 'low'} />
                      <SeverityBadge severity={item.severity} />
                      
                    </div>
                    <h2 className="mt-2 text-[15px] font-black text-ink-950">{item.signalTitle}</h2>
                    <p className="mt-1 text-[11px] leading-6 text-ink-500">{item.signalMessage}</p>

                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl bg-ink-50 p-2.5"><div className="text-[8px] font-black text-ink-400">الدليل</div><div className="mt-1 text-[10px] font-bold text-ink-800">تقرير أعمال مرتبط بالقضية</div><div className="mt-1 text-[8px] text-ink-400">{item.passportStatus === 'VERIFIED' ? 'الدليل موثق' : 'الدليل يحتاج مراجعة'} · {item.passportReadiness === 'READY' ? 'جاهز للقرار' : 'الجاهزية غير مكتملة'}</div></div>
                      <div className="rounded-xl bg-ink-50 p-2.5"><div className="text-[8px] font-black text-ink-400">OWNER</div><div className="mt-1 flex items-center gap-1 text-[10px] font-bold text-ink-800"><UserRound size={12}/>{item.owner}</div><div className="mt-1 text-[8px] text-ink-400">الموعد: {formatDate(item.deadline)}</div></div>
                      <div className="rounded-xl bg-ink-50 p-2.5"><div className="text-[8px] font-black text-ink-400">الحالة</div><div className="mt-1 text-[10px] font-bold text-ink-800">{item.status === 'PROPOSED' ? 'مقترح' : item.status === 'APPROVED' ? 'معتمد' : item.status === 'REJECTED' ? 'مرفوض' : item.status === 'COMPLETED' ? 'مكتمل' : 'قيد المتابعة'}</div><div className="mt-1 text-[8px] text-ink-400">{item.workItemStatus === 'IN_PROGRESS' ? 'قيد التنفيذ' : item.workItemStatus === 'COMPLETED' ? 'مكتمل' : item.workItemStatus ? 'عنصر عمل مفتوح' : 'لا يوجد عمل بعد'}</div></div>
                      <div className="rounded-xl bg-ink-50 p-2.5"><div className="text-[8px] font-black text-ink-400">النتيجة</div><div className="mt-1 text-[10px] font-bold text-ink-800">{item.outcomeId ? (item.outcomeStatus === 'OBSERVED' ? 'نتيجة مرصودة' : item.outcomeStatus === 'COMPLETED' ? 'مكتملة' : 'مقاسة') : 'لم تسجل نتيجة'}</div><div className="mt-1 text-[8px] text-ink-400">{item.actualImpact == null ? 'الأثر غير مثبت' : 'الأثر الفعلي: ' + item.actualImpact}</div></div>
                    </div>
                  </div>

                  <aside className="w-full shrink-0 xl:w-[250px]">
                    <div className="rounded-[14px] border border-ink-200 bg-ink-950 p-3 text-white">
                      <div className="text-[9px] font-black text-primary-300">الخطوة التالية</div>
                      <div className="mt-2 text-[11px] font-black">{action.label}</div>
                      <Link to={action.href} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-[10px] font-black text-ink-950 hover:bg-primary-50"><ArrowUpLeft size={12}/> افتح الإجراء</Link>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {item.reportJobId && item.sourceHash && <Link to={'/reports/smart/' + item.reportJobId + '?sourceHash=' + encodeURIComponent(item.sourceHash) + '#decision-evidence-inspector'} className="btn-ghost justify-center text-[9px]"><FileSearch size={12}/> الدليل</Link>}
                      {!item.approvalStatus && item.status === 'PROPOSED' && <button type="button" disabled={busy} onClick={() => void requestApproval(item)} className="btn-secondary justify-center text-[9px] disabled:opacity-50"><ShieldCheck size={12}/> اطلب اعتماد</button>}
                      <button type="button" disabled={busy || !item.sourceHash || !item.reportJobId} onClick={() => void saveAsCase(item)} className="btn-secondary justify-center text-[9px] disabled:opacity-50"><Bookmark size={12}/> احفظ كقضية</button>
                      {item.workItemId && <Link to={'/work-center?decisionId=' + encodeURIComponent(item.decisionId) + (item.reportJobId && item.sourceHash ? '&reportJobId=' + encodeURIComponent(item.reportJobId) + '&sourceHash=' + encodeURIComponent(item.sourceHash) : '')} className="btn-secondary justify-center text-[9px]"><Play size={12}/> افتح العمل</Link>}
                      <Link to={'/replay?decisionId=' + encodeURIComponent(item.decisionId) + (item.reportJobId && item.sourceHash ? '&reportJobId=' + encodeURIComponent(item.reportJobId) + '&sourceHash=' + encodeURIComponent(item.sourceHash) : '')} className="btn-ghost justify-center text-[9px]"><RefreshCw size={12}/> Replay</Link>
                    </div>
                  </aside>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
