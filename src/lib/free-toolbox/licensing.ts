export type Plan='trial'|'free'|'pro'|'expired';
export interface License{tenantId:string;plan:Plan;startedAt:string;trialDays:number;expiresAt?:string;activatedAt?:string}
export interface Entitlements{analytics:boolean;forecast:boolean;advancedReports:boolean;scheduledReports:boolean;exports:boolean;whatIf:boolean;aiAssistant:boolean}
export function trialLicense(tenantId:string,startedAt=new Date().toISOString(),trialDays=14):License{const end=new Date(startedAt);end.setUTCDate(end.getUTCDate()+trialDays);return{tenantId,plan:'trial',startedAt,trialDays,expiresAt:end.toISOString()}}
export function resolvePlan(l:License,now=new Date()):Plan{if(l.plan==='pro')return'pro';if(l.expiresAt&&now.getTime()>=new Date(l.expiresAt).getTime())return'expired';return l.plan}
export function entitlements(plan:Plan):Entitlements{return plan==='pro'||plan==='trial'?{analytics:true,forecast:true,advancedReports:true,scheduledReports:true,exports:true,whatIf:true,aiAssistant:true}:{analytics:true,forecast:false,advancedReports:false,scheduledReports:false,exports:false,whatIf:false,aiAssistant:false}}
export function assertFeature(plan:Plan,feature:keyof Entitlements):void{if(!entitlements(plan)[feature])throw new Error(`FEATURE_LOCKED:${feature}`)}
