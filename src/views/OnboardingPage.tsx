import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowUpLeft, BrainCircuit, Building2, CheckCircle2, CircleAlert, FileInput, FileSearch, FileText, Gauge, ShieldCheck, Target, Users, Wand2 } from 'lucide-react';
import { Link } from '@/lib/router-compat';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { PageHeader, ErrorState, LoadingState } from '@/components/ui/States';
import { getAuthenticatedUser } from '@/lib/auth-session';
import { resolveCurrentCompanyId, supabase } from '@/lib/supabase';
import { fetchDataQualitySnapshot } from '@/lib/data-quality-snapshot';

type StepState = 'READY' | 'ACTION_REQUIRED' | 'UNKNOWN';

type OnboardingState = { userReady: boolean; companyName: string | null; role: string | null; canonicalCommitCount: number | null; verifiedReportCount: number | null; dataQualityIssues: number | null; };

const STEPS = [
  { id: 'account', title: 'الحساب والدخول', description: 'جلسة مستخدم موثقة.', icon: ShieldCheck, href: '/settings/profile' },
  { id: 'company', title: 'الشركة والسياق', description: 'الشركة الحالية وبياناتها الأساسية.', icon: Building2, href: '/settings' },
  { id: 'team', title: 'العضوية والدور', description: 'العضوية الفعلية في الشركة الحالية.', icon: Users, href: '/settings/profile' },
  { id: 'import', title: 'استيراد البيانات', description: 'ابدأ من المسار الحاكم للاستيراد.', icon: FileInput, href: '/import' },
  { id: 'quality', title: 'جودة البيانات', description: 'راجع أي مشكلة قبل اعتبار البيانات جاهزة.', icon: Gauge, href: '/data-quality' },
  { id: 'dashboard', title: 'لوحة القيادة', description: 'المؤشرات من المصدر الكانوني.', icon: Wand2, href: '/' },
  { id: 'reports', title: 'التقارير', description: 'التقارير التنفيذية والمالية.', icon: FileText, href: '/reports' },
  { id: 'decision', title: 'القرار', description: 'تحويل evidence إلى قرار وإجراء.', icon: CheckCircle2, href: '/decision-experience' },
] as const;

function stateFor(stepId: string, data: OnboardingState): StepState {
  if (stepId === 'account') return data.userReady ? 'READY' : 'ACTION_REQUIRED';
  if (stepId === 'company') return data.companyName ? 'READY' : 'ACTION_REQUIRED';
  if (stepId === 'team') return data.role ? 'READY' : 'ACTION_REQUIRED';
  if (stepId === 'import') return data.canonicalCommitCount == null ? 'UNKNOWN' : data.canonicalCommitCount > 0 ? 'READY' : 'ACTION_REQUIRED';
  if (stepId === 'quality') return data.dataQualityIssues == null ? 'UNKNOWN' : data.dataQualityIssues === 0 ? 'READY' : 'ACTION_REQUIRED';
  if (stepId === 'dashboard' || stepId === 'reports') return data.userReady && Boolean(data.companyName) && Number(data.canonicalCommitCount ?? 0) > 0 ? 'READY' : 'ACTION_REQUIRED';
  if (stepId === 'decision') return Number(data.verifiedReportCount ?? 0) > 0 ? 'READY' : Number(data.canonicalCommitCount ?? 0) > 0 ? 'ACTION_REQUIRED' : 'UNKNOWN';
  return 'UNKNOWN';
}

