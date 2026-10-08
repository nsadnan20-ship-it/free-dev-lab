import { useEffect, useState } from 'react';
import { ArrowLeft, Database, ShieldCheck, Users } from 'lucide-react';
import { Link, useSearchParams } from '@/lib/router-compat';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { fetchSmartReport, fetchSmartReportCatalog, type SmartReportDetail, type SmartReportCatalogItem } from '@/lib/report-smart';
import { formatNumber } from '@/lib/format';

export function BenchmarkPage() {
  const [params] = useSearchParams();
  const jobId = params.get('reportJobId')?.trim() || '';
  const sourceHash = params.get('sourceHash')?.trim() || '';
  const [report, setReport] = useState<SmartReportDetail | null>(null);
  const [catalog, setCatalog] = useState<SmartReportCatalogItem[]>([]);
  const [loading, setLoading] = useState(Boolean(jobId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId || !sourceHash) {
      setError('BENCHMARK_SOURCE_CONTEXT_REQUIRED');
      setLoading(false);
      return;
    }
    let active = true;
    void Promise.all([fetchSmartReport(jobId, sourceHash), fetchSmartReportCatalog(100)]).then(([next, items]) => {
      if (!active) return;
      if (!next) throw new Error('REPORT_SOURCE_NOT_FOUND');
      if (next.sourceHash !== sourceHash) throw new Error('REPORT_SOURCE_HASH_MISMATCH');
      setReport(next);
      setCatalog(items);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [jobId, sourceHash]);

  if (loading) return <LoadingState message="جارٍ فحص أهلية المقارنة دون اختلاق Cohort..." />;
  if (error) return <ErrorState message={error} />;
  if (!report) return null;

  const sameSpecialty = catalog.filter((item) => item.specialty === report.specialty);
  const networkStatus = 'INSUFFICIENT_SAMPLE';

  return (
    <div dir="rtl" className="ag-benchmark-surface space-y-5 pb-10">
      <section className="rounded-[18px] border border-primary-200 bg-primary-50/60 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[9px] font-black tracking-[.14em] text-primary-800">أهلية المقارنة</div>
            <h1 className="mt-1 text-xl font-black text-ink-950">أهلية المقارنة لهذا التقرير</h1>
            <p className="mt-1 text-[11px] leading-6 text-ink-600">هذا التقرير جاهز لفحص أهلية المقارنة، لكن لا توجد عينة مقارنة موثوقة كافية لإصدار ترتيب أو متوسط.</p>
          </div>
          <Link to={'/reports/smart/' + report.jobId + '?sourceHash=' + encodeURIComponent(report.sourceHash)} className="btn-secondary inline-flex items-center gap-2 text-xs">العودة للتقرير <ArrowLeft size={13}/></Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-ink-200 bg-white p-4">
          <div className="flex items-center gap-2 text-[10px] text-ink-500"><ShieldCheck size={14}/> حالة الشبكة</div>
          <div className="mt-2 text-xl font-black text-warning-800">عينة غير كافية</div>
          <div className="mt-1 text-[10px] text-ink-500">العينة غير كافية</div>
        </div>
        <div className="rounded-2xl border border-ink-200 bg-white p-4">
          <div className="flex items-center gap-2 text-[10px] text-ink-500"><Users size={14}/> سياق داخلي</div>
          <div className="mt-2 text-xl font-black">{formatNumber(sameSpecialty.length)}</div>
          <div className="mt-1 text-[10px] text-ink-500">تقارير من نفس التخصص داخل مساحة العمل الحالية</div>
        </div>
        <div className="rounded-2xl border border-ink-200 bg-white p-4">
          <div className="flex items-center gap-2 text-[10px] text-ink-500"><Database size={14}/> التخصص</div>
          <div className="mt-2 text-xl font-black">{({sales:'المبيعات',purchases:'المشتريات',inventory:'المخزون',receivables:'الذمم والتحصيل',profitability:'الربحية',payments:'السيولة والمدفوعات'} as Record<string,string>)[report.specialty ?? ''] ?? 'عام'}</div>
          <div className="mt-1 text-[10px] text-ink-500">التشابه داخل مساحة العمل لا يُعرض كمقارنة خارجية</div>
        </div>
      </section>

      <section className="rounded-[18px] border border-warning-200 bg-warning-50 p-5">
        <h2 className="text-lg font-black text-warning-950">لماذا لا توجد مقارنة الآن؟</h2>
        <p className="mt-2 text-sm leading-7 text-warning-900">
          لا توجد حاليًا عينة مقارنة موثوقة تسمح بمقارنة هذا التقرير مع أعمال أخرى وفق نفس التعريفات والفترات وجودة البيانات.
          لذلك لا يتم اختلاق متوسط أو ترتيب أو نسبة تفوق. ستبقى الحالة: العينة غير كافية حتى تتوفر عينة مقارنة معزولة ومطابقة للسياسة.
        </p>
      </section>

      <section className="rounded-[18px] border border-ink-200 bg-white p-5 shadow-sm">
        <div className="text-[9px] font-black tracking-[.12em] text-primary-700">جاهزية المقارنة</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {[
            ['تعريف المقياس', 'يجب أن يكون التعريف الكانوني نفسه لكل عضو في Cohort.'],
            ['الفترة', 'يجب أن تكون الفترات الزمنية قابلة للمقارنة.'],
            ['الحقيقة والدليل', 'لا يدخل المصدر غير الموثوق إلى نتيجة Benchmark موثقة.'],
            ['العينة', 'العينة الصغيرة تبقى غير كافية ولا تنتج ترتيبًا.'],
          ].map(([title, detail]) => <div key={title} className="rounded-xl bg-ink-50 p-4"><div className="text-xs font-black text-ink-900">{title}</div><div className="mt-1 text-[10px] leading-5 text-ink-600">{detail}</div></div>)}
        </div>
      </section>
    </div>
  );
}
