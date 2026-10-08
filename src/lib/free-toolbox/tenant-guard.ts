export interface TenantContext{tenantId:string;userId:string;roles:string[]}
export interface TenantScopedRecord{tenantId:string}
export function assertTenantContext(ctx:TenantContext):TenantContext{if(!ctx.tenantId.trim()||!ctx.userId.trim())throw new Error('TENANT_CONTEXT_REQUIRED');return ctx}
export function assertTenantOwnership(ctx:TenantContext,record:TenantScopedRecord):void{assertTenantContext(ctx);if(record.tenantId!==ctx.tenantId)throw new Error('TENANT_ACCESS_DENIED')}
export function scopeRecords<T extends TenantScopedRecord>(ctx:TenantContext,records:T[]):T[]{assertTenantContext(ctx);return records.filter(r=>r.tenantId===ctx.tenantId)}
