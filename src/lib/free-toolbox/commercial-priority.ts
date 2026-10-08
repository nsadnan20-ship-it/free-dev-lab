export type CommercialPriority = 'critical' | 'high' | 'medium' | 'low' | 'monitor';

export interface CommercialPriorityInput {
  id: string;
  stockCoverageDays?: number;
  forecastDailyDemand?: number;
  recentAccelerationPct?: number;
  lostUnits?: number;
  affectedCustomers?: number;
  revenueShare?: number;
  profitShare?: number;
  stockValue?: number;
  supplierLeadTimeDays?: number;
  dataConfidence?: number;
}

export interface CommercialPriorityResult {
  id: string;
  score: number;
  priority: CommercialPriority;
  reasons: string[];
  evidence: Record<string, number>;
}

const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, Number.isFinite(n) ? n : 0));
const n = (v: number | undefined) => Number.isFinite(v) ? Math.max(0, v as number) : 0;

/**
 * Evidence-weighted triage only. It does not place orders and never invents missing values.
 * Inputs are normalized to bounded signals so one large monetary value cannot dominate all evidence.
 */
export function rankCommercialPriority(rows: CommercialPriorityInput[]): CommercialPriorityResult[] {
  return rows.map(row => {
    const coverageRisk = row.stockCoverageDays === undefined ? 0 : clamp(1 - row.stockCoverageDays / Math.max(1, n(row.supplierLeadTimeDays) + 14));
    const acceleration = clamp(n(row.recentAccelerationPct) / 100);
    const lostDemand = n(row.lostUnits) > 0 ? clamp(n(row.lostUnits) / Math.max(1, n(row.forecastDailyDemand) * 14)) : 0;
    const customerRisk = clamp(n(row.affectedCustomers) / 20);
    const commercialWeight = clamp(Math.max(n(row.revenueShare), n(row.profitShare)) * 4);
    const confidence = clamp(row.dataConfidence ?? 0);
    const score = Math.round(100 * (coverageRisk * 0.30 + acceleration * 0.18 + lostDemand * 0.22 + customerRisk * 0.12 + commercialWeight * 0.10 + confidence * 0.08));
    const priority: CommercialPriority = score >= 80 ? 'critical' : score >= 60 ? 'high' : score >= 40 ? 'medium' : score >= 20 ? 'low' : 'monitor';
    const reasons: string[] = [];
    if (coverageRisk >= 0.7) reasons.push('low projected stock coverage');
    if (acceleration >= 0.15) reasons.push('demand acceleration');
    if (lostDemand > 0) reasons.push('observed unfulfilled demand');
    if (customerRisk > 0) reasons.push('customers affected');
    if (commercialWeight >= 0.5) reasons.push('material commercial contribution');
    if (!confidence) reasons.push('low evidence confidence');
    return { id: row.id, score, priority, reasons, evidence: { coverageRisk, acceleration, lostDemand, customerRisk, commercialWeight, confidence } };
  }).sort((a, b) => b.score - a.score);
}
