export type ReportKind='sales'|'purchases'|'inventory'|'customers'|'suppliers'|'items'|'receivables'|'payables'|'movement'|'unknown';
export interface ReportProfile {id:string;kind:ReportKind;requiredAny:string[][];signals:string[];}
export interface Classification {kind:ReportKind;confidence:number;profileId?:string;matchedHeaders:string[];evidence:string[];}
const profiles:ReportProfile[]=[
{id:'sales-v1',kind:'sales',requiredAny:[['sku'],['quantity']],signals:['invoice','customer_id','price','total']},
{id:'purchases-v1',kind:'purchases',requiredAny:[['sku'],['quantity']],signals:['supplier_id','cost','purchase']},
{id:'inventory-v1',kind:'inventory',requiredAny:[['sku'],['quantity']],signals:['warehouse','stock','opening','closing']},
{id:'customers-v1',kind:'customers',requiredAny:[['customer_id'],['customer_name']],signals:['phone','address','balance']},
{id:'suppliers-v1',kind:'suppliers',requiredAny:[['supplier_id'],['supplier_name']],signals:['phone','balance','supplier']},
{id:'items-v1',kind:'items',requiredAny:[['sku'],['item_name']],signals:['unit','category','barcode']},
{id:'receivables-v1',kind:'receivables',requiredAny:[['customer_id'],['balance']],signals:['debit','credit','due']},
{id:'payables-v1',kind:'payables',requiredAny:[['supplier_id'],['balance']],signals:['debit','credit','due']},
{id:'movement-v1',kind:'movement',requiredAny:[['sku'],['quantity']],signals:['date','transaction','movement','warehouse']}
];
export function classifyReport(headers:string[]):Classification {const set=new Set(headers);let best:{p:ReportProfile;score:number;matched:string[]}|undefined;for(const p of profiles){const required=p.requiredAny.filter(group=>group.some(h=>set.has(h))).length; if(required<p.requiredAny.length)continue; const matched=p.signals.filter(s=>set.has(s)); const score=required*0.35+Math.min(1,matched.length/4)*0.65; if(!best||score>best.score)best={p,score,matched};}if(!best)return {kind:'unknown',confidence:0,matchedHeaders:[],evidence:['no report profile reached the minimum required header contract']};return {kind:best.p.kind,confidence:Math.min(.99,best.score),profileId:best.p.id,matchedHeaders:best.matched,evidence:[`profile=${best.p.id}`,`signal_matches=${best.matched.length}`]};}
export function listReportProfiles(){return profiles.map(p=>({...p}));}
