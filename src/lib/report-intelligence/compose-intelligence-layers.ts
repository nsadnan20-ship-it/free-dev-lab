// @ts-nocheck -- imported verbatim from Report-Advisor (legacy looser tsconfig); do not rewrite, wrap via src/lib/universal.
import type {
  BusinessFinding,
  ReportIntelligence,
  ReportRecommendation,
  ReportSignal,
} from './report-smart-insights';

type EvidenceItem = { id: string; evidence?: string[] };

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = String(raw ?? '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

/**
 * Keep specialist records first, append general-source records, and deduplicate
 * only on stable IDs. When both layers describe the same ID, preserve the
 * specialist interpretation while retaining every distinct source evidence item.
 */
function mergeEvidenceRecords<T extends EvidenceItem>(specialist: T[], general: T[]): T[] {
  const merged: T[] = [];
  const positions = new Map<string, number>();
  for (const incoming of [...(specialist ?? []), ...(general ?? [])]) {
    const id = String(incoming?.id ?? '').trim();
    if (!id) {
      merged.push(incoming);
      continue;
    }
    const existingPosition = positions.get(id);
    if (existingPosition == null) {
      positions.set(id, merged.length);
      merged.push(incoming);
      continue;
    }
    const existing = merged[existingPosition];
    merged[existingPosition] = {
      ...incoming,
      ...existing,
      evidence: uniqueStrings([...(existing.evidence ?? []), ...(incoming.evidence ?? [])]),
    } as T;
  }
  return merged;
}

function moreCautiousHealth(
  first: ReportIntelligence['advisorBrief']['health'],
  second: ReportIntelligence['advisorBrief']['health'],
): ReportIntelligence['advisorBrief']['health'] {
  const rank = { HEALTHY: 0, ATTENTION: 1, REVIEW_REQUIRED: 2 } as const;
  return rank[first] >= rank[second] ? first : second;
}

function mergeFindings(specialist: BusinessFinding[], general: BusinessFinding[]): BusinessFinding[] {
  return mergeEvidenceRecords(specialist, general);
}

function mergeSignals(specialist: ReportSignal[], general: ReportSignal[]): ReportSignal[] {
  return mergeEvidenceRecords(specialist, general);
}

function mergeRecommendations(specialist: ReportRecommendation[], general: ReportRecommendation[]): ReportRecommendation[] {
  return mergeEvidenceRecords(specialist, general);
}

/**
 * Compose the source-agnostic content layer with the applicable specialist layer.
 * The general layer is always retained; specialized interpretation has precedence
 * only for overlapping IDs and specialist-specific summary/brief fields.
 */
export function composeIntelligenceLayers(
  general: ReportIntelligence,
  specialist?: ReportIntelligence | null,
): ReportIntelligence {
  if (!specialist) return general;

  const summaryParts = uniqueStrings([
    specialist.summary,
    general.summary && general.summary !== specialist.summary
      ? 'قراءة عامة للمصدر: ' + general.summary
      : null,
  ]);
  const generalForecastAvailable = general.forecast.status === 'AVAILABLE';
  const specialistForecastAvailable = specialist.forecast.status === 'AVAILABLE';

  return {
    ...general,
    ...specialist,
    businessQuestion: specialist.businessQuestion || general.businessQuestion,
    summary: summaryParts.join('\n\n'),
    signals: mergeSignals(specialist.signals ?? [], general.signals ?? []),
    recommendations: mergeRecommendations(specialist.recommendations ?? [], general.recommendations ?? []),
    findings: mergeFindings(specialist.findings ?? [], general.findings ?? []),
    risks: mergeFindings(specialist.risks ?? [], general.risks ?? []),
    opportunities: mergeFindings(specialist.opportunities ?? [], general.opportunities ?? []),
    forecast: specialistForecastAvailable || !generalForecastAvailable ? specialist.forecast : general.forecast,
    guidance: {
      ...general.guidance,
      ...specialist.guidance,
      focus: specialist.guidance.focus || general.guidance.focus,
      inspect: uniqueStrings([...(specialist.guidance.inspect ?? []), ...(general.guidance.inspect ?? [])]),
      ownerHint: specialist.guidance.ownerHint || general.guidance.ownerHint,
      boundary: uniqueStrings([specialist.guidance.boundary, general.guidance.boundary]).join(' '),
    },
    advisorBrief: {
      ...general.advisorBrief,
      ...specialist.advisorBrief,
      health: moreCautiousHealth(specialist.advisorBrief.health, general.advisorBrief.health),
      topFinding: specialist.advisorBrief.topFinding ?? general.advisorBrief.topFinding,
      topRisk: specialist.advisorBrief.topRisk ?? general.advisorBrief.topRisk,
      topOpportunity: specialist.advisorBrief.topOpportunity ?? general.advisorBrief.topOpportunity,
      recommendedAction: specialist.advisorBrief.recommendedAction ?? general.advisorBrief.recommendedAction,
      ownerHint: specialist.advisorBrief.ownerHint || general.advisorBrief.ownerHint,
      expectedOutcome: specialist.advisorBrief.expectedOutcome ?? general.advisorBrief.expectedOutcome,
      measurement: specialist.advisorBrief.measurement ?? general.advisorBrief.measurement,
      proofRequirement: uniqueStrings([specialist.advisorBrief.proofRequirement, general.advisorBrief.proofRequirement]).join(' '),
    },
  };
}
