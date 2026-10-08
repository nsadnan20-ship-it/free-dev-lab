import type { ReportExecutionCheckpoint, ReportExecutionStage } from './checkpoint.js';
import { consolidateRuntime, chooseScenario, prioritizeDecisions, canAutonomouslyExecute, type RuntimeEvidence } from '../phase-kl-runtime.js';
import { diffRows, type AutonomyGateInput, type PortfolioCandidate, type RiskBudget, type RowVersion, type ScenarioOption, type SourceCandidate } from '../production-intelligence.js';

export interface ProductionLifecycleInput<T = unknown> {
  jobId: string;
  companyId: string;
  sourceSnapshotId?: string;
  sourceHash: string;
  previousRows: RowVersion<T>[];
  currentRows: RowVersion<T>[];
  sourceCandidates: SourceCandidate<T>[];
  scenarioOptions: ScenarioOption[];
  riskBudget: RiskBudget;
  portfolioCandidates: PortfolioCandidate[];
  autonomy: AutonomyGateInput;
  evidence: RuntimeEvidence[];
}

export interface ProductionLifecycleResult<T = unknown> {
  jobId: string;
  companyId: string;
  sourceHash: string;
  lineage: ReturnType<typeof diffRows<T>>;
  consolidation: ReturnType<typeof consolidateRuntime<T>>;
  scenario: ReturnType<typeof chooseScenario>;
  portfolio: ReturnType<typeof prioritizeDecisions>;
  autonomy: ReturnType<typeof canAutonomouslyExecute>;
}

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) throw new Error(`Production lifecycle requires finite ${name}`);
}

function validateEvidence(evidence: RuntimeEvidence[]): void {
  if (!evidence.length) throw new Error('Production lifecycle requires runtime evidence');
  const keys = new Set<string>();
  for (const item of evidence) {
    if (!item.key.trim()) throw new Error('Runtime evidence requires a non-empty key');
    if (keys.has(item.key)) throw new Error(`Duplicate runtime evidence key: ${item.key}`);
    keys.add(item.key);
    if (!item.source.trim()) throw new Error(`Runtime evidence requires a source identity: ${item.key}`);
    if (!Number.isFinite(Date.parse(item.observedAt))) throw new Error(`Runtime evidence requires a valid observation time: ${item.key}`);
    if (!Number.isFinite(item.quality) || item.quality < 0 || item.quality > 1) throw new Error(`Runtime evidence quality must be between 0 and 1: ${item.key}`);
  }
}

function validateSources<T>(sources: SourceCandidate<T>[]): void {
  for (const source of sources) {
    if (!source.businessKey.trim() || !source.sourceId.trim()) throw new Error('Source candidates require businessKey and sourceId');
    assertFinite('source precedence', source.precedence);
    if (!source.observedAt || Number.isNaN(Date.parse(source.observedAt))) throw new Error(`Invalid source observation time: ${source.sourceId}`);
  }
}

/** Pure integration bridge. Persistence/leases remain owned by the worker store. */
export function runProductionLifecycle<T>(input: ProductionLifecycleInput<T>): ProductionLifecycleResult<T> {
  if (!input.companyId || !input.jobId || !input.sourceHash) throw new Error('Production lifecycle requires tenant, job and source identity');
  if (!input.currentRows.length) throw new Error('Production lifecycle requires authoritative current rows');
  validateEvidence(input.evidence);
  validateSources(input.sourceCandidates);
  assertFinite('risk budget maxRisk', input.riskBudget.maxRisk);
  assertFinite('risk budget protectedLiquidity', input.riskBudget.protectedLiquidity);
  assertFinite('risk budget minimumServiceLevel', input.riskBudget.minimumServiceLevel);
  if (!Number.isFinite(input.autonomy.evidenceQuality) || !Number.isFinite(input.autonomy.confidence)) throw new Error('Autonomy gate requires finite evidence quality and confidence');

  const lineage = diffRows(input.previousRows, input.currentRows);
  const consolidation = consolidateRuntime(input.sourceCandidates);
  const scenario = chooseScenario(input.scenarioOptions, input.riskBudget);
  const portfolio = prioritizeDecisions(input.portfolioCandidates, input.riskBudget.maxRisk);
  const autonomy = canAutonomouslyExecute(input.autonomy);
  return { jobId: input.jobId, companyId: input.companyId, sourceHash: input.sourceHash, lineage, consolidation, scenario, portfolio, autonomy };
}

export function assertProductionCheckpoint(checkpoint: ReportExecutionCheckpoint): void {
  const stages: ReportExecutionStage[] = ['queued', 'fingerprinted', 'extracted', 'canonicalized', 'validated', 'analyzed', 'decisioned', 'committed', 'rendered'];
  if (!stages.includes(checkpoint.stage)) throw new Error(`Invalid production stage: ${checkpoint.stage}`);
  if (!checkpoint.sourceHash?.trim()) throw new Error('Checkpoint requires sourceHash');
  if (!Number.isFinite(checkpoint.updatedAt)) throw new Error('Checkpoint requires a valid updatedAt timestamp');
  if (!Array.isArray(checkpoint.evidenceKeys)) throw new Error('Checkpoint requires evidenceKeys');
}
