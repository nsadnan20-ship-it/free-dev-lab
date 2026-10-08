export interface DrilldownNode{id:string;label:string;value:number|string;parentId?:string;sourceIds?:string[];formula?:string}
export interface DrilldownContext{entityId:string;title:string;rows:DrilldownNode[];explanation:string}
export function buildDrilldown(nodes:DrilldownNode[],rootId:string):DrilldownNode[]{const out:DrilldownNode[]=[];const walk=(id:string)=>{const n=nodes.find(x=>x.id===id);if(!n)return;out.push(n);for(const c of nodes.filter(x=>x.parentId===id))walk(c.id)};walk(rootId);return out}
export function sourceIdsFor(nodes:DrilldownNode[],rootId:string):string[]{return [...new Set(buildDrilldown(nodes,rootId).flatMap(n=>n.sourceIds??[]))]}
export function createDrilldownContext(nodes:DrilldownNode[],rootId:string,title:string):DrilldownContext{const rows=buildDrilldown(nodes,rootId);return{entityId:rootId,title,rows,explanation:'تفصيل هرمي للقيمة مع الاحتفاظ بمصادر البيانات والمعادلات المستخدمة.'}}
