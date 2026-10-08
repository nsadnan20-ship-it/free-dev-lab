export type ReadinessCheck = { key: string; passed: boolean; severity: 'BLOCKER' | 'WARNING' | 'INFO'; detail: string };
export type ProductionReadiness = { ready: boolean; blockers: string[]; warnings: string[]; score: number; checks: ReadinessCheck[] };

export function evaluateProductionReadiness(checks: ReadinessCheck[]): ProductionReadiness {
  const blockers = checks.filter(c => !c.passed && c.severity === 'BLOCKER').map(c => c.detail);
  const warnings = checks.filter(c => !c.passed && c.severity === 'WARNING').map(c => c.detail);
  const score = checks.length === 0 ? 0 : checks.filter(c => c.passed).length / checks.length;
  return { ready: blockers.length === 0, blockers, warnings, score, checks };
}
