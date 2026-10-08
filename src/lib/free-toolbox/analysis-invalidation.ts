export type AnalysisDependency='inventory'|'sales'|'demand'|'customer'|'alternative-group'|'forecast-config'|'pricing'
export interface AnalysisKey{tenantId:string;scope:string;period:string;version:string}
export interface InvalidationEvent{tenantId:string;dependency:AnalysisDependency;entityIds:string[];at:number}
export function invalidates(event:InvalidationEvent,key:AnalysisKey):boolean{if(event.tenantId!==key.tenantId)return false;if(event.dependency==='forecast-config')return true;if(!event.entityIds.length)return true;const scope=key.scope.toLowerCase();return event.entityIds.some(id=>scope.includes(id.toLowerCase()))}
export function invalidationReason(event:InvalidationEvent):string{return `${event.dependency} changed for tenant ${event.tenantId}; affected analysis scope requires refresh`}
