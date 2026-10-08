import type {TenantContext} from './tenant-guard';
import {assertTenantContext} from './tenant-guard';
import {tenantCacheKey} from './tenant-cache';
export interface CacheEntry<T>{value:T;expiresAt:number;createdAt:number}
export class TenantAnalysisCache<T=unknown>{private readonly store=new Map<string,CacheEntry<T>>();constructor(private readonly maxEntries=128,private readonly ttlMs=60_000){}
get(ctx:TenantContext,scope:string,key:string,now=Date.now()):T|undefined{assertTenantContext(ctx);const k=tenantCacheKey(ctx,scope,key);const hit=this.store.get(k);if(!hit)return undefined;if(hit.expiresAt<=now){this.store.delete(k);return undefined}this.store.delete(k);this.store.set(k,hit);return hit.value}
set(ctx:TenantContext,scope:string,key:string,value:T,now=Date.now()):void{assertTenantContext(ctx);const k=tenantCacheKey(ctx,scope,key);this.store.delete(k);this.store.set(k,{value,createdAt:now,expiresAt:now+this.ttlMs});while(this.store.size>Math.max(1,this.maxEntries)){const oldest=this.store.keys().next().value;if(oldest===undefined)break;this.store.delete(oldest)}}
clearTenant(ctx:TenantContext):void{assertTenantContext(ctx);const prefix=`tenant:${ctx.tenantId}:`;for(const k of this.store.keys())if(k.startsWith(prefix))this.store.delete(k)}
clear():void{this.store.clear()}
size():number{return this.store.size}}
