import type { CanonicalField } from './canonical-schema';

export type ClaimStatus = 'OBSERVED' | 'DERIVED' | 'INFERRED' | 'RECOMMENDED' | 'DECISION' | 'OUTCOME';
export type ClaimState = 'VALID' | 'REVIEW_REQUIRED' | 'INSUFFICIENT_SAMPLE' | 'NOT_AVAILABLE' | 'BLOCKED';

export type ClaimProvenance = {
  tenantId: string;
  sourceHash: string;
  reportExecutionJobId: string;
  evidenceSnapshotId?: string | null;
  evidencePassportId?: string | null;
  sourceVersionId?: string | null;
};

export type Claim = ClaimProvenance & {
  claimId: string;
  status: ClaimStatus;
  state: ClaimState;
  statement: string;
  inputFields: CanonicalField[];
  calculationMethod: string;
  scope: { period?: string | null; filters?: Record<string, string | number | boolean | null> };
  sampleSize: number;
  limitations: string[];
  supportingEvidence: string[];
  archetypeId?: string | null;
  profileVersion?: number | null;
  ruleId?: string | null;
};

export type DecisionReadiness = {
  evidenceStrength: number;
  materiality: number;
  actionability: number;
  urgency: number;
};

export type DecisionReadinessState =
  | 'READY'
  | 'READY_WITH_REVIEW'
  | 'EVIDENCE_BLOCKED'
  | 'ACTION_BLOCKED'
  | 'INSUFFICIENT_SAMPLE'
  | 'NOT_AVAILABLE';

function boundedScore(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

export function validateClaim(claim: Claim): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!hasText(claim.claimId)) reasons.push('CLAIM_ID_MISSING');
  if (!hasText(claim.tenantId)) reasons.push('TENANT_ID_MISSING');
  if (!hasText(claim.sourceHash)) reasons.push('SOURCE_HASH_MISSING');
  if (!hasText(claim.reportExecutionJobId)) reasons.push('REPORT_EXECUTION_JOB_ID_MISSING');
  if (!hasText(claim.statement)) reasons.push('STATEMENT_MISSING');
  if (!hasText(claim.calculationMethod)) reasons.push('CALCULATION_METHOD_MISSING');
  if (!Number.isInteger(claim.sampleSize) || claim.sampleSize < 0) reasons.push('SAMPLE_SIZE_INVALID');
  if (!Array.isArray(claim.inputFields) || claim.inputFields.length === 0) reasons.push('INPUT_FIELDS_MISSING');
  if (!Array.isArray(claim.supportingEvidence)) reasons.push('SUPPORTING_EVIDENCE_INVALID');
  if (['DERIVED', 'INFERRED', 'RECOMMENDED', 'DECISION', 'OUTCOME'].includes(claim.status) && claim.supportingEvidence.length === 0) {
    reasons.push('SUPPORTING_EVIDENCE_MISSING');
  }

  const evidenceBound =
    hasText(claim.evidenceSnapshotId) ||
    hasText(claim.evidencePassportId) ||
    hasText(claim.sourceVersionId);
  if (!evidenceBound) reasons.push('EVIDENCE_REFERENCE_MISSING');

  if (claim.status === 'INFERRED' && claim.supportingEvidence.length === 0) {
    reasons.push('INFERENCE_WITHOUT_EVIDENCE');
  }

  if (claim.state === 'VALID' && reasons.length > 0) {
    return { valid: false, reasons: [...reasons, 'VALID_STATE_CANNOT_HAVE_MISSING_PROVENANCE'] };
  }

  return { valid: reasons.length === 0, reasons };
}

export function evaluateDecisionReadiness(input: {
  readiness: DecisionReadiness;
  sampleSize: number;
  minimumSample: number;
  hasEvidence: boolean;
  hasAction: boolean;
}): { state: DecisionReadinessState; score: number; reasons: string[] } {
  const evidenceStrength = boundedScore(input.readiness.evidenceStrength);
  const materiality = boundedScore(input.readiness.materiality);
  const actionability = boundedScore(input.readiness.actionability);
  const urgency = boundedScore(input.readiness.urgency);
  const score = Number(
    (evidenceStrength * 0.4 + materiality * 0.2 + actionability * 0.3 + urgency * 0.1).toFixed(4),
  );

  const reasons: string[] = [];
  if (!Number.isInteger(input.sampleSize) || input.sampleSize < input.minimumSample) {
    reasons.push('INSUFFICIENT_SAMPLE');
    return { state: 'INSUFFICIENT_SAMPLE', score, reasons };
  }
  if (!input.hasEvidence) {
    reasons.push('EVIDENCE_REFERENCE_MISSING');
    return { state: 'EVIDENCE_BLOCKED', score, reasons };
  }
  if (!input.hasAction) {
    reasons.push('ACTION_NOT_DEFINED');
    return { state: 'ACTION_BLOCKED', score, reasons };
  }

  if (evidenceStrength < 0.6) reasons.push('EVIDENCE_REQUIRES_REVIEW');
  if (materiality < 0.4) reasons.push('MATERIALITY_LOW');
  if (actionability < 0.5) reasons.push('ACTIONABILITY_LOW');

  return {
    state: reasons.includes('EVIDENCE_REQUIRES_REVIEW') ? 'READY_WITH_REVIEW' : 'READY',
    score,
    reasons,
  };
}

export function isClaimDecisionReady(claim: Claim): boolean {
  return (
    claim.state === 'VALID' &&
    claim.status !== 'INFERRED' &&
    Boolean(claim.evidenceSnapshotId && claim.evidencePassportId) &&
    claim.sampleSize > 0 &&
    claim.limitations.every((item) => item.trim().length > 0)
  );
}
