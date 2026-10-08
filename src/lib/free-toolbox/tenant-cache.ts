import type {TenantContext} from './tenant-guard';
export interface TenantCacheKey{tenantId:string;scope:string;key:string}
export function tenantCacheKey(ctx:TenantContext,scope:string,key:string):string{if(!ctx.tenantId||!ctx.userId)throw new Error('TENANT_CONTEXT_REQUIRED');return `tenant:${ctx.tenantId}:${scope}:${key}`}
export function isTenantCacheKey(ctx:TenantContext,key:string):boolean{return key.startsWith(`tenant:${ctx.tenantId}:`)}
