import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReportExecutionRequest } from './report-execution-contract.ts';
import type { ReportExecutionCheckpoint } from './checkpoint.ts';

export interface DurableExecutionJob {
  id: string;
  tenantId: string;
  status: string;
  checkpoint: ReportExecutionCheckpoint;
  attempt: number;
  maxAttempts: number;
  leaseOwner: string | null;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
}

export class SupabaseReportExecutionStore {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async claim(jobId: string, workerId: string, leaseSeconds = 300, tenantId: string): Promise<DurableExecutionJob> {
    const { data, error } = await this.client.rpc('claim_report_execution_job', { p_job_id: jobId, p_company_id: tenantId, p_lease_owner: workerId, p_lease_seconds: leaseSeconds });
    if (error) throw error;
    if (!data || typeof data !== 'object') throw new Error('Report execution job could not be claimed');
    const job = await this.require(jobId);
    if (job.tenantId !== tenantId) throw new Error('Claimed durable job tenant does not match request tenant');
    return job;
  }

  async heartbeat(jobId: string, workerId: string, leaseSeconds = 300, tenantId: string): Promise<void> {
    const job = await this.require(jobId);
    if (job.tenantId !== tenantId) throw new Error('Worker tenant context does not match the durable job tenant');
    if (!job.leaseToken) throw new Error('Worker lease token is missing');
    const { data, error } = await this.client.rpc('heartbeat_report_execution_job', { p_job_id: jobId, p_company_id: tenantId, p_worker_id: workerId, p_lease_token: job.leaseToken, p_lease_seconds: leaseSeconds });
    if (error) throw error;
    if (data !== true) throw new Error('Heartbeat rejected: active worker lease is missing, expired, or no longer owns the job');
  }

  async saveCheckpoint(jobId: string, checkpoint: ReportExecutionCheckpoint, workerId: string, tenantId: string): Promise<void> {
    const job = await this.require(jobId);
    if (job.tenantId !== tenantId) throw new Error('Worker tenant context does not match the durable job tenant');
    if (!job.leaseToken) throw new Error('Worker lease token is missing');
    const { data, error } = await this.client.rpc('advance_report_execution_checkpoint', { p_job_id: jobId, p_company_id: tenantId, p_worker_id: workerId, p_lease_token: job.leaseToken, p_checkpoint: checkpoint });
    if (error) throw error;
    if (data !== true) throw new Error('Checkpoint rejected: lease is missing, expired, or no longer owns the job');
  }

  async complete(jobId: string, workerId: string, evidence: Record<string, unknown> = {}, tenantId: string): Promise<void> {
    const job = await this.require(jobId);
    if (job.tenantId !== tenantId) throw new Error('Worker tenant context does not match the durable job tenant');
    if (!job.leaseToken) throw new Error('Worker lease token is missing');
    const { data, error } = await this.client.rpc('complete_report_execution_job', { p_job_id: jobId, p_company_id: tenantId, p_worker_id: workerId, p_lease_token: job.leaseToken, p_evidence: evidence });
    if (error) throw error;
    if (data !== true) throw new Error('Completion rejected: active worker lease is missing or expired');
  }

  async fail(jobId: string, workerId: string, errorPayload: Record<string, unknown>, tenantId: string): Promise<void> {
    const job = await this.require(jobId);
    if (job.tenantId !== tenantId) throw new Error('Worker tenant context does not match the durable job tenant');
    if (!job.leaseToken) throw new Error('Worker lease token is missing');
    const { data, error } = await this.client.rpc('fail_report_execution_job', { p_job_id: jobId, p_company_id: tenantId, p_worker_id: workerId, p_lease_token: job.leaseToken, p_error: errorPayload });
    if (error) throw error;
    if (data !== true) throw new Error('Failure update rejected: active worker lease is missing');
  }

  async retry(jobId: string, tenantId: string): Promise<void> {
    const job = await this.require(jobId);
    if (job.tenantId !== tenantId) throw new Error('Worker tenant context does not match the durable job tenant');
    const { data, error } = await this.client.rpc('retry_report_execution_job', { p_job_id: jobId, p_company_id: tenantId });
    if (error) throw error;
    if (data !== true) throw new Error('Retry rejected: job is not failed, belongs to another tenant, or has exhausted its retry budget');
  }

  async require(jobId: string): Promise<DurableExecutionJob> {
    const { data, error } = await this.client.from('report_execution_jobs').select('id,company_id,status,checkpoint,attempt,max_attempts,lease_owner,lease_token,lease_expires_at').eq('id', jobId).single();
    if (error) throw error;
    return { id: data.id, tenantId: data.company_id, status: data.status, checkpoint: data.checkpoint, attempt: data.attempt, maxAttempts: data.max_attempts, leaseOwner: data.lease_owner, leaseToken: data.lease_token, leaseExpiresAt: data.lease_expires_at };
  }

  static requestIdentity(request: ReportExecutionRequest): string {
    if (!request.tenantId || !request.idempotencyKey) throw new Error('Durable execution requires tenant and idempotency context');
    return `${request.tenantId}:${request.idempotencyKey}:${request.sourceSnapshotId ?? 'latest'}`;
  }
}
