export type RowState = 'new' | 'changed' | 'unchanged' | 'deleted' | 'quarantined';
export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface RowVersion<T = unknown> { key: string; hash: string; value?: T; }
export interface RowDelta<T = unknown> { key: string; state: RowState; current?: T; previousHash?: string; currentHash?: string; }

export function diffRows<T>(previous: readonly RowVersion<T>[], current: readonly RowVersion<T>[]): RowDelta<T>[] {
  const before = new Map(previous.map((row) => [row.key, row]));
  const after = new Map(current.map((row) => [row.key, row]));
  const keys = new Set([...before.keys(), ...after.keys()]);
  return [...keys].sort().map((key) => {
    const oldRow = before.get(key);
    const newRow = after.get(key);
    if (!newRow) return { key, state: 'deleted', previousHash: oldRow?.hash };
    if (!oldRow) return { key, state: 'new', current: newRow.value, currentHash: newRow.hash };
    if (oldRow.hash === newRow.hash) return { key, state: 'unchanged', current: newRow.value, currentHash: newRow.hash, previousHash: oldRow.hash };
    return { key, state: 'changed', current: newRow.value, currentHash: newRow.hash, previousHash: oldRow.hash };
  });
}

export interface SourceCandidate<T = unknown> { businessKey: string; sourceId: string; precedence: number; observedAt: string; value: T; }

export function consolidateByPrecedence<T>(items: readonly SourceCandidate<T>[]): SourceCandidate<T>[] {
  const groups = new Map<string, SourceCandidate<T>[]>();
  for (const item of items) groups.set(item.businessKey, [...(groups.get(item.businessKey) ?? []), item]);
  return [...groups.values()]
    .map((group) => [...group].sort((a, b) => a.precedence - b.precedence || b.observedAt.localeCompare(a.observedAt))[0])
    .sort((a, b) => a.businessKey.localeCompare(b.businessKey));
}

export interface RiskBudget { maxRisk: number; protectedLiquidity: number; minimumServiceLevel: number; }
export interface ScenarioOption { key: string; expectedImpact: number; risk: number; liquidityRequired: number; serviceLevel: number; }

export function selectBoundedScenario(options: readonly ScenarioOption[], budget: RiskBudget): ScenarioOption | null {
  if (![budget.maxRisk, budget.protectedLiquidity, budget.minimumServiceLevel].every(Number.isFinite)) return null;
  return [...options]
    .filter((option) => [option.expectedImpact, option.risk, option.liquidityRequired, option.serviceLevel].every(Number.isFinite))
    .filter((option) => option.risk <= budget.maxRisk && option.liquidityRequired <= budget.protectedLiquidity && option.serviceLevel >= budget.minimumServiceLevel)
    .sort((a, b) => (b.expectedImpact - a.expectedImpact) || (a.risk - b.risk) || a.key.localeCompare(b.key))[0] ?? null;
}

export interface PortfolioCandidate { key: string; materiality: number; confidence: number; urgency: number; risk: number; }

export function rankPortfolio(candidates: readonly PortfolioCandidate[], maxRisk: number) {
  if (!Number.isFinite(maxRisk)) return [];
  return [...candidates]
    .filter((item) => [item.materiality, item.confidence, item.urgency, item.risk].every(Number.isFinite) && item.confidence >= 0 && item.confidence <= 1)
    .map((item) => ({
      ...item,
      priority: Math.max(0, item.materiality) * item.confidence * (0.5 + Math.max(0, Math.min(1, item.urgency))) / (1 + Math.max(0, item.risk)),
      escalationRequired: item.materiality >= 0.8 || item.confidence < 0.6 || item.risk > maxRisk,
    }))
    .sort((a, b) => b.priority - a.priority || b.materiality - a.materiality || a.key.localeCompare(b.key));
}

export interface OutcomeObservation { expected: number; actual: number; quality: number; }

export function calibrateConfidence(prior: number, observations: readonly OutcomeObservation[]): number {
  const safePrior = Number.isFinite(prior) && prior >= 0 && prior <= 1 ? prior : 0;
  if (!observations.length) return 0;
  const usable = observations.filter((o) => Number.isFinite(o.expected) && Number.isFinite(o.actual) && Number.isFinite(o.quality) && o.quality >= 0 && o.quality <= 1);
  if (!usable.length) return 0;
  const accuracy = usable.reduce((sum, o) => {
    const scale = Math.max(1, Math.abs(o.expected));
    return sum + Math.max(0, 1 - Math.abs(o.actual - o.expected) / scale) * o.quality;
  }, 0) / usable.length;
  return Math.max(0, Math.min(1, safePrior * 0.35 + accuracy * 0.65));
}

export interface AutonomyGateInput { trustHealthy: boolean; evidenceQuality: number; confidence: number; riskBudgetValid: boolean; criticalDrift: boolean; rollbackVerified: boolean; isolationVerified: boolean; }

export function evaluateAutonomyGate(input: AutonomyGateInput, thresholds = { evidence: 0.9, confidence: 0.9 }) {
  const failures: string[] = [];
  if (!input.trustHealthy) failures.push('continuous_trust');
  if (!Number.isFinite(input.evidenceQuality) || input.evidenceQuality < 0 || input.evidenceQuality > 1 || input.evidenceQuality < thresholds.evidence) failures.push('evidence_quality');
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1 || input.confidence < thresholds.confidence) failures.push('confidence');
  if (!input.riskBudgetValid) failures.push('risk_budget');
  if (input.criticalDrift) failures.push('critical_drift');
  if (!input.rollbackVerified) failures.push('rollback');
  if (!input.isolationVerified) failures.push('tenant_isolation');
  return { eligible: failures.length === 0, failures };
}

export function sourceVersionKey(path: string, contentHash: string) { return `${path.trim().normalize('NFKC')}::${contentHash.trim().toLowerCase()}`; }
