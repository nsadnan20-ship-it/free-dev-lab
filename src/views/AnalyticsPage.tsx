import { useEffect, useState, useCallback } from 'react';
import { Link } from '@/lib/router-compat';
import { ArrowUpLeft, Calendar, ChartNoAxesCombined, CircleAlert, Package, ShieldCheck, Users, WalletCards } from 'lucide-react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, PageHeader, LoadingState, ErrorState } from '@/components/ui/States';
import { DataTable } from '@/components/ui/DataTable';
import { SimpleBarChart } from '@/components/ui/Charts';
import { fetchRFMSnapshot, fetchABCSnapshot, fetchAgingSnapshot, type RFMSnapshotRow, type ABCSnapshotRow, type AgingSnapshotRow } from '@/lib/dashboard-canonical';
import { formatCurrency, formatNumber } from '@/lib/format';

const analyticsCards = [
  { path: '/analytics/rfm', title: 'تحليل RFM للعملاء', desc: 'تصنيف العملاء حسب الحداثة والتكرار والقيمة', icon: Users, color: 'primary' },
  { path: '/analytics/abc', title: 'تحليل ABC للمنتجات', desc: 'تصنيف المنتجات حسب الأهمية والمساهمة', icon: Package, color: 'accent' },
  { path: '/analytics/aging', title: 'تحليل أعمار الذمم', desc: 'توزيع الفواتير حسب عمر الاستحقاق', icon: Calendar, color: 'warning' },
  { path: '/analytics/liquidity', title: 'السيولة والتعرض النقدي', desc: 'قراءة الذمم والمستحقات والتحصيل دون اختلاق رصيد نقدي', icon: WalletCards, color: 'primary' },
];


const analyticsIconClasses: Record<string, string> = {
  primary: 'bg-primary-50 text-primary-700',
  accent: 'bg-accent-50 text-accent-700',
  warning: 'bg-warning-50 text-warning-700',
};

function AnalyticsActionBar() {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-ink-200 bg-white p-3 shadow-card">
      <div className="hidden items-center gap-2 text-[10px] font-black text-ink-500 sm:flex sm:mr-auto">
        <ShieldCheck size={14} className="text-primary-700" /> التحليل يقرأ المؤشرات الكانونية ولا يصنع أرقامًا بديلة
      </div>
      <Link to="/decision-experience" className="btn-secondary text-[10px]">تجربة القرار <ArrowUpLeft size={13} /></Link>
      <Link to="/trust" className="btn-ghost text-[10px]">فحص الثقة</Link>
      <Link to="/reports" className="btn-ghost text-[10px]">مركز التقارير</Link>
    </div>
  );
}

function AnalyticsTruthBanner({ title, message, warning = false }: { title: string; message: string; warning?: boolean }) {
  return (
    <div className={warning ? "rounded-2xl border border-warning-200 bg-warning-50/65 p-4 text-warning-900" : "rounded-2xl border border-ink-200 bg-white p-4 text-ink-700"}>
      <div className="flex items-start gap-3">
        <div className={warning ? "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning-100 text-warning-700" : "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-700"}>
          {warning ? <CircleAlert size={16} /> : <ShieldCheck size={16} />}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-black">{title}</div>
          <p className="mt-1 text-[10px] leading-5 opacity-80">{message}</p>
        </div>
      </div>
    </div>
  );
}
function AnalyticsStatusStrip({
  status,
  rows,
  unknownRows,
  label,
}: {
  status: string;
  rows: number;
  unknownRows: number | null;
  label: string;
}) {
  const insufficient = status === 'INSUFFICIENT_DATA' || status === 'NO_DATA';
  return (
    <section className="ag-decision-strip" aria-label={'حالة ' + label}>
      <div className="ag-decision-cell"><span className="ag-decision-label">حالة التحليل</span><span className="ag-decision-value">{insufficient ? 'بيانات غير كافية' : 'محسوب من المصدر'}</span></div>
      <div className="ag-decision-cell"><span className="ag-decision-label">السجلات المستخدمة</span><span className="ag-decision-value">{formatNumber(rows)}</span></div>
      <div className="ag-decision-cell"><span className="ag-decision-label">خارج الحساب</span><span className="ag-decision-value">{unknownRows == null ? 'غير متاح' : formatNumber(unknownRows)}</span></div>
      <div className="ag-decision-cell"><span className="ag-decision-label">القاعدة</span><span className="ag-decision-value">{insufficient ? 'لا يتم تصنيع قيم بديلة' : 'النتيجة مرتبطة بالمصدر الكانوني'}</span></div>
      <div className="ag-decision-cell"><span className="ag-decision-label">الإجراء</span><span className="ag-decision-value">{insufficient ? 'مراجعة المصدر / الثقة' : 'انقل النتيجة إلى القرار'}</span></div>
    </section>
  );
}



