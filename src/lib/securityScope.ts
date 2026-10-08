export type ScopeLevel = 'COMPANY' | 'BRANCH' | 'WAREHOUSE';
export interface SecurityScope { companyId: string; branchIds?: string[]; warehouseIds?: string[]; userId?: string; }
export interface ScopedResource { companyId: string; branchId?: string | null; warehouseId?: string | null; }

export function canAccessResource(scope: SecurityScope, resource: ScopedResource): boolean {
  if (!scope.companyId || scope.companyId !== resource.companyId) return false;
  if (resource.branchId && scope.branchIds && !scope.branchIds.includes(resource.branchId)) return false;
  if (resource.warehouseId && scope.warehouseIds && !scope.warehouseIds.includes(resource.warehouseId)) return false;
  return true;
}

export function requireScope(scope: SecurityScope): void {
  if (!scope.companyId) throw new Error('SECURITY_SCOPE_REQUIRED: companyId is mandatory');
}
