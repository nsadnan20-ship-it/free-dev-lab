import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpLeft, BrainCircuit, Database, Send, ShieldAlert } from 'lucide-react';
import { fetchDashboardSnapshot, type DashboardKPIs } from '@/lib/dashboard-canonical';
import { formatCurrency } from '@/lib/format';
import { Link } from '@/lib/router-compat';

type AssistantMode = 'LOADING' | 'READY' | 'INSUFFICIENT_DATA' | 'ERROR';

interface DeterministicIntelligenceAssistantProps {
  recommendationsCount: number;
  activeAlertsCount: number;
  forecastsCount: number;
}

function answerQuery(query: string, kpis: DashboardKPIs, recommendationsCount: number, activeAlertsCount: number, forecastsCount: number): string {
  const q = query.trim().toLowerCase();
  if (!q) return 'اكتب سؤالًا مثل: ما وضع المبيعات؟ أو ما وضع الذمم؟ أو ما عدد التوصيات والتنبيهات؟';

  if (q.includes('مبيعات') || q.includes('sales')) {
    return kpis.totalSales == null ? 'إجمالي المبيعات غير متاح لأن مصدر المؤشر غير مكتمل.' : `إجمالي المبيعات في اللقطة الحالية: ${formatCurrency(kpis.totalSales)}.`;
  }
  if (q.includes('ربح') || q.includes('هامش') || q.includes('profit') || q.includes('margin')) {
    if (kpis.grossProfit == null || kpis.grossMargin == null) return 'الربح أو الهامش غير متاحين من المصدر الحالي.';
    return `إجمالي الربح: ${formatCurrency(kpis.grossProfit)}، والهامش الإجمالي: ${kpis.grossMargin.toFixed(1)}%.`;
  }
  if (q.includes('ذمم') || q.includes('تحصيل') || q.includes('receivable') || q.includes('collection')) {
    if (kpis.totalReceivables == null) return 'الذمم المدينة غير متاحة من المصدر الحالي.';
    const overdue = kpis.overdueReceivables == null ? 'غير متاح' : formatCurrency(kpis.overdueReceivables);
    const rate = kpis.collectionRate == null ? 'غير متاح' : `${kpis.collectionRate.toFixed(1)}%`;
    return `الذمم المدينة: ${formatCurrency(kpis.totalReceivables)}، المتأخر: ${overdue}، ومعدل التحصيل: ${rate}.`;
  }
  if (q.includes('مخزون') || q.includes('inventory') || q.includes('stock')) {
    return kpis.inventoryValue == null ? 'قيمة المخزون غير متاحة من المصدر الحالي.' : `قيمة المخزون في اللقطة الحالية: ${formatCurrency(kpis.inventoryValue)}.`;
  }
  if (q.includes('توص') || q.includes('recommendation')) {
    return `عدد التوصيات المعروضة من المصدر الحالي: ${recommendationsCount}.`;
  }
  if (q.includes('تنبيه') || q.includes('alert')) {
    return `عدد التنبيهات النشطة المعروضة في هذه الجلسة: ${activeAlertsCount}.`;
  }
  if (q.includes('تنبؤ') || q.includes('forecast')) {
    return `عدد التنبؤات المصدرية المتاحة حاليًا: ${forecastsCount}.`;
  }
  return 'هذا المساعد مقيد بالمؤشرات والبيانات المصدرية المحملة في الجلسة. استخدم كلمات مثل: المبيعات، الربح، الذمم، المخزون، التوصيات، التنبيهات، التنبؤات.';
}