export function AnalyticsCenterPage() {
  return (
    <div dir="rtl" className="ag-analytics-surface space-y-5 animate-fade-in pb-10">
      <PageHeader title="مركز التحليلات" subtitle="مساحة واحدة لاكتشاف الأنماط والاتجاهات ثم نقل النتيجة إلى سياق القرار والدليل." />
      <section className="ag-command-hero overflow-hidden rounded-[1.75rem] p-6 text-white lg:p-8">
        <div className="grid gap-6 xl:grid-cols-[1.3fr_.7fr] xl:items-end">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black tracking-[.14em] text-primary-200"><ChartNoAxesCombined size={14} /> BUSINESS ANALYTICS</div>
            <h2 className="mt-2 text-2xl font-black leading-tight lg:text-3xl">من النمط إلى السؤال التجاري، دون قفزات غير مثبتة.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">ابدأ بالتحليل الذي يخدم قرارًا واضحًا، ثم افتح التفاصيل أو الدليل عند الحاجة. عندما تكون البيانات ناقصة تبقى الحالة ظاهرة بدل تحويل النقص إلى يقين شكلي.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3"><div className="text-[9px] font-black text-slate-400">01</div><div className="mt-1 text-xs font-black">اكتشاف</div><div className="mt-1 text-[10px] text-slate-300">النمط أو التعرض</div></div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3"><div className="text-[9px] font-black text-slate-400">02</div><div className="mt-1 text-xs font-black">تفسير</div><div className="mt-1 text-[10px] text-slate-300">السياق والسبب</div></div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3"><div className="text-[9px] font-black text-slate-400">03</div><div className="mt-1 text-xs font-black">انتقال</div><div className="mt-1 text-[10px] text-slate-300">قرار أو دليل</div></div>
          </div>
        </div>
      </section>
      <AnalyticsActionBar />
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {analyticsCards.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.path} to={item.path} className="group min-w-0">
              <Card hover className="h-full transition-transform duration-200 group-hover:-translate-y-0.5">
                <CardBody className="h-full">
                  <div className="flex items-start justify-between gap-3">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${analyticsIconClasses[item.color] ?? analyticsIconClasses.primary}`}><Icon size={20} /></div>
                    <span className="rounded-full border border-ink-100 bg-ink-50 px-2 py-1 text-[8px] font-black text-ink-500">{item.path === '/analytics/liquidity' ? 'التعرض التجاري' : item.path === '/analytics/aging' ? 'التحصيل' : item.path === '/analytics/rfm' ? 'سلوك العملاء' : 'تركيز القيمة'}</span>
                  </div>
                  <h3 className="mt-4 text-sm font-black text-ink-900">{item.title}</h3>
                  <p className="mt-1 text-[10px] leading-5 text-ink-500">{item.desc}</p>
                  <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3 text-[9px] font-black text-primary-700"><span>فتح التحليل</span><ArrowUpLeft size={13} /></div>
                </CardBody>
              </Card>
            </Link>
          );
        })}
      </section>
      <AnalyticsTruthBanner title="قاعدة الاستخدام" message="التحليل طبقة تفسير فوق الحقيقة الكانونية. لا يتم تعويض نقص البيانات بقيم افتراضية، وكل انتقال إلى قرار أو تقرير يظل مرتبطًا بالسياق المتاح." />
    </div>
  );
}

const RFM_VARIANTS: Record<string, 'success' | 'primary' | 'accent' | 'warning' | 'danger' | 'neutral'> = { 'أبطال': 'success', 'مخلصون': 'primary', 'واعدون': 'accent', 'معرضون للخطر': 'warning', 'خاملون': 'danger' };

export function RFMAnalysisPage() {
  const [data,setData]=useState<RFMSnapshotRow[]>([]); const [status,setStatus]=useState<'INSUFFICIENT_DATA'|'CALCULATED'>('INSUFFICIENT_DATA'); const [unknownRows,setUnknownRows]=useState<number|null>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState<string|null>(null);
  const load=useCallback(async()=>{try{setLoading(true);setError(null);const snapshot=await fetchRFMSnapshot(500);setData(snapshot.rows);setStatus(snapshot.status);setUnknownRows(snapshot.unknownRows);}catch(e:unknown){setError(e instanceof Error?e.message:'فشل تحميل تحليل RFM');}finally{setLoading(false);}},[]);
  useEffect(()=>{void load();},[load]); if(loading)return <LoadingState/>; if(error)return <ErrorState message={error} onRetry={load}/>;
  const counts=new Map<string,number>(); data.forEach(r=>counts.set(r.rfm_segment,(counts.get(r.rfm_segment)||0)+1)); const segmentData=Array.from(counts.entries()).map(([name,value])=>({name,value}));
  return <div className="ag-analytics-surface space-y-6 animate-fade-in"><PageHeader title="تحليل RFM" subtitle="تصنيف العملاء من المصدر التحليلي المعتمد، دون تحميل سجل المعاملات كاملًا إلى المتصفح"/>{status==='INSUFFICIENT_DATA'&&<AnalyticsTruthBanner warning title="البيانات غير كافية لإصدار RFM كامل" message={`السجلات غير الصالحة أو الناقصة: ${unknownRows==null?'غير متاح':formatNumber(unknownRows)}. لا يتم تصنيع درجات بديلة.`}/>}<AnalyticsActionBar/><AnalyticsStatusStrip status={status} rows={data.length} unknownRows={unknownRows} label="تحليل RFM"/><div className="grid grid-cols-1 lg:grid-cols-3 gap-4"><Card><CardHeader title="توزيع الشرائح"/><CardBody>{segmentData.length?<SimpleBarChart data={segmentData} dataKey="value" nameKey="name" height={250}/>:<EmptyState title="لا توجد شرائح قابلة للاعتماد" message="راجع المصدر وجودة البيانات قبل استخدام RFM في قرار، أو ابدأ باستيراد مصدر جديد." action={<Link to="/import" className="btn-primary text-[11px]">إضافة مصدر</Link>}/>}</CardBody></Card><Card className="lg:col-span-2"><CardHeader title="تفاصيل العملاء"/><DataTable columns={[{key:'customer_name',label:'العميل'},{key:'recency',label:'الحداثة (يوم)',align:'center',render:(r:RFMSnapshotRow)=>formatNumber(r.recency)},{key:'frequency',label:'التكرار',align:'center',render:(r:RFMSnapshotRow)=>formatNumber(r.frequency)},{key:'monetary',label:'القيمة',align:'right',render:(r:RFMSnapshotRow)=>formatCurrency(r.monetary)},{key:'rfm_segment',label:'الشريحة',align:'center',render:(r:RFMSnapshotRow)=><Badge variant={RFM_VARIANTS[r.rfm_segment]??'neutral'}>{r.rfm_segment}</Badge>}] } data={data.slice(0,20)}/></Card></div></div>;
}

export function ABCAnalysisPage(){
  const[data,setData]=useState<ABCSnapshotRow[]>([]); const [status,setStatus]=useState<'INSUFFICIENT_DATA'|'CALCULATED'>('INSUFFICIENT_DATA'); const [unknownRows,setUnknownRows]=useState<number|null>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState<string|null>(null);
  const load=useCallback(async()=>{try{setLoading(true);setError(null);const snapshot=await fetchABCSnapshot(500);setData(snapshot.rows);setStatus(snapshot.status);setUnknownRows(snapshot.unknownRows);}catch(e:unknown){setError(e instanceof Error?e.message:'فشل تحميل تحليل ABC');}finally{setLoading(false);}},[]);
  useEffect(()=>{void load();},[load]); if(loading)return <LoadingState/>; if(error)return <ErrorState message={error} onRetry={load}/>;
  const counts=new Map<string,number>(); data.forEach(r=>{if(r.class)counts.set(r.class,(counts.get(r.class)||0)+1);});
  return <div className="ag-analytics-surface space-y-6 animate-fade-in"><PageHeader title="تحليل ABC" subtitle="تصنيف المنتجات حسب مساهمة الإيرادات من المصدر المعتمد"/>{status==='INSUFFICIENT_DATA'&&<AnalyticsTruthBanner warning title="التصنيف غير مكتمل" message={`السجلات الناقصة: ${unknownRows==null?'غير متاح':formatNumber(unknownRows)}. حدود الفئات يحددها المصدر التحليلي.`}/>}<AnalyticsActionBar/><AnalyticsStatusStrip status={status} rows={data.length} unknownRows={unknownRows} label="تحليل ABC"/><div className="grid grid-cols-3 gap-4">{['A','B','C'].map(c=><Card key={c}><CardBody><div className="text-xs text-ink-500 mb-1">الفئة {c}</div><div className="text-xl font-bold text-ink-900">{counts.get(c)??'—'} منتج</div><div className="text-xs text-ink-400 mt-1">حدود الفئات يحسبها المصدر التحليلي نفسه</div></CardBody></Card>)}</div><Card><CardHeader title="تصنيف المنتجات"/><DataTable columns={[{key:'product_name',label:'المنتج'},{key:'revenue',label:'الإيرادات',align:'right',render:(r:ABCSnapshotRow)=>formatCurrency(r.revenue)},{key:'cumulative_pct',label:'النسبة التراكمية',align:'right',render:(r:ABCSnapshotRow)=>r.cumulative_pct==null?'غير متاح':`${r.cumulative_pct.toFixed(1)}%`},{key:'class',label:'الفئة',align:'center',render:(r:ABCSnapshotRow)=><Badge variant={r.class==='A'?'success':r.class==='B'?'primary':'neutral'}>{r.class??'غير معروف'}</Badge>}] } data={data.slice(0,30)}/></Card></div>;
}

export function AgingAnalysisPage(){
  const[buckets,setBuckets]=useState<AgingSnapshotRow[]>([]); const [status,setStatus]=useState<'NO_DATA'|'INSUFFICIENT_DATA'|'CALCULATED'>('NO_DATA'); const [unknownRows,setUnknownRows]=useState<number|null>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState<string|null>(null);
  const load=useCallback(async()=>{try{setLoading(true);setError(null);const snapshot=await fetchAgingSnapshot();setBuckets(snapshot.rows);setStatus(snapshot.status);setUnknownRows(snapshot.unknownRows);}catch(e:unknown){setError(e instanceof Error?e.message:'فشل تحميل تحليل أعمار الذمم');}finally{setLoading(false);}},[]);
  useEffect(()=>{void load();},[load]); if(loading)return <LoadingState/>; if(error)return <ErrorState message={error} onRetry={load}/>;
  return <div className="ag-analytics-surface space-y-6 animate-fade-in"><PageHeader title="تحليل أعمار الذمم" subtitle="توزيع الذمم من المصدر المعتمد، مع حفظ حالة البيانات الناقصة"/>{status==='INSUFFICIENT_DATA'&&<AnalyticsTruthBanner warning title="بعض السجلات لا تكفي لحساب العمر بثقة" message={`السجلات غير المكتملة: ${unknownRows==null?'غير متاح':formatNumber(unknownRows)}. تبقى خارج الحساب بدل تحويلها إلى صفر.`}/>}<AnalyticsActionBar/><AnalyticsStatusStrip status={status} rows={buckets.reduce((sum, row) => sum + row.count, 0)} unknownRows={unknownRows} label="تحليل أعمار الذمم"/><Card><CardHeader title="توزيع الأعمار"/><CardBody>{buckets.length?<SimpleBarChart data={buckets} dataKey="amount" nameKey="name"/>:<EmptyState title="لا توجد ذمم قابلة للحساب" message="لا يمكن إصدار توزيع أعمار دون بيانات استحقاق كافية؛ راجع المصدر أو جودة البيانات أولًا." action={<Link to="/trust" className="btn-secondary text-[11px]">فحص الثقة</Link>}/>}</CardBody></Card><Card><CardHeader title="التفاصيل"/><DataTable columns={[{key:'name',label:'الفئة (يوم)'},{key:'amount',label:'المبلغ',align:'right',render:(r:AgingSnapshotRow)=>formatCurrency(r.amount)},{key:'count',label:'عدد الفواتير',align:'center',render:(r:AgingSnapshotRow)=>formatNumber(r.count)}]} data={buckets}/></Card></div>;
}
