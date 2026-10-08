export type ReportOutputFormat = 'web' | 'pdf' | 'xlsx';
export type ReportJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface ReportExecutionRequest {
  reportId: string;
  tenantId: string;
  requestedBy: string;
  parameters: Record<string, unknown>;
  formats: ReportOutputFormat[];
  idempotencyKey: string;
  sourceSnapshotId?: string;
}

export interface ReportExecutionEvidence {
  runId: string;
  reportId: string;
  tenantId: string;
  status: ReportJobStatus;
  startedAt?: string;
  completedAt?: string;
  rowCount: number;
  outputFormats: ReportOutputFormat[];
  artifactRefs: string[];
  errorCode?: string;
  errorMessage?: string;
  inputFingerprint: string;
  engineVersion: string;
}

export interface ReportExecutionResult {
  runId: string;
  status: ReportJobStatus;
  artifacts: Array<{ format: ReportOutputFormat; ref: string }>;
  evidence: ReportExecutionEvidence;
}

/** Reject values that are not non-empty strings after trimming. */
function requireNonBlank(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`Invalid report execution ${field}`);
}

/** Validate the complete report execution request before it enters the execution pipeline. */
export function assertExecutionRequest(request: ReportExecutionRequest): void {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Invalid report execution request');
  requireNonBlank(request.reportId, 'report identity');
  requireNonBlank(request.tenantId, 'tenant identity');
  requireNonBlank(request.requestedBy, 'requester identity');
  requireNonBlank(request.idempotencyKey, 'idempotency key');
  if (request.sourceSnapshotId !== undefined) requireNonBlank(request.sourceSnapshotId, 'source snapshot identity');
  if (!request.parameters || typeof request.parameters !== 'object' || Array.isArray(request.parameters)) throw new Error('Invalid report execution parameters');
  if (!Array.isArray(request.formats) || request.formats.length === 0) throw new Error('Report execution requires at least one output format');
  if (new Set(request.formats).size !== request.formats.length) throw new Error('Duplicate output formats are not allowed');
  if (request.formats.some((format) => !['web', 'pdf', 'xlsx'].includes(format))) throw new Error('Unsupported report output format');
}

/** Ensure execution evidence is bound to the caller's expected tenant. */
export function assertEvidenceTenant(evidence: ReportExecutionEvidence, tenantId: string): void {
  requireNonBlank(tenantId, 'tenant identity');
  if (!evidence || evidence.tenantId !== tenantId) throw new Error('Report evidence tenant mismatch');
}
