import type { EvidenceEntry } from './evidence-ledger';
export interface DecisionTrace { decisionId: string; title: string; result: string; confidence: number; inputs: string[]; evidence: string[]; formula?: string; warnings: string[]; createdAt: string }
export function createDecisionTrace(input: { decisionId: string; title: string; result: string | number; confidence: number; inputs?: string[]; evidence?: EvidenceEntry[]; formula?: string; warnings?: string[] }): DecisionTrace {
  return { decisionId: input.decisionId, title: input.title, result: String(input.result), confidence: Math.max(0, Math.min(100, input.confidence)), inputs: input.inputs ?? [], evidence: (input.evidence ?? []).map(e => e.id ?? e.sourceId), formula: input.formula, warnings: input.warnings ?? [], createdAt: new Date().toISOString() };
}
export function traceIsAuditable(t: DecisionTrace) { return t.inputs.length > 0 && t.evidence.length > 0 && t.confidence >= 60 && !t.warnings.some(w => w.includes('fatal')); }
