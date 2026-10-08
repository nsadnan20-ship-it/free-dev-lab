import type { CanonicalField } from './canonical-schema.js';
import type { Claim, ClaimProvenance, ClaimStatus } from './claim-ledger.js';
import type { ReportIntelligence } from './report-smart-insights.js';

type ClaimAdapterInput = {
  intelligence: ReportIntelligence;
  provenance: ClaimProvenance;
  inputFields: CanonicalField[];
  sampleSize: number;
  scope?: { period?: string | null; filters?: Record<string, string | number | boolean | null> };
  archetypeId?: string | null;
  profileVersion?: number | null;
};

function claimId(prefix: string, id: string): string {
  return prefix + ':' + id;
}

function evidenceBoundState(provenance: ClaimProvenance): Claim['state'] {
  return provenance.evidenceSnapshotId && provenance.evidencePassportId ? 'VALID' : 'REVIEW_REQUIRED';
}

function signalStatus(severity: ReportIntelligence['signals'][number]['severity']): ClaimStatus {
  return severity === 'info' ? 'OBSERVED' : 'DERIVED';
}

/**
 * Converts existing deterministic Smart Report outputs into provenance-bearing claims.
 * It intentionally does not alter the signal engine or infer causality.
 */
export function buildClaimsFromReportIntelligence(input: ClaimAdapterInput): Claim[] {
  const common = {
    ...input.provenance,
    inputFields: [...input.inputFields],
    scope: input.scope ?? {},
    sampleSize: input.sampleSize,
    archetypeId: input.archetypeId ?? null,
    profileVersion: input.profileVersion ?? null,
  };

  const claims: Claim[] = input.intelligence.signals.map((signal) => ({
    ...common,
    claimId: claimId('signal', signal.id),
    status: signalStatus(signal.severity),
    state: evidenceBoundState(input.provenance),
    statement: signal.message,
    calculationMethod: 'deterministic_signal_rule:' + signal.id,
    limitations: [
      'هذه إشارة تحليلية وليست إثباتًا سببيًا.',
      'يجب مراجعة الدليل المرتبط قبل اعتماد قرار تنفيذي.',
    ],
    supportingEvidence: [...signal.evidence],
    ruleId: signal.id,
  }));

  for (const recommendation of input.intelligence.recommendations) {
    claims.push({
      ...common,
      claimId: claimId('recommendation', recommendation.id),
      status: 'RECOMMENDED',
      state: evidenceBoundState(input.provenance),
      statement: recommendation.action,
      calculationMethod: 'deterministic_recommendation_from_signal:' + recommendation.id,
      limitations: [
        'التوصية اقتراح تشغيلي مبني على الإشارة؛ القرار والموافقة يظلّان بشريين.',
      ],
      supportingEvidence: [...recommendation.evidence],
      ruleId: recommendation.id.replace(/^rec:/, ''),
    });
  }

  return claims;
}
