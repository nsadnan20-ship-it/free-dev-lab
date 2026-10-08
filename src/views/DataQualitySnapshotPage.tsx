import { useCallback, useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowUpLeft, Upload } from 'lucide-react';
import { Users, Package, Warehouse, CheckCircle2, AlertTriangle, Database, ShieldCheck, BarChart3, RefreshCw } from 'lucide-react';
import { Link } from '@/lib/router-compat';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { PageHeader, LoadingState, ErrorState, EmptyState } from '@/components/ui/States';
import { DataTable } from '@/components/ui/DataTable';
import { fetchDataQualitySnapshot, type QualityIssue, type EntityQuality } from '@/lib/data-quality-snapshot';
import { formatNumber } from '@/lib/format';

function scoreColor(score: number): string { if (score >= 90) return 'text-success-600'; if (score >= 70) return 'text-warning-600'; return 'text-danger-600'; }
function scoreBg(score: number): string { if (score >= 90) return 'bg-success-500'; if (score >= 70) return 'bg-warning-500'; return 'bg-danger-500'; }
function issueBadge(severity: QualityIssue['severity']): string { return severity === 'critical' ? 'bg-danger-50 text-danger-700' : severity === 'warning' ? 'bg-warning-50 text-warning-700' : 'bg-ink-100 text-ink-600'; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'فشل تحميل بيانات الجودة'; }

const iconMap: Record<EntityQuality['icon'], LucideIcon> = { users: Users, package: Package, receipt: BarChart3, warehouse: Warehouse };

