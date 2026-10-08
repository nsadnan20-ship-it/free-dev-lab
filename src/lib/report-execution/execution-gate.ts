import { assertGovernedRoute, type GovernedRoutePlan } from '../import-pipeline/governed-route-plan';
import { assertExecutionRequest, type ReportExecutionRequest } from './report-execution-contract';

export interface ExecutionGateInput { request: ReportExecutionRequest; routePlan: GovernedRoutePlan; sourceSnapshotId: string; }

export function assertReportExecutionReady(input: ExecutionGateInput): void {
  // Report execution is fail-closed: missing identity, source snapshot, or a quarantined
  // source must stop execution before any queue/renderer side effect can occur.
  assertExecutionRequest(input.request);
  if (!input.sourceSnapshotId) throw new Error('Report execution requires a source snapshot');
  assertGovernedRoute(input.routePlan);
  assertNoQuarantine(input.routePlan);
}

export function assertNoQuarantine(plan: GovernedRoutePlan): void {
  if (plan.quarantineCount > 0) throw new Error(`Report source contains ${plan.quarantineCount} quarantined fields`);
}
