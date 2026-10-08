export type OutcomeLearningBinding = {
  outcomeId: string;
  recommendationId: string;
  archetypeId: string;
  profileVersion: number;
  ruleId: string | null;
  sourceHash: string;
  reportExecutionJobId: string;
  evidenceSnapshotId: string | null;
  expectedOutcome: string | null;
  actualOutcome: string | null;
  outcomeState: 'OBSERVED' | 'INSUFFICIENT' | 'NOT_AVAILABLE';
};

export function buildOutcomeLearningBinding(input: {
  outcomeId: string;
  recommendationId: string;
  archetypeId: string | null | undefined;
  profileVersion: number | null | undefined;
  ruleId: string | null | undefined;
  sourceHash: string;
  reportExecutionJobId: string;
  evidenceSnapshotId?: string | null;
  expectedOutcome?: string | null;
  actualOutcome?: string | null;
}): OutcomeLearningBinding {
  const outcomeState: OutcomeLearningBinding['outcomeState'] =
    input.actualOutcome?.trim() ? 'OBSERVED' : input.expectedOutcome?.trim() ? 'INSUFFICIENT' : 'NOT_AVAILABLE';

  const archetypeId = input.archetypeId?.trim();
  if (!archetypeId) throw new Error('OUTCOME_LEARNING_ARCHETYPE_ID_REQUIRED');
  const profileVersion = input.profileVersion;
  if (typeof profileVersion !== 'number' || !Number.isInteger(profileVersion) || profileVersion < 1) {
    throw new Error('OUTCOME_LEARNING_PROFILE_VERSION_REQUIRED');
  }

  return {
    outcomeId: input.outcomeId,
    recommendationId: input.recommendationId,
    archetypeId,
    profileVersion,
    ruleId: input.ruleId ?? null,
    sourceHash: input.sourceHash,
    reportExecutionJobId: input.reportExecutionJobId,
    evidenceSnapshotId: input.evidenceSnapshotId ?? null,
    expectedOutcome: input.expectedOutcome ?? null,
    actualOutcome: input.actualOutcome ?? null,
    outcomeState,
  };
}
