export interface EvidenceRef{sourceId:string;sourceDocumentId?:string;sourceHash?:string;label:string;location?:string;value?:number|string;retrievedAt?:string}
export interface LineageNode{id:string;type:'source'|'transform'|'metric'|'insight'|'decision';label:string;formula?:string;evidence?:EvidenceRef[]}
export interface LineageGraph{nodes:LineageNode[];edges:{from:string;to:string;label?:string}[]}
export function traceLineage(graph:LineageGraph,targetId:string):LineageNode[]{const seen=new Set<string>();const walk=(id:string)=>{if(seen.has(id))return;seen.add(id);for(const e of graph.edges.filter(x=>x.to===id))walk(e.from)};walk(targetId);return graph.nodes.filter(n=>seen.has(n.id));}
export function evidenceFor(graph:LineageGraph,targetId:string):EvidenceRef[]{return traceLineage(graph,targetId).flatMap(n=>n.evidence??[]);}
