export type EntitlementDecision = { tenantId: string; capability: string; allowed: boolean; reason: 'ACTIVE' | 'EXPIRED' | 'QUOTA_EXCEEDED' | 'CAPABILITY_DISABLED' | 'MISSING_TENANT' };
export type EntitlementInput = { tenantId?: string; capability: string; enabled: boolean; used: number; limit: number; now: string; expiresAt?: string };
export function decideEntitlement(input: EntitlementInput): EntitlementDecision {
  if (!input.tenantId) return { tenantId: '', capability: input.capability, allowed: false, reason: 'MISSING_TENANT' };
  if (!input.enabled) return { tenantId: input.tenantId, capability: input.capability, allowed: false, reason: 'CAPABILITY_DISABLED' };
  if (input.expiresAt && input.now >= input.expiresAt) return { tenantId: input.tenantId, capability: input.capability, allowed: false, reason: 'EXPIRED' };
  if (!Number.isFinite(input.used) || !Number.isFinite(input.limit) || input.used >= input.limit) return { tenantId: input.tenantId, capability: input.capability, allowed: false, reason: 'QUOTA_EXCEEDED' };
  return { tenantId: input.tenantId, capability: input.capability, allowed: true, reason: 'ACTIVE' };
}