export function DataQualitySnapshotPage() {
  const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState<string | null>(null); const [issues, setIssues] = useState<QualityIssue[]>([]); const [entities, setEntities] = useState<EntityQuality[]>([]); const [overallScore, setOverallScore] = useState(0); const [snapshotStatus, setSnapshotStatus] = useState<'OK'|'EMPTY'>('EMPTY');
  const load = useCallback(async (silent = false) => { try { if (silent) setRefreshing(true); else setLoading(true); setError(null); const snapshot = await fetchDataQualitySnapshot(); setSnapshotStatus(snapshot.status); setEntities(snapshot.entities); setIssues(snapshot.issues.filter(i => i.count > 0).sort((a,b) => b.count-a.count)); const totalRecords = snapshot.entities.reduce((s,e)=>s+e.total,0); const totalIssues = snapshot.entities.reduce((s,e)=>s+e.issues,0); setOverallScore(totalRecords === 0 ? 0 : Math.max(0, Math.min(100, Math.round(((totalRecords-totalIssues)/totalRecords)*100)))); } catch (e: unknown) { setError(errorMessage(e)); } finally { setLoading(false); setRefreshing(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  if (loading) return <LoadingState message="جارٍ فحص جودة البيانات..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  const totalRecords = entities.reduce((s,e)=>s+e.total,0); const totalIssues = entities.reduce((s,e)=>s+e.issues,0);
  const criticalIssueTotal = issues.filter(i => i.severity === 'critical').reduce((sum, issue) => sum + issue.count, 0);
  const nextAction = snapshotStatus === 'EMPTY'
    ? { label: 'استيراد مصدر', description: 'لا توجد سجلات تجارية مثبتة بعد؛ ابدأ بالمصدر الموحد حتى تتكوّن لقطة جودة قابلة للقراءة.', to: '/import' }
    : criticalIssueTotal > 0
      ? { label: 'أغلق المشكلات الحرجة', description: `هناك ${formatNumber(criticalIssueTotal)} حالة حرجة قد تؤثر في التحليل والقرار، لذا يجب معالجة الثغرات قبل الاعتماد.`, to: '/trust' }
      : totalIssues > 0
        ? { label: 'راجع مشكلات الجودة', description: `توجد ${formatNumber(totalIssues)} مشكلة مرصودة في اللقطة الحالية؛ راجع مصدرها وحدود تأثيرها قبل استخدام المخرجات.`, to: '/trust' }
        : { label: 'انتقل للتحليل', description: 'لا توجد مشكلات جودة مرصودة في اللقطة الحالية؛ يمكن الانتقال إلى طبقة التحليل مع بقاء الدليل هو المرجع.', to: '/analytics' };
  return <div dir="rtl" className="ag-data-quality-surface space-y-6 animate-fade-in"><PageHeader title="جودة البيانات" subtitle="فحص مركزي للحالات التي قد تؤثر في التحليل والقرار، مع إبقاء حالة النقص ظاهرة بدل تحويلها إلى يقين." actions={<><Link to="/import" className="btn-secondary text-[10px]"><Upload size={13}/> استيراد مصدر</Link><span className={snapshotStatus === 'EMPTY' ? 'badge-warning badge' : 'badge-success badge'}>{snapshotStatus === 'EMPTY' ? 'EMPTY — لا توجد قاعدة تجارية' : 'لقطة جودة متاحة'}</span><button type="button" onClick={() => void load(true)} disabled={refreshing} className="btn-primary text-[10px]"><RefreshCw size={13} className={refreshing ? 'animate-spin' : ''}/> تحديث</button></>} />
    <section className="rounded-2xl border border-primary-200 bg-primary-50/55 p-4" aria-label="قاعدة قراءة جودة البيانات"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-primary-700 ring-1 ring-inset ring-primary-100"><ShieldCheck size={17}/></div><div><div className="text-xs font-black text-ink-900">قاعدة القراءة</div><p className="mt-1 text-[10px] leading-5 text-ink-500">الدرجة أداة تشخيص مشتقة من السجلات والمشكلات المرصودة في اللقطة الحالية، وليست ثقة مطلقة ولا بديلًا عن الدليل.</p></div></div><Link to="/trust" className="btn-ghost shrink-0 text-[10px]">فحص الثقة والأدلة <ArrowUpLeft size={13}/></Link></div></section><section className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]" aria-label="قرار جودة البيانات">
      <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-black text-ink-800"><ShieldCheck size={16} className={criticalIssueTotal > 0 ? 'text-warning-600' : 'text-primary-600'}/> القرار التالي مبني على اللقطة الحالية</div>
        <div className="mt-2 text-lg font-black text-ink-950">{nextAction.label}</div>
        <p className="mt-2 text-xs leading-6 text-ink-500">{nextAction.description}</p>
      </div>
      <Link to={nextAction.to} className="rounded-2xl border border-primary-200 bg-primary-50 p-5 text-right transition hover:border-primary-300 hover:bg-primary-100/70">
        <div className="text-[10px] font-black uppercase tracking-wider text-primary-700">NEXT ACTION</div>
        <div className="mt-2 text-sm font-black text-primary-950">{nextAction.label}</div>
        <div className="mt-1 text-[11px] leading-5 text-primary-900/70">انتقل مباشرة إلى المسار الذي يعالج حالة الجودة الحالية.</div>
      </Link>
    </section>
    <section className="ag-decision-strip" aria-label="ملخص جودة البيانات">
      <div className="ag-decision-cell"><span className="ag-decision-label">الحالة</span><span className="ag-decision-value">{snapshotStatus === 'EMPTY' ? 'EMPTY' : 'AVAILABLE'}</span></div>
      <div className="ag-decision-cell"><span className="ag-decision-label">السجلات</span><span className="ag-decision-value">{formatNumber(entities.reduce((s,e)=>s+e.total,0))}</span></div>
      <div className="ag-decision-cell"><span className="ag-decision-label">المشكلات</span><span className="ag-decision-value">{formatNumber(issues.reduce((s,i)=>s+i.count,0))}</span></div>
      <div className="ag-decision-cell"><span className="ag-decision-label">الدرجة</span><span className="ag-decision-value">{overallScore}%</span></div>
      <div className="ag-decision-cell"><span className="ag-decision-label">الخطوة التالية</span><span className="ag-decision-value">{nextAction.label}</span></div>
    </section>

    <Card className="overflow-hidden bg-gradient-to-br from-ink-50 to-white"><CardBody><div className="flex flex-col lg:flex-row items-center gap-6"><div className="relative w-32 h-32 flex-shrink-0"><svg className="w-full h-full -rotate-90" viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="10" className="text-ink-100" /><circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="10" className={overallScore>=90?'text-success-500':overallScore>=70?'text-warning-500':'text-danger-500'} strokeDasharray={`${(overallScore/100)*327} 327`} strokeLinecap="round" /></svg><div className="absolute inset-0 flex flex-col items-center justify-center"><span className={`text-3xl font-bold ${scoreColor(overallScore)}`}>{overallScore}%</span><span className="text-xs text-ink-400 mt-1">الدرجة الإجمالية</span></div></div><div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4 w-full"><div className="text-center p-3 rounded-lg bg-ink-50"><Database className="mx-auto text-primary-500 mb-1" size={20}/><div className="text-xl font-bold text-ink-900">{formatNumber(totalRecords)}</div><div className="text-xs text-ink-500">إجمالي السجلات</div></div><div className="text-center p-3 rounded-lg bg-ink-50"><CheckCircle2 className="mx-auto text-success-500 mb-1" size={20}/><div className="text-xl font-bold text-success-600">{formatNumber(Math.max(0,totalRecords-totalIssues))}</div><div className="text-xs text-ink-500">سجلات سليمة</div></div><div className="text-center p-3 rounded-lg bg-ink-50"><AlertTriangle className="mx-auto text-warning-500 mb-1" size={20}/><div className="text-xl font-bold text-warning-600">{formatNumber(totalIssues)}</div><div className="text-xs text-ink-500">مشاكل مكتشفة</div></div><div className="text-center p-3 rounded-lg bg-ink-50"><ShieldCheck className="mx-auto text-primary-500 mb-1" size={20}/><div className="text-xl font-bold text-ink-900">{entities.length}</div><div className="text-xs text-ink-500">كيانات مفحوصة</div></div></div></div></CardBody></Card>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{entities.map(e=>{const Icon=iconMap[e.icon];return <Card key={e.name}><CardBody><div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center"><Icon size={18}/></div><div><div className="font-semibold text-sm text-ink-800">{e.name}</div><div className="text-xs text-ink-400">{formatNumber(e.total)} سجل</div></div></div><div className="flex items-center justify-between mb-2"><span className="text-xs text-ink-500">الدرجة</span><span className={`text-lg font-bold ${scoreColor(e.score)}`}>{e.score}%</span></div><div className="h-2 bg-ink-100 rounded-full overflow-hidden"><div className={`h-full ${scoreBg(e.score)} rounded-full transition-all duration-500`} style={{width:`${Math.max(0,Math.min(100,e.score))}%`}}/></div>{e.issues>0?<div className="text-xs text-warning-600 mt-2">{formatNumber(e.issues)} مشكلة</div>:<div className="text-xs text-success-600 mt-2">لا توجد مشاكل</div>}</CardBody></Card>})}</div>
    <Card><CardHeader title="المشاكل المكتشفة" subtitle="تفاصيل المشاكل المحسوبة مركزيًا" />{issues.length===0?<CardBody><EmptyState icon={<CheckCircle2 size={32}/>} title="لا توجد مشاكل في جودة البيانات" message={totalRecords===0?'لا توجد بيانات تجارية بعد؛ النتيجة EMPTY وليست نجاح جودة بيانات.':'جميع السجلات سليمة ومكتملة'}/></CardBody>:<DataTable columns={[{key:'entity',label:'الكيان',render:(r:QualityIssue)=><span className="font-medium text-ink-800">{r.entity}</span>},{key:'field',label:'الحقل',render:(r:QualityIssue)=>r.field},{key:'issue',label:'المشكلة',render:(r:QualityIssue)=>r.issue},{key:'count',label:'العدد',align:'center',render:(r:QualityIssue)=><span className="font-semibold text-ink-800">{formatNumber(r.count)}</span>},{key:'severity',label:'الخطورة',align:'center',render:(r:QualityIssue)=><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${issueBadge(r.severity)}`}>{r.severity==='critical'?'حرجة':r.severity==='warning'?'تحذير':'معلومة'}</span>}]} data={issues} emptyMessage="لا توجد مشاكل"/>}</Card>
  </div>;
}
