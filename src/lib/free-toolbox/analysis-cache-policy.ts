export type CacheFreshness='fresh'|'stale'|'expired'
export interface CacheMetadata{createdAt:number;updatedAt?:number;ttlMs:number;version:string}
export interface CachePolicyResult{freshness:CacheFreshness;ageMs:number;usable:boolean;reason:string}
export function evaluateCacheFreshness(meta:CacheMetadata,now=Date.now(),staleFactor=2):CachePolicyResult{const age=Math.max(0,now-meta.createdAt);const ttl=Math.max(1,meta.ttlMs);if(age<=ttl)return{freshness:'fresh',ageMs:age,usable:true,reason:'cache entry is within freshness window'};if(age<=ttl*Math.max(1,staleFactor))return{freshness:'stale',ageMs:age,usable:false,reason:'cache entry is stale and should be refreshed before decision use'};return{freshness:'expired',ageMs:age,usable:false,reason:'cache entry is expired'}}
export function cacheVersionMatches(meta:CacheMetadata,expectedVersion:string):boolean{return Boolean(expectedVersion)&&meta.version===expectedVersion}
