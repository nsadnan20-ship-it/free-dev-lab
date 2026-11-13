import { describe, expect, it } from 'vitest';
import { reportJourneyLink, reportWorkLink } from '@/lib/report-journey-links';

describe('source-bound journey navigation', () => {
  const report = { jobId: 'saved-report', sourceHash: 'sha256:' + 'a'.repeat(64) };
  it.each(['decision', 'approval', 'outcome'])('retains report and decision identity in %s', (stage) => {
    const url = new URL(reportJourneyLink(report, stage, { id: 'decision-1', recommendationId: 'recommendation-1' }), 'https://example.test');
    expect(url.searchParams.get('reportJobId')).toBe('saved-report');
    expect(url.searchParams.get('sourceHash')).toBe(report.sourceHash);
    expect(url.searchParams.get('sourceDecisionId')).toBe('decision-1');
    expect(url.searchParams.get('recommendationId')).toBe('recommendation-1');
    expect(url.searchParams.get('stage')).toBe(stage);
  });
  it('keeps the original report on the work screen', () => {
    const url = new URL(reportWorkLink(report, 'completed'), 'https://example.test');
    expect(url.searchParams.get('reportJobId')).toBe('saved-report');
    expect(url.searchParams.get('sourceHash')).toBe(report.sourceHash);
    expect(url.searchParams.get('decisionWorkFilter')).toBe('completed');
  });
});