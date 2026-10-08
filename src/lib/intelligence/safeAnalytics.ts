import { assessTruth, type AnalyticalKind, type EvidenceItem, type TruthAssessment } from './truthPolicy';

export interface SafeAnalyticalOutput<T> {
  value: T | null;
  truth: TruthAssessment;
  explanation: string;
}

export function safeAnalyticalOutput<T>(input: {
  kind: AnalyticalKind;
  value: T;
  evidence: EvidenceItem[];
  completeness: number;
  freshness: number;
  deterministic: boolean;
  assumptionsExplicit?: boolean;
  backtested?: boolean;
  explanation?: string;
}): SafeAnalyticalOutput<T> {
  const truth = assessTruth(input);
  return {
    value: truth.status === 'BLOCKED' || truth.status === 'INSUFFICIENT_DATA' ? null : input.value,
    truth,
    explanation: input.explanation ?? truth.reasons.join(' '),
  };
}
