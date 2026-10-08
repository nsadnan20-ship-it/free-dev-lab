import type { ReportExecutionRequest } from './report-execution-contract';
import { assertExecutionRequest } from './report-execution-contract';

export interface ProductionRunPolicyInput {
  request: ReportExecutionRequest;
  sourceHash: string;
  tenantVerified: boolean;
  checkpointResumable: boolean;
  evidenceReady: boolean;
  rollbackReady: boolean;
  criticalDrift: boolean;
  autonomyEligible: boolean;
}

export interface ProductionRunPolicyDecision {
  allowed: boolean;
  blockers: string[];
}

/** Fail-closed boundary between report execution and production intelligence/autonomy. */
export function evaluateProductionRunPolicy(input: ProductionRunPolicyInput): ProductionRunPolicyDecision {
  assertExecutionRequest(input.request);
  const blockers: string[] = [];
  if (!input.sourceHash) blockers.push('source_hash_missing');
  if (!input.tenantVerified) blockers.push('tenant_not_verified');
  if (!input.checkpointResumable) blockers.push('checkpoint_not_resumable');
  if (!input.evidenceReady) blockers.push('evidence_not_ready');
  if (!input.rollbackReady) blockers.push('rollback_not_ready');
  if (input.criticalDrift) blockers.push('critical_drift');
  if (!input.autonomyEligible) blockers.push('autonomy_not_eligible');
  return { allowed: blockers.length === 0, blockers };
}