export function OnboardingPage() {
  const [data, setData] = useState<OnboardingState>({ userReady: false, companyName: null, role: null, canonicalCommitCount: null, verifiedReportCount: null, dataQualityIssues: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const user = await getAuthenticatedUser();
      if (!user) throw new Error('AUTH_REQUIRED');
      const companyId = await resolveCurrentCompanyId();
      if (!companyId) throw new Error('TENANT_REQUIRED');
      const [{ data: company }, { data: membership }, { count: canonicalCommitCount, error: canonicalCommitError }, { count: verifiedReportCount, error: verifiedReportError }] = await Promise.all([
        supabase.from('companies').select('name').eq('id', companyId).maybeSingle(),
        supabase.from('company_memberships').select('role').eq('company_id', companyId).eq('user_id', user.id).eq('is_active', true).maybeSingle(),
        supabase.from('canonical_import_commits').select('id', { count: 'exact' }).eq('company_id', companyId).limit(1),
        supabase.from('report_evidence_passports').select('id', { count: 'exact' }).eq('company_id', companyId).eq('verification_status', 'VERIFIED').eq('decision_readiness', 'READY').limit(1),
      ]);
      if (canonicalCommitError) throw canonicalCommitError;
      if (verifiedReportError) throw verifiedReportError;
      const qualitySnapshot = await fetchDataQualitySnapshot();
      const dataQualityIssues = qualitySnapshot.status === 'EMPTY' ? null : qualitySnapshot.entities.reduce((total, entity) => total + entity.issues, 0);
      setData({ userReady: true, companyName: company?.name ?? null, role: membership?.role ?? null, canonicalCommitCount: canonicalCommitCount ?? 0, verifiedReportCount: verifiedReportCount ?? 0, dataQualityIssues });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل حالة البداية');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const summary = useMemo(() => { const states = STEPS.map(step => stateFor(step.id, data)); return { ready: states.filter(state => state === 'READY').length, action: states.filter(state => state === 'ACTION_REQUIRED').length, unknown: states.filter(state => state === 'UNKNOWN').length }; }, [data]);
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  const nextAction = STEPS.find(step => stateFor(step.id, data) === 'ACTION_REQUIRED');
  return (
    <div dir="rtl" className="ag-onboarding-page space-y-6">
      <PageHeader
        title="من أول تقرير إلى قرار قابل للتنفيذ"
        subtitle="الأغبري لا يبدأ من لوحة مؤشرات. يبدأ من المصدر، يثبت الحقيقة، يشرح ما يعنيه الرقم، ثم يربط التوصية بالقرار والعمل والنتيجة."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/import" className="btn-primary text-xs"><FileInput size={14}/> ابدأ برفع تقرير</Link>
            <Link to="/command-center" className="btn-secondary text-xs"><ArrowUpLeft size={14}/> مركز القيادة</Link>
          </div>
        }
      />
      <section className="ag-onboarding-value grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="القيمة التي يحصل عليها العميل">
        {[
          { step: '01', icon: ShieldCheck, title: 'الحقيقة أولًا', text: 'كل نتيجة تبقى مرتبطة بالمصدر وبصمته ولقطة الدليل وحالة الثقة.', tone: 'border-primary-200 bg-primary-50/55 text-primary-800' },
          { step: '02', icon: BrainCircuit, title: 'المستشار الحقيقي', text: 'النتيجة تتحول إلى Finding وRisk وOpportunity وSignal وأسئلة أعمال واضحة.', tone: 'border-ink-200 bg-white text-ink-800' },
          { step: '03', icon: Target, title: 'قرار موثق', text: 'التوصية لا تصبح قرارًا تلقائيًا؛ تمر عبر مساحة قرار وموافقة منفصلة.', tone: 'border-warning-200 bg-warning-50/65 text-warning-900' },
          { step: '04', icon: FileSearch, title: 'عمل ونتيجة', text: 'ينتقل السياق إلى Work Center ثم يعود بنتيجة فعلية عندما تُسجل.', tone: 'border-success-200 bg-success-50/65 text-success-900' },
        ].map(({ step, icon: Icon, title, text, tone }) => (
          <article key={step} className={'rounded-[18px] border p-4 shadow-sm ' + tone}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] font-black tracking-[.16em] opacity-70">{step}</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/75"><Icon size={17}/></span>
            </div>
            <h2 className="mt-4 text-sm font-black">{title}</h2>
            <p className="mt-1.5 text-[10px] leading-5 opacity-80">{text}</p>
          </article>
        ))}
      </section>
      <section className="ag-onboarding-summary grid gap-4 sm:grid-cols-3" aria-label="ملخص حالة البدء"><Card><CardBody><div className="text-xs text-ink-500">جاهز</div><div className="mt-1 text-2xl font-black text-success-700">{summary.ready}</div></CardBody></Card><Card><CardBody><div className="text-xs text-ink-500">يحتاج إجراء</div><div className="mt-1 text-2xl font-black text-warning-700">{summary.action}</div></CardBody></Card><Card><CardBody><div className="text-xs text-ink-500">غير مثبت بعد</div><div className="mt-1 text-2xl font-black text-ink-700">{summary.unknown}</div></CardBody></Card></section>
      {nextAction && <Card className="ag-onboarding-next"><CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-xs font-medium text-primary-700">الخطوة التالية</div><div className="mt-1 text-lg font-bold text-ink-900">{nextAction.title}</div><div className="mt-1 text-sm text-ink-500">{nextAction.description}</div></div><Link to={nextAction.href} className="btn-primary text-xs">متابعة <ArrowLeft size={14} /></Link></CardBody></Card>}
      <Card><CardHeader title="مسار التجهيز التجاري" subtitle={data.companyName ? `الشركة الحالية: ${data.companyName}${data.role ? ` · الدور: ${data.role}` : ''}` : 'لم يتم تثبيت الشركة الحالية بعد.'} /><CardBody className="space-y-3"><div role="list" aria-label="خطوات التجهيز">{STEPS.map((step, index) => { const state = stateFor(step.id, data); const Icon = step.icon; const badge = state === 'READY' ? { text: 'جاهز', className: 'bg-success-50 text-success-700' } : state === 'ACTION_REQUIRED' ? { text: 'إجراء مطلوب', className: 'bg-warning-50 text-warning-700' } : { text: 'غير مثبت', className: 'bg-ink-50 text-ink-500' }; return <div key={step.id} role="listitem" className="ag-onboarding-step flex flex-col gap-3 rounded-xl border border-ink-100 p-4 sm:flex-row sm:items-center"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-50 text-ink-600"><Icon size={18} /></div><div className="min-w-0 flex-1"><div className="text-xs font-bold text-primary-600">0{index + 1}</div><div className="mt-0.5 text-sm font-semibold text-ink-900">{step.title}</div><div className="mt-1 text-xs leading-5 text-ink-400">{step.description}</div></div><div className="flex items-center gap-2"><span role="status" aria-label={badge.text} className={`rounded-full px-3 py-1 text-xs font-medium ${badge.className}`}>{state === 'READY' && <CheckCircle2 className="ml-1 inline" size={13} />}{state === 'ACTION_REQUIRED' && <CircleAlert className="ml-1 inline" size={13} />}{badge.text}</span><Link to={step.href} className="inline-flex min-h-11 items-center rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50">فتح</Link></div></div>; })}</div></CardBody></Card>
      <div className="text-xs leading-5 text-ink-400">هذه الشاشة لا تمنح حالة “مكتمل” لخطوات المنتج لمجرد وجود المسار. الحالة مرتبطة فقط بالأدلة التي يمكن قراءتها من الجلسة والـtenant والبيانات الحالية.</div>
    </div>
  );
}