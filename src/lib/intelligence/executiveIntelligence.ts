import type { DecisionCandidate } from './decisionIntelligence';

export interface ExecutiveSignal {
  id: string;
  type: 'RISK' | 'OPPORTUNITY' | 'DISCOVERY' | 'ACTION';
  title: string;
  detail: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  confidence: number;
  evidenceIds: string[];
}

export interface ExecutiveCockpit {
  signals: ExecutiveSignal[];
  morningBrief: string[];
  moneyView: { cash: number | null; receivables: number | null; inventory: number | null; payables: number | null; completeness: number };
}

export function buildExecutiveCockpit(input: {
  cash?: number | null;
  receivables?: number | null;
  inventory?: number | null;
  payables?: number | null;
  signals?: ExecutiveSignal[];
  decisions?: DecisionCandidate[];
}): ExecutiveCockpit {
  const signals = [...(input.signals ?? [])].sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority));
  const decisions = (input.decisions ?? []).filter(d => d.status !== 'BLOCKED');
  const morningBrief = signals.slice(0, 5).map(s => `${s.title}: ${s.detail}`);
  if (decisions.length) morningBrief.push(`قرارات قابلة للتنفيذ: ${decisions.length}`);
  const values = [input.cash, input.receivables, input.inventory, input.payables];
  const known = values.filter(v => v != null && Number.isFinite(v as number)).length;
  return {
    signals,
    morningBrief,
    moneyView: {
      cash: input.cash ?? null,
      receivables: input.receivables ?? null,
      inventory: input.inventory ?? null,
      payables: input.payables ?? null,
      completeness: known / values.length,
    },
  };
}

function priorityWeight(priority: ExecutiveSignal['priority']): number {
  return { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }[priority];
}
