export interface KpiNode{key:string;label:string;value:number}
export interface KpiEdge{from:string;to:string;weight:number;relation:'drives'|'constrains'|'correlates'}
export interface KpiGraph{nodes:KpiNode[];edges:KpiEdge[]}
export function upstream(graph:KpiGraph,target:string){const seen=new Set<string>();const walk=(id:string)=>{for(const e of graph.edges.filter(x=>x.to===id)){if(!seen.has(e.from)){seen.add(e.from);walk(e.from);}}};walk(target);return graph.nodes.filter(n=>seen.has(n.key));}
export function downstream(graph:KpiGraph,source:string){const seen=new Set<string>();const walk=(id:string)=>{for(const e of graph.edges.filter(x=>x.from===id)){if(!seen.has(e.to)){seen.add(e.to);walk(e.to);}}};walk(source);return graph.nodes.filter(n=>seen.has(n.key));}
