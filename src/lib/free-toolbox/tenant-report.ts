import {assertTenantContext,type TenantContext} from './tenant-guard';
import type {ReportSnapshot} from './report-contract';
export function tenantReport(ctx:TenantContext,report:ReportSnapshot):ReportSnapshot{assertTenantContext(ctx);const tenant=(report as ReportSnapshot & {tenantId?:string}).tenantId;if(tenant!==undefined&&tenant!==ctx.tenantId)throw new Error('TENANT_ACCESS_DENIED');return report}
export function canAccessTenant(ctx:TenantContext,tenantId:string):boolean{return ctx.tenantId===tenantId}
