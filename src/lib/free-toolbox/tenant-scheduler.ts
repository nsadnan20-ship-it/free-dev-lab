import type {TenantContext} from './tenant-guard';
export interface TenantJob{tenantId:string;jobId:string;type:string;enabled:boolean}
export function tenantJobKey(ctx:TenantContext,jobId:string):string{if(!ctx.tenantId||!ctx.userId)throw new Error('TENANT_CONTEXT_REQUIRED');return `${ctx.tenantId}:${jobId}`}
export function canRunTenantJob(ctx:TenantContext,job:TenantJob):boolean{return job.enabled&&job.tenantId===ctx.tenantId}
export function scopeTenantJobs<T extends TenantJob>(ctx:TenantContext,jobs:T[]):T[]{return jobs.filter(j=>canRunTenantJob(ctx,j))}
