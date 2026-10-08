import { routeMany, type RoutingDecision } from './routing';
import { stableImportFingerprint } from '../file-engine/reconciliation';

export type TransactionalRoutePlan = { tenantId: string; sourceId: string; idempotencyKey: string; decisions: RoutingDecision[]; status: 'READY' | 'REVIEW_REQUIRED' | 'QUARANTINED'; rollbackRequired: boolean };

export function buildTransactionalRoutePlan(input: { tenantId: string; sourceId: string; rows: Record<string, unknown>[]; fields: Array<{ field: string; confidence: number }>; criticalFields?: string[] }): TransactionalRoutePlan {
  if (!input.tenantId || !input.sourceId) throw new Error('TRANSACTION_SCOPE_REQUIRED');
  const decisions = routeMany(input.fields);
  const idempotencyKey = stableImportFingerprint(input.rows, row => row['sku'] ?? row['رقم الصنف'] ?? row['id'] ?? '', row => JSON.stringify(row));
  const review = decisions.some(d => d.action === 'REVIEW');
  const quarantine = decisions.some(d => d.action === 'QUARANTINE' || d.action === 'UNMAPPED');
  const criticalMissing = (input.criticalFields ?? []).some(field => !decisions.some(d => d.canonicalField === field && d.action === 'AUTO_APPROVE'));
  return { tenantId: input.tenantId, sourceId: input.sourceId, idempotencyKey, decisions, status: quarantine || criticalMissing ? 'QUARANTINED' : review ? 'REVIEW_REQUIRED' : 'READY', rollbackRequired: quarantine || criticalMissing };
}

export function assertTransactionalCommit(plan: TransactionalRoutePlan, approval: boolean): void {
  if (!approval || plan.status !== 'READY') throw new Error('TRANSACTION_COMMIT_BLOCKED');
  if (plan.rollbackRequired) throw new Error('TRANSACTION_ROLLBACK_REQUIRED');
}
