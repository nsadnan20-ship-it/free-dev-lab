export type Criticality = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'OPTIONAL';
export type ValidationStatus = 'PASS' | 'WARN' | 'FAIL' | 'UNKNOWN';

export type ValidationIssue = {
  code: string;
  status: ValidationStatus;
  message: string;
  field?: string;
  criticality?: Criticality;
  evidence?: Record<string, unknown>;
};

export type ReconciliationResult = {
  passed: boolean;
  difference: number;
  tolerance: number;
  issues: ValidationIssue[];
};

export type ConfidenceInput = {
  header: number;
  content: number;
  pattern: number;
  relationship: number;
  math: number;
  context: number;
};

function finiteScore(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

export function combineEvidence(input: ConfidenceInput): number {
  const weights = { header: 0.12, content: 0.22, pattern: 0.14, relationship: 0.22, math: 0.20, context: 0.10 } as const;
  const score =
    finiteScore(input.header) * weights.header +
    finiteScore(input.content) * weights.content +
    finiteScore(input.pattern) * weights.pattern +
    finiteScore(input.relationship) * weights.relationship +
    finiteScore(input.math) * weights.math +
    finiteScore(input.context) * weights.context;
  return finiteScore(score);
}

export function reconcileNumbers(actual: number, expected: number, absoluteTolerance = 0.01, relativeTolerance = 0.0001): ReconciliationResult {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) {
    return {
      passed: false,
      difference: Number.NaN,
      tolerance: Number.NaN,
      issues: [{
        code: 'RECONCILIATION_INPUT_INVALID',
        status: 'UNKNOWN',
        message: 'Actual and expected values must both be finite numbers before reconciliation.',
        evidence: { actual, expected }
      }]
    };
  }
  const difference = actual - expected;
  const tolerance = Math.max(Math.abs(absoluteTolerance), Math.abs(expected) * Math.max(0, relativeTolerance));
  const passed = Math.abs(difference) <= tolerance;
  return {
    passed,
    difference,
    tolerance,
    issues: passed ? [] : [{
      code: 'RECONCILIATION_MISMATCH',
      status: 'FAIL',
      message: 'Actual and expected values exceed the configured tolerance.',
      evidence: { actual, expected, difference, tolerance }
    }]
  };
}

function missingValidation(field: string, required: string[]): ValidationIssue[] {
  return [{
    code: 'VALIDATION_INPUT_INCOMPLETE',
    status: 'UNKNOWN',
    message: `Required validation inputs are missing or non-numeric: ${required.join(', ')}.`,
    field,
    criticality: 'HIGH'
  }];
}

export function validateLineMath(row: Record<string, unknown>): ValidationIssue[] {
  const q = Number(row.quantity);
  const p = Number(row.unit_price);
  const subtotal = Number(row.subtotal ?? row.net_amount);
  const missing = [
    !Number.isFinite(q) ? 'quantity' : '',
    !Number.isFinite(p) ? 'unit_price' : '',
    !Number.isFinite(subtotal) ? 'subtotal' : ''
  ].filter(Boolean);
  if (missing.length) return missingValidation('subtotal', missing);
  const result = reconcileNumbers(q * p, subtotal, 0.02, 0.0005);
  return result.passed ? [] : result.issues.map(i => ({ ...i, code: 'LINE_MATH_MISMATCH', field: 'subtotal', criticality: 'HIGH' as const }));
}

export function validateInvoiceTotals(row: Record<string, unknown>): ValidationIssue[] {
  const subtotal = Number(row.subtotal);
  const tax = Number(row.tax ?? 0);
  const discount = Number(row.discount ?? 0);
  const shipping = Number(row.shipping ?? 0);
  const total = Number(row.total_amount ?? row.total);
  const missing = [
    !Number.isFinite(subtotal) ? 'subtotal' : '',
    !Number.isFinite(tax) ? 'tax' : '',
    !Number.isFinite(discount) ? 'discount' : '',
    !Number.isFinite(shipping) ? 'shipping' : '',
    !Number.isFinite(total) ? 'total_amount' : ''
  ].filter(Boolean);
  if (missing.length) return missingValidation('total_amount', missing);
  const expected = subtotal + tax - discount + shipping;
  const result = reconcileNumbers(total, expected, 0.02, 0.0005);
  return result.passed ? [] : result.issues.map(i => ({ ...i, code: 'INVOICE_TOTAL_MISMATCH', field: 'total_amount', criticality: 'CRITICAL' as const }));
}

export function classifyConfidence(score: number, criticality: Criticality): 'AUTO_APPROVE' | 'REVIEW' | 'QUARANTINE' {
  const normalized = finiteScore(score);
  if (!Number.isFinite(score)) return 'QUARANTINE';
  const criticalFloor = criticality === 'CRITICAL' ? 0.95 : criticality === 'HIGH' ? 0.90 : 0.80;
  if (normalized >= criticalFloor) return 'AUTO_APPROVE';
  if (normalized >= 0.80) return 'REVIEW';
  return 'QUARANTINE';
}
