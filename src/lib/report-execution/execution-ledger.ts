import type { ReportExecutionEvidence, ReportExecutionRequest, ReportExecutionResult } from './report-execution-contract';
import { fingerprintRequest, IdempotencyRegistry } from './idempotency';
import { assertNoQuarantine, assertReportExecutionReady, type ExecutionGateInput } from './execution-gate';
import { InMemoryReportQueue } from './queue';

export interface ExecutionLedgerRecord extends ReportExecutionEvidence { requestFingerprint: string; immutable: true; }

export class ReportExecutionCoordinator {
  readonly queue = new InMemoryReportQueue();
  readonly idempotency = new IdempotencyRegistry();
  private readonly ledger = new Map<string, ExecutionLedgerRecord>();

  enqueue(input: ExecutionGateInput, runId: string, maxAttempts = 3): ReportExecutionResult {
    assertReportExecutionReady(input);
    assertNoQuarantine(input.routePlan);
    const fingerprint = fingerprintRequest(input.request);
    const claim = this.idempotency.claim(input.request.idempotencyKey, input.request.tenantId, fingerprint, runId);
    const job = this.queue.enqueue(input.request, claim.runId, maxAttempts);
    const evidence: ExecutionLedgerRecord = {
      runId: job.runId, reportId: job.request.reportId, tenantId: job.request.tenantId,
      status: job.status, rowCount: 0, outputFormats: [...job.request.formats], artifactRefs: [],
      inputFingerprint: fingerprint, engineVersion: 'report-execution-v1', requestFingerprint: fingerprint, immutable: true,
    };
    this.ledger.set(job.runId, evidence);
    return { runId: job.runId, status: job.status, artifacts: [], evidence };
  }

  getEvidence(runId: string): ExecutionLedgerRecord | undefined { const item = this.ledger.get(runId); return item ? { ...item, outputFormats: [...item.outputFormats], artifactRefs: [...item.artifactRefs] } : undefined; }
}
