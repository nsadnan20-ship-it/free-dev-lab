import type { Claim } from './claim-ledger';
import type { BusinessQuestion } from './business-question-engine';

export type DecisionPacket = {
  generatedAt: string;
  source: {
    sourcePath: string;
    sourceHash: string;
    reportExecutionJobId: string;
    evidenceSnapshotId: string | null;
    evidencePassportId: string | null;
  };
  interpretation: {
    archetypeId: string | null;
    profileVersion: number | null;
    businessQuestion: string;
    what: string | null;
    why: string | null;
    soWhat: string | null;
    impact: number | string | null;
    whatNext: string | null;
  };
  evidence: {
    claims: string[];
    limitations: string[];
    readiness: string;
  };
  action: {
    recommendationId: string | null;
    recommendation: string | null;
    decisionId: string | null;
    decisionStatus: string | null;
    approvalStatus: string | null;
    workItemId: string | null;
    workStatus: string | null;
    expectedOutcome: string | null;
    actualOutcome: string | null;
  };
  audit: {
    ruleIds: string[];
    claimIds: string[];
  };
};

export function buildDecisionPacket(input: {
  sourcePath: string;
  sourceHash: string;
  reportExecutionJobId: string;
  evidenceSnapshotId?: string | null;
  evidencePassportId?: string | null;
  archetypeId?: string | null;
  profileVersion?: number | null;
  businessQuestion: string;
  questions: BusinessQuestion<Record<string, unknown>>[];
  claims: Claim[];
  readiness: string;
  recommendationId?: string | null;
  decisionId?: string | null;
  decisionStatus?: string | null;
  approvalStatus?: string | null;
  workItemId?: string | null;
  workStatus?: string | null;
  expectedOutcome?: string | null;
  actualOutcome?: string | null;
  generatedAt?: string;
}): DecisionPacket {
  const answer = (id: string): Record<string, unknown> | null => {
    const question = input.questions.find((item) => item.id === id);
    return question?.state === 'ANSWERED' && question.answer && typeof question.answer === 'object'
      ? question.answer
      : null;
  };
  const what = answer('report.what-happened');
  const why = answer('report.why');
  const next = answer('report.what-next');

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    source: {
      sourcePath: input.sourcePath,
      sourceHash: input.sourceHash,
      reportExecutionJobId: input.reportExecutionJobId,
      evidenceSnapshotId: input.evidenceSnapshotId ?? null,
      evidencePassportId: input.evidencePassportId ?? null,
    },
    interpretation: {
      archetypeId: input.archetypeId ?? null,
      profileVersion: input.profileVersion ?? null,
      businessQuestion: input.businessQuestion,
      what: what?.summary ? String(what.summary) : null,
      why: why?.observation ? String(why.observation) : null,
      soWhat: null,
      impact: null,
      whatNext: next?.action ? String(next.action) : null,
    },
    evidence: {
      claims: input.claims.map((claim) => claim.claimId),
      limitations: [...new Set(input.claims.flatMap((claim) => claim.limitations))],
      readiness: input.readiness,
    },
    action: {
      recommendationId: input.recommendationId ?? null,
      recommendation: input.claims.find((claim) => claim.claimId === input.recommendationId)?.statement ?? null,
      decisionId: input.decisionId ?? null,
      decisionStatus: input.decisionStatus ?? null,
      approvalStatus: input.approvalStatus ?? null,
      workItemId: input.workItemId ?? null,
      workStatus: input.workStatus ?? null,
      expectedOutcome: input.expectedOutcome ?? null,
      actualOutcome: input.actualOutcome ?? null,
    },
    audit: {
      ruleIds: [...new Set(input.claims.map((claim) => claim.ruleId).filter((value): value is string => Boolean(value)))],
      claimIds: input.claims.map((claim) => claim.claimId),
    },
  };
}