export function DeterministicIntelligenceAssistant({
  recommendationsCount,
  activeAlertsCount,
  forecastsCount,
}: DeterministicIntelligenceAssistantProps) {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [snapshotAsOf, setSnapshotAsOf] = useState<string | null>(null);
  const [mode, setMode] = useState<AssistantMode>('LOADING');
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('جارٍ تحميل سياق المؤشرات…');

  const loadContext = useCallback(async () => {
    setRefreshing(true);
    setMode('LOADING');
    try {
      const snapshot = await fetchDashboardSnapshot(6);
      setKpis(snapshot.kpis);
      setSnapshotAsOf(snapshot.asOf ?? null);
      setMode(snapshot.kpis.status === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT_DATA' : 'READY');
      setAnswer(snapshot.kpis.status === 'INSUFFICIENT_DATA'
        ? 'بعض المؤشرات غير مكتملة؛ سيظل المساعد ملتزمًا بعدم اختلاق قيم.'
        : 'السياق جاهز. اسأل عن المبيعات أو الربح أو الذمم أو المخزون أو التوصيات أو التنبيهات أو التنبؤات.');
    } catch {
      setKpis(null);
      setMode('ERROR');
      setAnswer('تعذر تحميل سياق المؤشرات. لا توجد إجابة موثوقة حتى تعود اللقطة الكانونية.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  const suggested = useMemo(() => ['ما وضع المبيعات؟', 'ما وضع الذمم والتحصيل؟', 'ما وضع الربحية؟', 'ما عدد التوصيات والتنبيهات؟'], []);

  const ask = () => {
    if (!kpis) return;
    setAnswer(answerQuery(query, kpis, recommendationsCount, activeAlertsCount, forecastsCount));
  };

  const answerTarget = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.includes('مبيعات') || q.includes('sales')) return { path: '/reports/sales', label: 'فتح سياق المبيعات' };
    if (q.includes('ربح') || q.includes('هامش') || q.includes('profit') || q.includes('margin')) return { path: '/reports/profitability', label: 'فتح سياق الربحية' };
    if (q.includes('ذمم') || q.includes('تحصيل') || q.includes('receivable') || q.includes('collection')) return { path: '/reports/receivables', label: 'فتح سياق التحصيل' };
    if (q.includes('مخزون') || q.includes('inventory') || q.includes('stock')) return { path: '/inventory', label: 'فتح سياق المخزون' };
    if (q.includes('توص') || q.includes('recommendation')) return { path: '/decision-experience', label: 'فتح طابور القرار' };
    if (q.includes('تنبيه') || q.includes('alert')) return { path: '/command-center', label: 'فتح مركز الانتباه' };
    if (q.includes('تنبؤ') || q.includes('forecast')) return { path: '/intelligence/forecasts', label: 'فتح سياق التنبؤ' };
    return null;
  }, [query]);

  return (
    <section className="rounded-3xl border border-ink-200 bg-white p-5 shadow-sm" aria-label="المساعد الذكي السياقي">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-700"><BrainCircuit size={22}/></div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-black text-ink-950">المساعد الذكي السياقي</h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-ink-50 px-2.5 py-1 text-[10px] font-bold text-ink-500"><Database size={11}/> السياق الكانوني</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-ink-500">إجابات حتمية من اللقطة الكانونية الحالية. لا يرسل بيانات الشركة إلى مزود AI خارجي ولا يخترع نتائج.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-bold text-ink-400">
              <span className="rounded-full bg-ink-50 px-2.5 py-1">لقطة: 6 أشهر</span>
              <span className="rounded-full bg-ink-50 px-2.5 py-1">as-of: {snapshotAsOf ?? 'غير متاح'}</span>
            </div>
          </div>
        </div>
        <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
          mode === 'READY' ? 'bg-success-50 text-success-700' :
          mode === 'LOADING' ? 'bg-primary-50 text-primary-700' :
          'bg-warning-50 text-warning-700'
        }`} role="status" aria-live="polite" aria-busy={mode === 'LOADING'}>
          {mode === 'READY' ? <Database size={12}/> : <ShieldAlert size={12}/>}
          {mode === 'READY' ? 'السياق جاهز' : mode === 'LOADING' ? 'جارٍ تحميل السياق' : mode === 'INSUFFICIENT_DATA' ? 'بيانات غير مكتملة' : 'السياق غير متاح'}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {suggested.map(item => <button key={item} type="button" onClick={() => { setQuery(item); if (kpis) setAnswer(answerQuery(item, kpis, recommendationsCount, activeAlertsCount, forecastsCount)); }} className="rounded-full border border-ink-200 bg-ink-50 px-3 py-1.5 text-[11px] font-semibold text-ink-600 hover:border-primary-200 hover:bg-primary-50">{item}</button>)}
      </div>

      <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={event => { event.preventDefault(); ask(); }}>
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          className="input"
          placeholder="اكتب سؤالًا عن المؤشرات الحالية..."
          aria-label="سؤال للمساعد الذكي السياقي"
          aria-describedby="ag-assistant-answer"
          disabled={!kpis || mode === 'LOADING'}
        />
        <button type="submit" disabled={!kpis || mode === 'LOADING' || mode === 'ERROR'} className="btn-primary shrink-0"><Send size={15}/> اسأل</button>
        {(mode === 'ERROR' || mode === 'INSUFFICIENT_DATA') && (
          <button type="button" onClick={() => void loadContext()} disabled={refreshing} className="btn-secondary shrink-0" aria-label="إعادة تحميل سياق المؤشرات">
            {refreshing ? 'جارٍ التحديث…' : 'تحديث السياق'}
          </button>
        )}
      </form>

      <div id="ag-assistant-answer" className="mt-4 rounded-2xl border border-ink-100 bg-ink-50 p-4 text-sm leading-7 text-ink-700" role="status" aria-live="polite">
        <div>{answer}</div>
        {answerTarget && (
          <Link to={answerTarget.path} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-black text-primary-800 ring-1 ring-inset ring-ink-200 hover:border-primary-200 hover:bg-primary-50">
            {answerTarget.label} <ArrowUpLeft size={13}/>
          </Link>
        )}
      </div>
    </section>
  );
}
