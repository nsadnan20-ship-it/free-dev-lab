export type AutomationActionStatus = 'pending' | 'approved' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export interface AutomationAction { id: string; tenantId: string; type: string; payload: Record<string, unknown>; evidenceRefs: string[]; idempotencyKey: string; requiresApproval: boolean; status: AutomationActionStatus; attempts: number; maxAttempts: number; }

export function assertAutomationAction(action: AutomationAction): void {
  if (!action.id || !action.tenantId || !action.type || !action.idempotencyKey) throw new Error('Automation action identity is incomplete');
  if (!action.evidenceRefs.length) throw new Error('Automation action requires evidence references');
  if (action.requiresApproval && !['pending', 'approved'].includes(action.status)) throw new Error('External side-effect action must be approved before execution');
  if (action.attempts < 0 || action.maxAttempts < 1 || action.attempts > action.maxAttempts) throw new Error('Invalid automation retry state');
}

export function nextAutomationStatus(action: AutomationAction, approved: boolean, success: boolean): AutomationActionStatus {
  if (action.status === 'cancelled' || action.status === 'succeeded') return action.status;
  if (action.requiresApproval && !approved) return 'pending';
  if (success) return 'succeeded';
  return action.attempts + 1 < action.maxAttempts ? 'running' : 'failed';
}
