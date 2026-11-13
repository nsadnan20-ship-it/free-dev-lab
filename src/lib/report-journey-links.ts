type ReportIdentity = { jobId: string; sourceHash: string };
type DecisionIdentity = { id: string; recommendationId: string | null };

export function reportJourneyLink(report: ReportIdentity, stage: string, decision?: DecisionIdentity): string {
  const params = new URLSearchParams({
    stage,
    reportJobId: report.jobId,
    sourceHash: report.sourceHash,
  });
  if (decision) {
    params.set('sourceDecisionId', decision.id);
    if (decision.recommendationId) params.set('recommendationId', decision.recommendationId);
  }
  return '/decision-experience?' + params.toString();
}

export function reportWorkLink(report: ReportIdentity, filter: string): string {
  const params = new URLSearchParams({
    reportJobId: report.jobId,
    sourceHash: report.sourceHash,
    decisionWorkFilter: filter,
  });
  return '/work-center?' + params.toString();
}