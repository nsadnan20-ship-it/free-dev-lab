import type { QueryPlan } from './queryPlanner';

export interface QueryResult<T>{rows:T[];fromCache:boolean;fingerprint:string;fetchedAt:string;expiresAt:string}
export interface QueryCacheEntry<T>{rows:T[];fetchedAt:number;expiresAt:number}
export interface QueryExecutorAdapter<T>{execute(plan:QueryPlan):Promise<T[]>}

export class QueryResultCache<T>{
  constructor(private readonly ttlMs=30_000,private readonly maxEntries=100){if(ttlMs<1)throw new Error('cache ttl must be positive');if(maxEntries<1)throw new Error('cache max entries must be positive')}
  private entries=new Map<string,QueryCacheEntry<T>>();
  get(key:string,now=Date.now()):T[]|undefined{const e=this.entries.get(key);if(!e)return undefined;if(e.expiresAt<=now){this.entries.delete(key);return undefined}return e.rows}
  set(key:string,rows:T[],now=Date.now()):void{if(this.entries.size>=this.maxEntries&&!this.entries.has(key)){const oldest=this.entries.keys().next().value;if(oldest)this.entries.delete(oldest)}this.entries.set(key,{rows:[...rows],fetchedAt:now,expiresAt:now+this.ttlMs})}
  invalidate(key?:string):void{if(key)this.entries.delete(key);else this.entries.clear()}
  size():number{return this.entries.size}
  get ttl():number{return this.ttlMs}
}

export class QueryExecutor<T>{
  private inflight=new Map<string,Promise<T[]>>();
  constructor(private readonly adapter:QueryExecutorAdapter<T>,private readonly cache=new QueryResultCache<T>()){}
  async execute(plan:QueryPlan,options:{forceRefresh?:boolean}={}):Promise<QueryResult<T>>{
    const key=plan.fingerprint;
    if(!options.forceRefresh){const cached=this.cache.get(key);if(cached)return this.result(cached,key,true)}
    let task=this.inflight.get(key);
    if(!task){task=this.adapter.execute(plan);this.inflight.set(key,task)}
    try{const rows=await task;this.cache.set(key,rows);return this.result(rows,key,false)}finally{if(this.inflight.get(key)===task)this.inflight.delete(key)}
  }
  invalidate(fingerprint?:string):void{this.cache.invalidate(fingerprint)}
  clearInflight():void{this.inflight.clear()}
  private result(rows:T[],fingerprint:string,fromCache:boolean):QueryResult<T>{const fetchedAt=Date.now();return{rows,fromCache,fingerprint,fetchedAt:new Date(fetchedAt).toISOString(),expiresAt:new Date(fetchedAt+this.cache.ttl).toISOString()}}
}
