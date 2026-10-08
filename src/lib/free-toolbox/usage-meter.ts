import type {TenantContext} from './tenant-guard';
export type UsageEvent='login'|'analysis'|'report'|'forecast'|'export'|'what_if'|'ai_question';
export interface UsageRecord{tenantId:string;event:UsageEvent;at:string;durationMs?:number;success?:boolean}
export interface UsageSummary{tenantId:string;total:number;activeDays:number;byEvent:Record<UsageEvent,number>;lastActiveAt:string|null}
const empty=():Record<UsageEvent,number>=>({login:0,analysis:0,report:0,forecast:0,export:0,what_if:0,ai_question:0});
export function recordUsage(ctx:TenantContext,event:UsageEvent,records:UsageRecord[],extra:Partial<UsageRecord>={}):UsageRecord[]{if(!ctx.tenantId)throw new Error('TENANT_CONTEXT_REQUIRED');return [...records,{tenantId:ctx.tenantId,event,at:new Date().toISOString(),...extra}]}
export function summarizeUsage(ctx:TenantContext,records:UsageRecord[]):UsageSummary{const own=records.filter(r=>r.tenantId===ctx.tenantId);const byEvent=empty();const days=new Set<string>();for(const r of own){byEvent[r.event]++;days.add(r.at.slice(0,10))}return{tenantId:ctx.tenantId,total:own.length,activeDays:days.size,byEvent,lastActiveAt:own.length?own.map(r=>r.at).sort().at(-1)??null:null}}
