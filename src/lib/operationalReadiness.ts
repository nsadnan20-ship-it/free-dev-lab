export type ReadinessState = 'PASS' | 'WARN' | 'BLOCKED';

export interface ReadinessGate {
  id: string;
  label: string;
  state: ReadinessState;
  evidence?: string;
  blocking?: boolean;
}

export interface OperationalReadiness {
  state: ReadinessState;
  score: number;
  blockers: string[];
  warnings: string[];
  passed: number;
  total: number;
}

/**
 * Production readiness is evidence-driven: a missing critical proof can never
 * be hidden by a high feature count or implementation percentage.
 */
export function evaluateOperationalReadiness(gates: ReadinessGate[]): OperationalReadiness {
  const total = gates.length;
  const passed = gates.filter((gate) => gate.state === 'PASS').length;
  const blockers = gates
    .filter((gate) => gate.state === 'BLOCKED' && gate.blocking !== false)
    .map((gate) => `${gate.label}${gate.evidence ? `: ${gate.evidence}` : ''}`);
  const warnings = gates
    .filter((gate) => gate.state === 'WARN')
    .map((gate) => `${gate.label}${gate.evidence ? `: ${gate.evidence}` : ''}`);
  const score = total === 0 ? 0 : Math.round((passed / total) * 100);

  return {
    state: blockers.length > 0 ? 'BLOCKED' : warnings.length > 0 ? 'WARN' : 'PASS',
    score,
    blockers,
    warnings,
    passed,
    total,
  };
}
