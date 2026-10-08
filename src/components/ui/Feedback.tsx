import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export type FeedbackTone = 'success' | 'info' | 'danger';
export interface FeedbackPayload { id?: string; tone: FeedbackTone; title: string; message?: string; duration?: number; }

const EVENT='report-advisor:feedback';
export function notifyFeedback(payload:FeedbackPayload){ if(typeof window==='undefined') return; window.dispatchEvent(new CustomEvent<FeedbackPayload>(EVENT,{detail:payload})); }

function toneStyles(tone:FeedbackTone){
  if(tone==='success') return {icon:CheckCircle2,box:'border-success-200 bg-success-50',text:'text-success-800',iconText:'text-success-700'};
  if(tone==='danger') return {icon:AlertCircle,box:'border-danger-200 bg-danger-50',text:'text-danger-800',iconText:'text-danger-700'};
  return {icon:Info,box:'border-primary-200 bg-primary-50',text:'text-primary-900',iconText:'text-primary-700'};
}

export function FeedbackHost(){
 const [items,setItems]=useState<FeedbackPayload[]>([]);
 const makeId=useMemo(()=>()=>crypto.randomUUID?.()??String(Date.now()+Math.random()),[]);
 useEffect(()=>{
  const onFeedback=(event:Event)=>{
   const detail=(event as CustomEvent<FeedbackPayload>).detail;
   const item={...detail,id:detail.id??makeId(),duration:detail.duration??4200};
   setItems(current=>[...current.slice(-3),item]);
   window.setTimeout(()=>setItems(current=>current.filter(entry=>entry.id!==item.id)),item.duration);
  };
  window.addEventListener(EVENT,onFeedback);
  return()=>window.removeEventListener(EVENT,onFeedback);
 },[makeId]);
 return <div className="pointer-events-none fixed inset-x-0 top-3 z-[120] flex justify-center px-3 sm:inset-x-auto sm:right-3 sm:w-[380px] sm:justify-end sm:px-0" dir="rtl" aria-live="polite">
  <div className="flex w-full max-w-[430px] flex-col gap-2">
   {items.map(item=>{const styles=toneStyles(item.tone);const Icon=styles.icon;return <div key={item.id} className={'pointer-events-auto rounded-[12px] border px-3.5 py-3 shadow-elevated '+styles.box}><div className="flex items-start gap-2.5"><Icon size={17} className={'mt-0.5 shrink-0 '+styles.iconText}/><div className={'min-w-0 flex-1 '+styles.text}><div className="text-[12px] font-black">{item.title}</div>{item.message&&<div className="mt-1 text-[10px] leading-5 opacity-80">{item.message}</div>}</div><button type="button" className="rounded-[6px] p-1 opacity-60 hover:bg-white/70 hover:opacity-100" onClick={()=>setItems(current=>current.filter(entry=>entry.id!==item.id))} aria-label="إغلاق"><X size={14}/></button></div></div>})}
  </div>
 </div>;
}
