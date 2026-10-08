import { type ReactNode } from 'react';
import { Loader2, AlertTriangle, Inbox } from 'lucide-react';

export function userFacingError(message: string): string {
  const text = String(message ?? '').trim();
  const labels: Record<string, string> = {
    INVALID_REPORT_CONTEXT: 'تعذر تحديد سياق التقرير المطلوب. افتح التقرير من مركز التقارير ثم أعد المحاولة.',
    TENANT_REQUIRED: 'تعذر تحديد مساحة العمل الحالية. أعد تسجيل الدخول ثم حاول مرة أخرى.',
    AUTHENTICATED_USER_REQUIRED: 'يلزم تسجيل الدخول قبل تنفيذ هذا الإجراء.',
    SOURCE_PROPOSAL_EVIDENCE_REQUIRED: 'لا يمكن متابعة القرار قبل اكتمال الدليل المرتبط بالتقرير.',
    SMART_REPORT_CATALOG_ITEM_UNAVAILABLE: 'لا تتوفر هوية تقرير صالحة لهذا المصدر.',
    REPORT_QUERY_INVALID_SMART_REPORT_ID: 'معرّف التقرير غير صالح.',
  };
  if (labels[text]) return labels[text];
  const cleaned = text
    .replace(/(?:gate|valid|source|recommendation|decision|context|live)[-_][a-z0-9-]+/gi, '')
    .replace(/[a-f0-9]{8,}(?:-[a-f0-9]{4,}){2,}/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!cleaned || /^[A-Z0-9_ -]+$/.test(cleaned)) return 'تعذر تنفيذ العملية الحالية. راجع سياق التقرير وحالة الدليل ثم أعد المحاولة.';
  return cleaned;
}

export function Spinner({className=''}:{className?:string}){return <Loader2 className={'animate-spin '+className} size={17}/>}
export function LoadingState({message='جارٍ التحميل...'}:{message?:string}){return <div role="status" aria-live="polite" aria-busy="true" className="ag-state ag-state-loading flex min-h-[220px] flex-col items-center justify-center gap-3 p-7 text-center"><div className="ag-state-icon"><Spinner className="h-[18px] w-[18px]"/></div><div><div className="ag-state-title">جارٍ تجهيز المساحة</div><p className="ag-state-copy mt-1">{message}</p></div><div className="flex items-center gap-1.5" aria-hidden="true"><span className="h-1.5 w-1.5 rounded-full bg-primary-500"/><span className="h-1.5 w-1.5 rounded-full bg-primary-300"/><span className="h-1.5 w-1.5 rounded-full bg-ink-200"/></div></div>}
export function EmptyState({icon,title,message,action}:{icon?:ReactNode;title:string;message?:string;action?:ReactNode}){return <div role="status" aria-live="polite" className="ag-state ag-state-empty flex min-h-[190px] flex-col items-center justify-center gap-3 p-7 text-center">{icon??<Inbox size={22} className="text-ink-300"/>}<h3 className="text-[13px] font-bold text-ink-700">{title}</h3>{message&&<p className="max-w-sm text-[11px] leading-5 text-ink-400">{message}</p>}{action}</div>}
export function DataUnavailableState({title='البيانات غير متاحة بعد',message='لم تصل صورة بيانات موثوقة تكفي لعرض هذه المساحة. ابدأ من مصدر موحد أو راجع الثقة قبل المتابعة.',action}:{title?:string;message?:string;action?:ReactNode}){return <div className="ag-state ag-state-empty flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border border-warning-200 bg-warning-50/50 p-7 text-center"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-warning-100 text-warning-700"><Inbox size={18}/></div><h3 className="text-[13px] font-black text-ink-800">{title}</h3><p className="max-w-md text-[11px] leading-5 text-ink-500">{message}</p>{action}</div>}
export function ErrorState({message,onRetry}:{message:string;onRetry?:()=>void}){return <div role="alert" aria-live="assertive" className="ag-state ag-state-error flex min-h-[220px] flex-col items-center justify-center gap-3 p-7 text-center"><div className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-danger-50 text-danger-600"><AlertTriangle size={18}/></div><h3 className="text-[13px] font-bold text-ink-800">تعذر عرض هذه المساحة</h3><p className="max-w-md text-[11px] leading-5 text-ink-400">{userFacingError(message)}</p>{onRetry&&<button type="button" onClick={onRetry} className="btn-secondary mt-1" aria-label="إعادة تحميل هذه المساحة">إعادة المحاولة</button>}</div>}
export function PageHeader({title,subtitle,actions}:{title:string;subtitle?:string;actions?:ReactNode}){return <header className="ag-page-header mb-5 flex flex-col gap-4 rounded-[16px] border px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="ag-page-kicker"><span className="ag-page-kicker-dot"/>الأغبري · مساحة العمل</div><h1 className="mt-1.5 text-[24px] font-black tracking-tight text-ink-950">{title}</h1>{subtitle&&<p className="mt-1 max-w-3xl text-[11px] leading-5 text-ink-500">{subtitle}</p>}</div>{actions&&<div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}</header>}
export function SkeletonCard(){return <div className="card p-4"><div className="skeleton mb-3 h-3 w-24"/><div className="skeleton mb-2 h-7 w-28"/><div className="skeleton h-3 w-20"/></div>}