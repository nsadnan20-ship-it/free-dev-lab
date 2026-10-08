export type AccountingSource='onyx-pro'|'integrated'|'roqash'|'custom'|'unknown';
export interface SourceProfile {id:string;source:AccountingSource;reportKind:string;headerAliases:Record<string,string[]>;priority:number;}
export interface SourceMatch {profile:SourceProfile;score:number;matched:number;reviewRequired:boolean;}
const profiles:SourceProfile[]=[
{id:'onyx-pro-generic',source:'onyx-pro',reportKind:'generic',headerAliases:{sku:['رقم الصنف','كود الصنف','item code','sku'],quantity:['الكمية','quantity','qty'],customer_id:['رقم العميل','customer number'],supplier_id:['رقم المورد','supplier number'],warehouse:['المخزن','warehouse']},priority:10},
{id:'integrated-generic',source:'integrated',reportKind:'generic',headerAliases:{sku:['رقم الصنف','كود المادة','item code'],quantity:['الكمية','الكمية الحالية','quantity'],customer_id:['رقم العميل','العميل']},priority:8},
{id:'roqash-generic',source:'roqash',reportKind:'generic',headerAliases:{sku:['رقم الصنف','كود الصنف'],quantity:['الكمية','الرصيد','quantity'],customer_id:['رقم العميل','رقم الزبون']},priority:7}
];
const n=(s:string)=>s.toLowerCase().replace(/[\s_\-./\\]+/g,' ').trim();
export function matchAccountingSource(headers:string[]):SourceMatch[]{const hs=headers.map(n);return profiles.map(p=>{let matched=0;for(const aliases of Object.values(p.headerAliases))if(aliases.some(a=>hs.includes(n(a))))matched++;const total=Object.keys(p.headerAliases).length;const score=total?matched/total:0;return {profile:p,score,matched,reviewRequired:score<.8};}).filter(x=>x.matched>0).sort((a,b)=>b.score-a.score||b.profile.priority-a.profile.priority);}
export function getAccountingSourceProfiles(){return profiles.map(p=>({...p,headerAliases:Object.fromEntries(Object.entries(p.headerAliases).map(([k,v])=>[k,[...v]]))}));}
