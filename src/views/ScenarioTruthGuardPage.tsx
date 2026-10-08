import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowUpLeft, Database, ShieldCheck } from 'lucide-react';
import { Link } from '@/lib/router-compat';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { LoadingState, PageHeader } from '@/components/ui/States';
import { fetchProfitabilitySnapshot } from '@/lib/dashboard-canonical';
import { CanonicalScenarioPage } from '@/views/CanonicalScenarioPage';

export function ScenarioTruthGuardPage() {
  const [state, setState] = useState<'loading' | 'ready' | 'blocked'>('loading');
  const [reason, setReason] = useState<string | null>(null);
  const [financials, setFinancials] = useState<{ revenue: number; cost: number; currency: string } | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    setReason(null);
    try {
      const snapshot = await fetchProfitabilitySnapshot();
      if (
        snapshot.status === 'CALCULATED' &&
        snapshot.revenue !== null &&
        snapshot.cost !== null &&
        snapshot.currency !== null
      ) {
        setFinancials({ revenue: snapshot.revenue, cost: snapshot.cost, currency: snapshot.currency });
        setState('ready');
        return;
      }
      setFinancials(null);
      setReason(snapshot.reasons.join(', ') || 'FINANCIAL_TRUTH_INSUFFICIENT_DATA');
      setState('blocked');
    } catch (error) {
      setFinancials(null);
      setReason(error instanceof Error ? error.message : 'FINANCIAL_TRUTH_UNAVAILABLE');
      setState('blocked');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (state === 'loading') return <LoadingState message="جارٍ التحقق من الحقيقة المالية قبل تشغيل المحاكاة..." />;
  if (state === 'ready' && financials) {
    return (
      <CanonicalScenarioPage
        baseRevenue={financials.revenue}
        baseCost={financials.cost}
        currency={financials.currency}
      />
    );
  }

  return (
    <div dir="rtl" className="ag-scenario-surface space-y-5 animate-fade-in pb-10">
      <PageHeader
        title="محاكاة السيناريوهات"
        subtitle="المحاكاة مغلقة مؤقتًا حتى تتوفر قاعدة مالية موثوقة وقابلة للحساب."
        actions={<Link to="/data-quality" className="btn-secondary text-[10px]">فحص جودة البيانات <ArrowUpLeft size={13} /></Link>}
      />

      <section className="overflow-hidden rounded-[1.5rem] border border-warning-200 bg-warning-50/70">
        <div className="grid gap-4 p-5 lg:grid-cols-[auto_1fr_auto] lg:items-center lg:p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-warning-700 ring-1 ring-inset ring-warning-200">
            <ShieldCheck size={23} aria-hidden="true" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-warning-100 px-2.5 py-1 text-[9px] font-black text-warning-800">BLOCKED — حماية الحقيقة</span>
              <span className="text-[9px] font-black uppercase tracking-[.12em] text-warning-700">Financial Truth Gate</span>
            </div>
            <h2 className="mt-2 text-base font-black text-ink-950">لا توجد قاعدة مالية كافية لتشغيل السيناريو بأمان.</h2>
            <p className="mt-1 max-w-3xl text-[10px] leading-5 text-ink-600">
              لن تُستخدم أرقام افتراضية أو تقديرات صامتة. أصلح النقص أو عدم الاتساق في البيانات المالية، ثم أعد فتح المحاكاة.
            </p>
          </div>
          <Link to="/trust" className="btn-primary whitespace-nowrap text-[10px]">فتح الثقة والأدلة <ArrowUpLeft size={13} /></Link>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_.8fr]">
        <Card variant="quality">
          <CardHeader kicker="WHAT IS REQUIRED" title="ما الذي تمنعه هذه البوابة؟" subtitle="النتيجة أدناه ليست خطأ عرض؛ إنها حالة حماية مقصودة." />
          <CardBody>
            <div className="space-y-2 text-[10px] leading-5 text-ink-600">
              <div className="flex items-start gap-2 rounded-xl border border-ink-100 bg-white p-3"><Database size={14} className="mt-0.5 shrink-0 text-primary-700" aria-hidden="true" /><span>يجب أن تكون الإيرادات والتكلفة وقيمة العملة متاحة من المصدر التحليلي الموثوق.</span></div>
              <div className="flex items-start gap-2 rounded-xl border border-ink-100 bg-white p-3"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-success-700" aria-hidden="true" /><span>عند توفر القاعدة، تُبنى المحاكاة مباشرة على القيم المقروءة دون إضافة بيانات خارجية.</span></div>
              <div className="flex items-start gap-2 rounded-xl border border-warning-100 bg-warning-50/60 p-3"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning-700" aria-hidden="true" /><span>النقص الحالي يمنع إنشاء نتيجة قد تبدو دقيقة بينما أساسها غير مكتمل.</span></div>
            </div>
          </CardBody>
        </Card>

        <Card variant="evidence">
          <CardHeader kicker="DIAGNOSTIC" title="حالة البوابة" subtitle="السبب المسجل من المصدر الحالي." />
          <CardBody>
            <div className="rounded-2xl bg-ink-950 p-4 text-white">
              <div className="text-[9px] font-black uppercase tracking-[.14em] text-primary-300">TRUTH GATE RESULT</div>
              <div className="mt-2 text-sm font-black">المحاكاة لم تُشغّل</div>
              <p className="mt-2 text-[10px] leading-5 text-slate-300">تم إيقاف مسار السيناريو قبل الحساب لأن قاعدة الحقيقة المالية لم تستوفِ شرط الجاهزية.</p>
              {reason && <div className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-3 text-[9px] font-mono text-slate-300">{reason}</div>}
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-ink-200 bg-white p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-black text-ink-900">الإجراء التالي</div>
          <p className="mt-1 text-[10px] text-ink-400">راجع جودة البيانات أو الأدلة، ثم أعد المحاولة بعد تحقق القاعدة المالية.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} className="btn-secondary min-h-11 text-[10px]" aria-label="إعادة فحص الحقيقة المالية">إعادة فحص</button>
          <Link to="/data-quality" className="btn-primary min-h-11 shrink-0 text-[10px]">الانتقال إلى جودة البيانات <ArrowUpLeft size={13} /></Link>
        </div>
      </div>
    </div>
  );
}
