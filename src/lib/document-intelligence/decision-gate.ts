import type { Criticality, ValidationStatus } from './validation';
import { classifyConfidence } from './validation';

export type DecisionGateInput = {
  field: string;
  confidence: number;
  criticality: Criticality;
  validationStatus: ValidationStatus;
  reconciliationPassed?: boolean;
};

export type DecisionGateResult = {
  field: string;
  confidence: number;
  action: 'AUTO_APPROVE' | 'REVIEW' | 'QUARANTINE';
  reason: 'VALIDATED' | 'VALIDATION_REQUIRED' | 'VALIDATION_FAILED' | 'RECONCILIATION_REQUIRED' | 'RECONCILIATION_FAILED' | 'NON_FINITE_CONFIDENCE';
};

function safe(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

/**
 * Final fail-closed gate between intelligence decisions and canonical routing.
 * Confidence alone can never authorize production data: validation must PASS,
 * and reconciliation must be explicitly supplied and PASS as well.
 */
export function gateCanonicalDecision(input: DecisionGateInput): DecisionGateResult {
  const confidence = safe(input.confidence);
  if (!Number.isFinite(input.confidence)) {
    return { field: input.field, confidence, action: 'QUARANTINE', reason: 'NON_FINITE_CONFIDENCE' };
  }

  if (input.validationStatus !== 'PASS') {
    return {
      field: input.field,
      confidence,
      action: input.validationStatus === 'FAIL' ? 'QUARANTINE' : 'REVIEW',
      reason: input.validationStatus === 'FAIL' ? 'VALIDATION_FAILED' : 'VALIDATION_REQUIRED'
    };
  }

  if (input.reconciliationPassed !== true) {
    return {
      field: input.field,
      confidence,
      action: input.reconciliationPassed === false ? 'QUARANTINE' : 'REVIEW',
      reason: input.reconciliationPassed === false ? 'RECONCILIATION_FAILED' : 'RECONCILIATION_REQUIRED'
    };
  }

  return {
    field: input.field,
    confidence,
    action: classifyConfidence(confidence, input.criticality),
    reason: 'VALIDATED'
  };
}
