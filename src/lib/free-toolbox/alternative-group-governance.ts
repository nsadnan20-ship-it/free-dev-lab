import {assertTenantContext} from './tenant-guard';
import type {TenantContext} from './tenant-guard';
import type {AlternativeGroup,AlternativeMember} from './alternative-groups';
export function assertAlternativeGroupAccess(ctx:TenantContext,group:AlternativeGroup):void{assertTenantContext(ctx);if(group.tenantId!==ctx.tenantId)throw new Error('TENANT_ACCESS_DENIED')}
export function scopeAlternativeGroups(ctx:TenantContext,groups:AlternativeGroup[]):AlternativeGroup[]{assertTenantContext(ctx);return groups.filter(g=>g.tenantId===ctx.tenantId)}
export function scopeAlternativeMembers(ctx:TenantContext,groups:AlternativeGroup[],members:AlternativeMember[]):AlternativeMember[]{const ids=new Set(scopeAlternativeGroups(ctx,groups).map(g=>g.groupId));return members.filter(m=>ids.has(m.groupId))}
export function preventCrossGroupSkuCollision(members:AlternativeMember[]):void{const seen=new Map<string,string>();for(const m of members){const prior=seen.get(m.sku);if(prior&&prior!==m.groupId)throw new Error('SKU_MULTIPLE_ALTERNATIVE_GROUPS');seen.set(m.sku,m.groupId)}}
