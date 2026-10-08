import { advanceCheckpoint, type ReportExecutionCheckpoint, type ReportCheckpointStage } from './report-execution/checkpoint';
import { evaluateAutonomyGate, rankPortfolio, selectBoundedScenario, type PortfolioCandidate, type RiskBudget, type ScenarioOption } from './production-intelligence';

export const LIFECYCLE_PHASES = ['K','L','M','N','O','P','Q','R','S'] as const;
export type LifecyclePhase = typeof LIFECYCLE_PHASES[number];

export interface LifecycleEvidence {
  key: string;
  phase: LifecyclePhase;
  passed: boolean;
  score?: number;
  source?: string;
  details?: Record<string, unknown>;
}

export interface LifecycleState {
  tenantId: string;
  sourceHash: string;
  checkpoint: ReportExecutionCheckpoint;
  evidence: LifecycleEvidence[];
  blockers: string[];
}

export interface RuntimeDecision {
  key: string;
  priority: number;
  materiality: number;
  confidence: number;
  risk: number;
  evidenceKeys: string[];
}

export interface ReleaseReadiness {
  ready: boolean;
  completedPhases: LifecyclePhase[];
  blockedPhases: LifecyclePhase[];
  evidenceScore: number;
  blockers: string[];
}

export function advanceLifecycle(state: LifecycleState, stage: ReportCheckpointStage, evidence: LifecycleEvidence[]): LifecycleState {
  const next = advanceCheckpoint(state.checkpoint, { stage, sourceHash: state.sourceHash, evidenceKeys: evidence.map((item) => item.key) });
  const blockers = [...state.blockers];
  for (const item of evidence) if (!item.passed && !blockers.includes(item.key)) blockers.push(item.key);
  return { ...state, checkpoint: next, evidence: [...state.evidence, ...evidence], blockers };
}

export function buildDecisionPortfolio(candidates: PortfolioCandidate[], maxRisk: number): RuntimeDecision[] {
  return rankPortfolio(candidates, maxRisk).map((item) => ({
    key: item.key,
    priority: item.priority,
    materiality: item.materiality,
    confidence: item.confidence,
    risk: item.risk,
    evidenceKeys: [],
  }));
}

export function chooseBoundedScenario(options: ScenarioOption[], budget: RiskBudget) { return selectBoundedScenario(options, budget); }
export function autonomyDecision(input: Parameters<typeof evaluateAutonomyGate>[0]) { return evaluateAutonomyGate(input); }

export function assessReleaseReadiness(evidence: LifecycleEvidence[], blockers: string[] = []): ReleaseReadiness {
  const completedPhases = LIFECYCLE_PHASES.filter((phase) => { const items = evidence.filter((item) => item.phase === phase); return items.length > 0 && items.every((item) => item.passed); });
  const blockedPhases = LIFECYCLE_PHASES.filter((phase) => { const items = evidence.filter((item) => item.phase === phase); return items.some((item) => !item.passed); });
  const scores = evidence.filter((item) => typeof item.score === 'number').map((item) => Math.max(0, Math.min(1, item.score!)));
  const evidenceScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  return { ready: completedPhases.length === LIFECYCLE_PHASES.length && blockers.length === 0, completedPhases, blockedPhases, evidenceScore, blockers: [...blockers] };
}

export function assertNoCrossTenantEvidence(evidence: LifecycleEvidence[], tenantId: string) {
  for (const item of evidence) {
    const candidate = item.details?.tenantId;
    if (candidate !== undefined && candidate !== tenantId) throw new Error(`cross-tenant evidence: ${item.key}`);
  }
}
