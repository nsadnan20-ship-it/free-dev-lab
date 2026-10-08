export interface RuntimeEvidencePackage {
  tenantId: string;
  actorId: string;
  recommendationId: string;
  decisionId: string;
  approvalId: string;
  workItemId: string;
  actionReceiptId: string;
  outcomeId: string;
  outcomeDelta: number | null;
  auditIds: string[];
  states: Array<{ entity: string; from: string | null; to: string; at: string }>;
  authorization: Array<{ operation: string; allowed: boolean; reason?: string }>;
}

export function assertRuntimeEvidencePackage(evidence: RuntimeEvidencePackage): void {
  const required = ['tenantId','actorId','recommendationId','decisionId','approvalId','workItemId','actionReceiptId','outcomeId'];
  for (const key of required) {
    if (!evidence[key as keyof RuntimeEvidencePackage]) throw new Error(`RUNTIME_EVIDENCE_MISSING:${key}`);
  }
  if (!Array.isArray(evidence.auditIds) || evidence.auditIds.length === 0) throw new Error('RUNTIME_EVIDENCE_AUDIT_MISSING');
  if (!Array.isArray(evidence.states) || evidence.states.length === 0) throw new Error('RUNTIME_EVIDENCE_STATES_MISSING');
  if (!Array.isArray(evidence.authorization) || evidence.authorization.length === 0) throw new Error('RUNTIME_EVIDENCE_AUTHORIZATION_MISSING');
}

export function calculateOutcomeDelta(expected: number | null, actual: number | null): number | null {
  if (expected === null || actual === null || !Number.isFinite(expected) || !Number.isFinite(actual)) return null;
  return actual - expected;
}
