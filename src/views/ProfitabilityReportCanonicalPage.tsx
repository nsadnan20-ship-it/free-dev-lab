import { useCallback, useEffect, useState } from 'react';
import { Link } from '@/lib/router-compat';
import { Card, CardBody } from '@/components/ui/Card';
import { PageHeader, LoadingState, ErrorState, DataUnavailableState } from '@/components/ui/States';
import { fetchProfitabilitySnapshot, type ProfitabilitySnapshot } from '@/lib/dashboard-canonical';
import { formatCurrency, formatNumber } from '@/lib/format';

function knownCount(a: number | null, b: number | null): string { if (a == null || b == null) return 'غير متاح'; return formatNumber(a + b); }

export function ProfitabilityReportCanonicalPage() {
  const [snapshot, setSnapshot] = useState<ProfitabilitySnapshot | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { try { setLoading(true); setError(null); setSnapshot(await fetchProfitabilitySnapshot()); } catch (e: unknown) { setError(e instanceof Error ? e.message : 'تعذر تحميل الربحية'); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]); if (loading) return <LoadingState />; if (error) return <ErrorState message={error} onRetry={load} />; if (!snapshot) return <DataUnavailableState title="تقرير الربحية ينتظر البيانات" message="لا توجد صورة مالية موثوقة تكفي لبناء تقرير الربحية؛ لا يتم تحويل غياب التكلفة أو الإيراد إلى صفر." action={<Link to="/import" className="btn-primary text-[11px]">إضافة مصدر</Link>} />;
  const calculated = snapshot.status === 'CALCULATED' && snapshot.revenue != null && snapshot.cost != null && snapshot.gross_profit != null;
  return <div dir="rtl" className="report-page space-y-5 animate-fade-in">
    <PageHeader title="تقرير الأرباح والربحية" subtitle="Financial Truth Contract: لا يتحول نقص الدليل المالي إلى صفر." actions={<button type="button" onClick={() => window.print()} className="btn-primary print-hide text-xs">طباعة التقرير</button>} />
    <section className="hero-surface p-4">
      <div className="flex flex-wrap items-center gap-3"><span className={`badge ${calculated ? 'badge-success' : 'badge-warning'}`}>{calculated ? 'محسوب من المصدر' : 'بيانات غير كافية'}</span><span className="text-[11px] font-semibold text-ink-500">العملة: {snapshot.currency || 'غير محددة'}</span><span className="text-[11px] font-semibold text-ink-500">حالة العملة: {snapshot.currency_status === 'CONSISTENT' ? 'متسقة' : 'غير كافية'}</span></div>
      <div className="report-meta mt-3"><span>حتى {snapshot.as_of}</span><span>الحسابات المالية من المسار المعتمد</span><span>الأصفار لا تُستخدم لتعويض الدليل المفقود</span></div>
    </section>
    <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <Card><CardBody><div className="surface-label">الإيراد</div><div className="display-number mt-1">{calculated ? formatCurrency(snapshot.revenue) : 'غير متاح'}</div></CardBody></Card>
      <Card><CardBody><div className="surface-label">التكلفة</div><div className="display-number mt-1">{calculated ? formatCurrency(snapshot.cost) : 'غير متاح'}</div></CardBody></Card>
      <Card className="hero-surface"><CardBody><div className="surface-label">الربح الإجمالي</div><div className="display-number mt-1">{calculated ? formatCurrency(snapshot.gross_profit) : 'غير متاح'}</div></CardBody></Card>
    </section>
    <Card><CardBody><div className="grid grid-cols-2 gap-4 md:grid-cols-4"><div><div className="surface-label">الهامش</div><div className="mt-1 text-lg font-black text-ink-900">{calculated && snapshot.gross_margin != null ? `${snapshot.gross_margin.toFixed(2)}%` : 'غير متاح'}</div></div><div><div className="surface-label">الفواتير</div><div className="mt-1 text-lg font-black text-ink-900">{formatNumber(snapshot.invoice_count)}</div></div><div><div className="surface-label">صفوف مالية ناقصة</div><div className="mt-1 text-lg font-black text-ink-900">{knownCount(snapshot.bad_invoice_rows, snapshot.bad_sale_item_rows)}</div></div><div><div className="surface-label">اختلاف العملة</div><div className="mt-1 text-lg font-black text-ink-900">{formatNumber(snapshot.currency_mismatch_rows)}</div></div></div>{snapshot.reasons.length > 0 && <div className="warning-callout mt-5 text-xs text-warning-800"><div className="font-bold mb-1">أسباب عدم كفاية الدليل</div><ul className="list-disc pr-5 space-y-1">{snapshot.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></div>}</CardBody></Card>
  </div>;
}
