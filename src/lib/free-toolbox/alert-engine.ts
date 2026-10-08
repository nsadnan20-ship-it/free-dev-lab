export type AlertSeverity='info'|'warning'|'critical';
export interface AlertRule{key:string;severity:AlertSeverity;threshold:number;message:string;domain:string;}
export interface AlertInput{key:string;value:number;label?:string;context?:Record<string,unknown>}
export interface Alert{key:string;severity:AlertSeverity;message:string;domain:string;value:number;triggeredAt:string;context?:Record<string,unknown>}
export function evaluateAlerts(rules:AlertRule[],inputs:AlertInput[]):Alert[]{const byKey=new Map(inputs.map(x=>[x.key,x]));const rank={critical:3,warning:2,info:1};return rules.flatMap(r=>{const x=byKey.get(r.key);if(!x||x.value<r.threshold)return[];return[{key:r.key,severity:r.severity,message:r.message,domain:r.domain,value:x.value,triggeredAt:new Date().toISOString(),context:x.context}];}).sort((a,b)=>rank[b.severity]-rank[a.severity]);}
