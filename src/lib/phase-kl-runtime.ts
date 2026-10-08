import { advanceCheckpoint, type ReportExecutionCheckpoint, type ReportCheckpointStage } from './report-execution/checkpoint.js';
import { consolidateByPrecedence, diffRows, evaluateAutonomyGate, rankPortfolio, selectBoundedScenario, type PortfolioCandidate, type RiskBudget, type RowVersion, type ScenarioOption, type SourceCandidate } from './production-intelligence.js';
import { DeadLetterQueue, toDeadLetter } from './report-execution/dead-letter.js';

export interface RuntimeEvidence {
  key: string;
  source: string;
  observedAt: string;
  quality: number;
  details?: Record<string, unknown>;
}

export interface RuntimeState<T = unknown> {
  sourceHash: string;
  checkpoint: ReportExecutionCheckpoint;
  rows: RowVersion<T>[];
  evidence: RuntimeEvidence[];
}

function assertEvidence(evidence: RuntimeEvidence[]): void {
  if (!evidence.length) throw new Error('Runtime advancement requires evidence');
  const keys = new Set<string>();
  for (const item of evidence) {
    if (!item.key.trim()) throw new Error('Runtime evidence requires a non-empty key');
    if (keys.has(item.key)) throw new Error(`Duplicate runtime evidence key: ${item.key}`);
    keys.add(item.key);
    if (!item.source.trim()) throw new Error(`Runtime evidence requires a source identity: ${item.key}`);
    const observedAt = Date.parse(item.observedAt);
    if (!Number.isFinite(observedAt)) throw new Error(`Runtime evidence requires a valid observation time: ${item.key}`);
    if (!Number.isFinite(item.quality) || item.quality < 0 || item.quality > 1) {
      throw new Error(`Runtime evidence quality must be between 0 and 1: ${item.key}`);
    }
  }
}

export function advanceRuntime<T>(state: RuntimeState<T>, stage: ReportCheckpointStage, evidence: RuntimeEvidence[], metadata: Omit<ReportExecutionCheckpoint, 'stage'|'updatedAt'|'sourceHash'|'evidenceKeys'> = {}): RuntimeState<T> {
  assertEvidence(evidence);
  if (!state.sourceHash.trim()) throw new Error('Runtime advancement requires sourceHash');
  const next = advanceCheckpoint(state.checkpoint, {
    stage,
    sourceHash: state.sourceHash,
    evidenceKeys: evidence.map((item) => item.key),
    ...metadata,
  });
  return { ...state, checkpoint: next, evidence: [...state.evidence, ...evidence] };
}

export function buildLineage<T>(previous: RowVersion<T>[], current: RowVersion<T>) {
  return diffRows(previous, [current])[0];
}

export function consolidateRuntime<T>(items: SourceCandidate<T>[]) {
  return consolidateByPrecedence(items);
}

export function chooseScenario(options: ScenarioOption[], budget: RiskBudget) {
  return selectBoundedScenario(options, budget);
}

export function prioritizeDecisions(candidates: PortfolioCandidate[], maxRisk: number) {
  return rankPortfolio(candidates, maxRisk);
}

export function evidenceQuality(evidence: RuntimeEvidence[]) {
  if (!evidence.length || evidence.some((item) => !item.source.trim() || !Number.isFinite(Date.parse(item.observedAt)) || !Number.isFinite(item.quality) || item.quality < 0 || item.quality > 1)) return 0;
  return evidence.reduce((sum, item) => sum + item.quality, 0) / evidence.length;
}

export function canAutonomouslyExecute(input: Parameters<typeof evaluateAutonomyGate>[0]) {
  return evaluateAutonomyGate(input);
}

export function createDeadLetterQueue<T>() {
  return new DeadLetterQueue<T>();
}

export { toDeadLetter };
export type { DeadLetterRecord } from './report-execution/dead-letter.js';
