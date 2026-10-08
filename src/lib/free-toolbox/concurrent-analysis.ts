export interface AnalysisRevision{tenantId:string;key:string;revision:number}
export interface AnalysisExecution<T>{revision:AnalysisRevision;compute:()=>Promise<T>}
export interface AnalysisOutcome<T>{accepted:boolean;value?:T;reason:'accepted'|'superseded'|'coalesced'}
interface InFlight<T>{revision:number;promise:Promise<T>}
export class ConcurrentAnalysisRegistry<T>{private latest=new Map<string,number>();private inflight=new Map<string,InFlight<T>>();private token(r:AnalysisRevision){return `${r.tenantId}:${r.key}`}
 async run(execution:AnalysisExecution<T>):Promise<AnalysisOutcome<T>>{const k=this.token(execution.revision);const requested=execution.revision.revision;const current=this.latest.get(k)??0;if(requested<current)return{accepted:false,reason:'superseded'};const existing=this.inflight.get(k);if(existing&&existing.revision===requested)return{accepted:true,value:await existing.promise,reason:'coalesced'};this.latest.set(k,requested);const promise=execution.compute();this.inflight.set(k,{revision:requested,promise});try{const value=await promise;const latest=this.latest.get(k)??0;if(latest!==requested)return{accepted:false,reason:'superseded'};return{accepted:true,value,reason:'accepted'}}finally{const active=this.inflight.get(k);if(active?.promise===promise)this.inflight.delete(k)}}
 invalidate(tenantId:string,key:string,revision:number){const k=`${tenantId}:${key}`;this.latest.set(k,Math.max(revision,this.latest.get(k)??0))}
 clear(){this.latest.clear();this.inflight.clear()}}
