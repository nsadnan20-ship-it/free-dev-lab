import type { ReportExecutionRequest, ReportJobStatus } from './report-execution-contract.ts';
import { assertExecutionRequest } from './report-execution-contract.ts';

const MIN_LEASE_MS = 30_000;

export interface ReportQueueJob {
  runId: string;
  request: ReportExecutionRequest;
  status: ReportJobStatus;
  attempts: number;
  maxAttempts: number;
  leaseOwner?: string;
  leaseToken?: string;
  leaseExpiresAt?: number;
  createdAt: number;
  updatedAt: number;
  lastError?: string;
}

export class InMemoryReportQueue {
  private readonly jobs = new Map<string, ReportQueueJob>();
  private readonly idempotency = new Map<string, string>();

  /** Enqueue a validated report request with a bounded retry budget. */
  enqueue(request: ReportExecutionRequest, runId: string, maxAttempts = 3): ReportQueueJob {
    assertExecutionRequest(request);
    requireNonBlank(runId, 'runId');
    requirePositiveInteger(maxAttempts, 'maxAttempts');
    const key = `${request.tenantId}:${request.idempotencyKey}`;
    const existingRunId = this.idempotency.get(key);
    if (existingRunId) {
      const existing = this.jobs.get(existingRunId);
      if (existing) return cloneJob(existing);
      throw new Error('Idempotency registry points to a missing report job');
    }
    if (this.jobs.has(runId)) throw new Error(`Report run already exists: ${runId}`);
    const now = Date.now();
    const job: ReportQueueJob = { runId, request: cloneRequest(request), status: 'queued', attempts: 0, maxAttempts, createdAt: now, updatedAt: now };
    this.jobs.set(runId, job);
    this.idempotency.set(key, runId);
    return cloneJob(job);
  }

  /** Claim the next eligible report job for a worker using a non-expiring lease floor. */
  claim(workerId: string, leaseMs = MIN_LEASE_MS): ReportQueueJob | undefined {
    requireNonBlank(workerId, 'workerId');
    requireLeaseDuration(leaseMs, 'leaseMs');
    const now = Date.now();
    for (const job of this.jobs.values()) {
      const leaseExpired = !job.leaseExpiresAt || job.leaseExpiresAt <= now;
      if ((job.status === 'queued' || (job.status === 'running' && leaseExpired)) && job.attempts < job.maxAttempts) {
        job.status = 'running';
        job.attempts += 1;
        job.leaseOwner = workerId;
        job.leaseToken = `${runIdToken(job.runId)}:${job.attempts}:${now}`;
        job.leaseExpiresAt = now + leaseMs;
        job.updatedAt = now;
        return cloneJob(job);
      }
    }
    return undefined;
  }

  /** Extend an owned lease while preserving the same fencing token. */
  heartbeat(runId: string, workerId: string, leaseToken: string, leaseMs = MIN_LEASE_MS): void {
    const job = this.require(runId);
    this.assertLease(job, workerId, leaseToken);
    requireLeaseDuration(leaseMs, 'leaseMs');
    const now = Date.now();
    job.leaseExpiresAt = now + leaseMs;
    job.updatedAt = now;
  }

  /** Complete an actively leased report job. */
  complete(runId: string, workerId: string, leaseToken: string): void { this.transition(runId, workerId, leaseToken, 'succeeded'); }
  /** Cancel an actively leased report job. */
  cancel(runId: string, workerId: string, leaseToken: string): void { this.transition(runId, workerId, leaseToken, 'cancelled'); }

  /** Fail an actively leased job and return it to retry or terminal state. */
  fail(runId: string, workerId: string, leaseToken: string, error: string): ReportQueueJob {
    const job = this.require(runId);
    this.assertLease(job, workerId, leaseToken);
    job.lastError = error;
    job.leaseOwner = undefined;
    job.leaseToken = undefined;
    job.leaseExpiresAt = undefined;
    job.status = job.attempts < job.maxAttempts ? 'queued' : 'failed';
    job.updatedAt = Date.now();
    return cloneJob(job);
  }

  /** Read a defensive copy of a report job by run ID. */
  get(runId: string): ReportQueueJob | undefined { const job = this.jobs.get(runId); return job ? cloneJob(job) : undefined; }
  /** List terminal failed jobs that exhausted their retry budget. */
  listDeadLetters(): ReportQueueJob[] { return [...this.jobs.values()].filter(job => job.status === 'failed' && job.attempts >= job.maxAttempts).map(cloneJob); }
  private require(runId: string): ReportQueueJob { const job = this.jobs.get(runId); if (!job) throw new Error(`Report job not found: ${runId}`); return job; }
  private assertLease(job: ReportQueueJob, workerId: string, leaseToken: string): void {
    requireNonBlank(workerId, 'workerId');
    requireNonBlank(leaseToken, 'leaseToken');
    if (job.status !== 'running' || job.leaseOwner !== workerId || job.leaseToken !== leaseToken) throw new Error('Report job lease is not owned by worker or fencing token is stale');
    if (!job.leaseExpiresAt || job.leaseExpiresAt <= Date.now()) throw new Error('Report job lease has expired');
  }
  private transition(runId: string, workerId: string, leaseToken: string, status: ReportJobStatus): void {
    const job = this.require(runId);
    this.assertLease(job, workerId, leaseToken);
    job.status = status;
    job.leaseOwner = undefined;
    job.leaseToken = undefined;
    job.leaseExpiresAt = undefined;
    job.updatedAt = Date.now();
  }
}

function requireNonBlank(value: string, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${field} is required`);
}
function requirePositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${field} must be a positive integer`);
}
function requireLeaseDuration(value: number, field: string): void {
  if (!Number.isFinite(value) || value < MIN_LEASE_MS) throw new Error(`${field} must be at least ${MIN_LEASE_MS}ms and finite`);
}
function cloneRequest(request: ReportExecutionRequest): ReportExecutionRequest {
  return { ...request, parameters: structuredClone(request.parameters), formats: [...request.formats] };
}
function cloneJob(job: ReportQueueJob): ReportQueueJob { return { ...job, request: cloneRequest(job.request) }; }

function runIdToken(runId: string): string {
  let hash = 2166136261;
  for (let i = 0; i < runId.length; i += 1) hash = Math.imul(hash ^ runId.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}
