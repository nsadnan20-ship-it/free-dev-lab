export type AutomationReceiptStatus = 'accepted' | 'blocked' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface AutomationExecutionReceipt {
  receiptId: string;
  tenantId: string;
  actionId: string;
  decisionFingerprint: string;
  evidenceSnapshotId: string;
  idempotencyKey: string;
  status: AutomationReceiptStatus;
  attempt: number;
  startedAt: string;
  finishedAt?: string;
  errorCode?: string;
  outcome?: Record<string, unknown>;
}

export function assertReceiptIdentity(receipt: AutomationExecutionReceipt): void {
  if (!receipt.receiptId || !receipt.tenantId || !receipt.actionId || !receipt.decisionFingerprint || !receipt.evidenceSnapshotId || !receipt.idempotencyKey) {
    throw new Error('Automation receipt identity is incomplete');
  }
  if (!Number.isInteger(receipt.attempt) || receipt.attempt < 1) throw new Error('Automation receipt attempt is invalid');
}

export function receiptKey(receipt: Pick<AutomationExecutionReceipt, 'tenantId' | 'idempotencyKey'>): string {
  return `${receipt.tenantId}:${receipt.idempotencyKey}`;
}
