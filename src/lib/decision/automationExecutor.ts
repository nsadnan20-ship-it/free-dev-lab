import type { CertificationResult } from '../production/productionCertification';

export type AutomationAction = { actionId: string; tenantId: string; decisionFingerprint: string; evidenceSnapshotId: string; idempotencyKey: string; requiresApproval: boolean; approved: boolean; sideEffect: 'NONE' | 'EXTERNAL'; status: 'READY' | 'BLOCKED' | 'EXECUTED'; };

export function prepareAutomationAction(input: Omit<AutomationAction, 'status'>, certification: CertificationResult): AutomationAction {
  const safe = certification.certified && Boolean(input.tenantId && input.decisionFingerprint && input.evidenceSnapshotId && input.idempotencyKey) && (!input.sideEffect || input.sideEffect === 'NONE' || input.approved);
  return { ...input, status: safe ? 'READY' : 'BLOCKED' };
}

export function executeAutomationAction(action: AutomationAction): AutomationAction {
  if (action.status !== 'READY') throw new Error('Automation action is not ready');
  if (action.sideEffect === 'EXTERNAL' && !action.approved) throw new Error('External automation requires explicit approval');
  return { ...action, status: 'EXECUTED' };
}
