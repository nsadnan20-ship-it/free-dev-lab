import { assessFreshness, type FreshnessAssessment, type FreshnessPolicy } from './freshness';

export interface ReportEvidenceInput {
  asOf?: string | Date | null;
  evidenceCount: number;
  qualityScore: number;
  blockingIssues?: string[];
  requiresFreshData?: boolean;
}

export interface ReportEvidenceGateResult {
  ready: boolean;
  freshness: FreshnessAssessment;
  blockingIssues: string[];
}

export function evaluateReportEvidenceGate(
  input: ReportEvidenceInput,
  now: Date = new Date(),
  policy?: FreshnessPolicy,
): ReportEvidenceGateResult {
  const freshness = assessFreshness(input.asOf, now, policy);
  const blockingIssues = [...(input.blockingIssues ?? [])];

  if (input.qualityScore < 70) {
    blockingIssues.push(`جودة البيانات ${input.qualityScore}/100 أقل من حد اعتماد التقرير 70/100.`);
  }
  if (input.evidenceCount === 0) {
    blockingIssues.push('لا يمكن اعتماد تقرير بلا سجل أدلة قابل للتتبع.');
  }
  if (input.requiresFreshData && !freshness.canDriveExecutiveDecisions) {
    blockingIssues.push(`حداثة البيانات ${freshness.status}: ${freshness.reason}`);
  }

  return {
    ready: blockingIssues.length === 0,
    freshness,
    blockingIssues: [...new Set(blockingIssues)],
  };
}
