import type { Claim } from './claim-ledger';
import type { DecisionPacket } from './decision-packet-builder';
import type { AdvisoryPacket } from './report-advisory-orchestrator';

export type AdvisoryInvariantResult = {
  valid: boolean;
  violations: string[];
};

function nonEmpty(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

export function validateAdvisoryInvariants(
  packet: AdvisoryPacket,
  decisionPacket?: DecisionPacket | null,
): AdvisoryInvariantResult {
  const violations: string[] = [];
  const claims = packet.claims;

  if (!claims.length) violations.push('CLAIMS_EMPTY');

  const first = claims[0];
  if (first) {
    for (const claim of claims) {
      if (claim.tenantId !== first.tenantId) violations.push('CLAIM_TENANT_MISMATCH');
      if (claim.sourceHash !== first.sourceHash) violations.push('CLAIM_SOURCE_HASH_MISMATCH');
      if (claim.reportExecutionJobId !== first.reportExecutionJobId) violations.push('CLAIM_JOB_MISMATCH');
      if ((claim.profileVersion ?? null) !== (first.profileVersion ?? null)) violations.push('CLAIM_PROFILE_VERSION_MISMATCH');
    }
  }

  if (packet.proofState === 'VERIFIED') {
    if (!nonEmpty(first?.evidencePassportId) && !nonEmpty(first?.evidenceSnapshotId)) {
      violations.push('VERIFIED_WITHOUT_EVIDENCE_REFERENCE');
    }
    if (claims.some((claim) => claim.state !== 'VALID')) violations.push('VERIFIED_PACKET_HAS_INVALID_CLAIM');
  }

  if (packet.actionState === 'ACTIONABLE') {
    if (!packet.nextRecommendation) violations.push('ACTIONABLE_WITHOUT_RECOMMENDATION');
    if (packet.proofState !== 'VERIFIED') violations.push('ACTIONABLE_WITHOUT_VERIFIED_PROOF');
  }

  if (packet.outcomeState === 'OBSERVED') {
    violations.push('OBSERVED_OUTCOME_REQUIRES_PERSISTED_READBACK');
  }

  if (decisionPacket) {
    if (!nonEmpty(decisionPacket.source.sourceHash)) violations.push('DECISION_PACKET_SOURCE_HASH_MISSING');
    if (!nonEmpty(decisionPacket.source.reportExecutionJobId)) violations.push('DECISION_PACKET_JOB_MISSING');
    if (first && decisionPacket.source.sourceHash !== first.sourceHash) violations.push('DECISION_PACKET_SOURCE_HASH_MISMATCH');
    if (first && decisionPacket.source.reportExecutionJobId !== first.reportExecutionJobId) violations.push('DECISION_PACKET_JOB_MISMATCH');

    const recommendationIds = new Set(
      claims.filter((claim) => claim.status === 'RECOMMENDED').map((claim) => claim.claimId),
    );
    if (decisionPacket.action.recommendationId && !recommendationIds.has(decisionPacket.action.recommendationId)) {
      violations.push('DECISION_PACKET_RECOMMENDATION_NOT_IN_CLAIMS');
    }
    if (decisionPacket.action.expectedOutcome && !decisionPacket.action.actualOutcome) {
      if (packet.outcomeState === 'OBSERVED') violations.push('EXPECTED_ONLY_OUTCOME_MARKED_OBSERVED');
    }
    if (decisionPacket.interpretation.impact != null && packet.outcomeState !== 'OBSERVED') {
      violations.push('IMPACT_PRESENT_WITHOUT_OBSERVED_OUTCOME');
    }
  }

  return { valid: violations.length === 0, violations: [...new Set(violations)] };
}
