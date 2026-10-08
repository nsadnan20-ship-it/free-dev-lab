import { assessTruth, type EvidenceItem, type AnalyticalKind } from './truthPolicy';

export type ProcessingMode = 'FAST' | 'WORKER' | 'DOCUMENT_AI' | 'HEAVY_ANALYTICS' | 'OFFLINE';

export interface ProcessingInput {
  kind: AnalyticalKind | 'IMPORT' | 'DOCUMENT';
  bytes?: number;
  rows?: number;
  pages?: number;
  offline?: boolean;
  accuracyCritical?: boolean;
}

export interface ProcessingPlan {
  mode: ProcessingMode;
  validationRequired: boolean;
  reconciliationRequired: boolean;
  evidenceRequired: boolean;
  fallbackAllowed: boolean;
}

export function planProcessing(input: ProcessingInput): ProcessingPlan {
  if (input.offline) return { mode: 'OFFLINE', validationRequired: true, reconciliationRequired: true, evidenceRequired: true, fallbackAllowed: true };
  if (input.kind === 'DOCUMENT' || (input.pages ?? 0) > 20) return { mode: 'DOCUMENT_AI', validationRequired: true, reconciliationRequired: true, evidenceRequired: true, fallbackAllowed: true };
  if ((input.rows ?? 0) > 10000 || (input.bytes ?? 0) > 20_000_000) return { mode: 'HEAVY_ANALYTICS', validationRequired: true, reconciliationRequired: true, evidenceRequired: true, fallbackAllowed: true };
  if ((input.rows ?? 0) > 1000 || (input.bytes ?? 0) > 2_000_000) return { mode: 'WORKER', validationRequired: true, reconciliationRequired: true, evidenceRequired: true, fallbackAllowed: true };
  return { mode: 'FAST', validationRequired: true, reconciliationRequired: Boolean(input.accuracyCritical), evidenceRequired: true, fallbackAllowed: true };
}

export interface PipelineResult<T> {
  value: T | null;
  plan: ProcessingPlan;
  truth: ReturnType<typeof assessTruth>;
}

export function finalizePipeline<T>(input: {
  value: T;
  kind: AnalyticalKind;
  evidence: EvidenceItem[];
  completeness: number;
  freshness: number;
  deterministic: boolean;
  assumptionsExplicit?: boolean;
  backtested?: boolean;
  plan: ProcessingPlan;
}): PipelineResult<T> {
  const truth = assessTruth(input);
  const safe = truth.status === 'BLOCKED' || truth.status === 'INSUFFICIENT_DATA' ? null : input.value;
  return { value: safe, plan: input.plan, truth };
}
