export interface FamilyMemberLink { familyId: string; sku: string; approved: boolean; conversionToBase: number; }
export interface FamilyDemandInput { familyId: string; sku: string; requestedUnits: number; fulfilledUnits: number; stockUnits: number; avgDailyDemand: number; forecastDailyDemand: number; unitPrice?: number; customersAffected?: number; }
export interface FamilyDemandAggregate { familyId: string; memberSkus: string[]; requestedUnits: number; fulfilledUnits: number; stockUnits: number; avgDailyDemand: number; forecastDailyDemand: number; fillRate: number; daysOfCover: number; lostUnits: number; lostRevenue: number; customersAffected: number; }

const nonNegative = (n: number | undefined) => Number.isFinite(n) ? Math.max(0, n as number) : 0;

/** Aggregates only merchant-approved family members. Product Family membership alone never implies substitution. */
export function aggregateFamilyDemand(links: FamilyMemberLink[], rows: FamilyDemandInput[]): FamilyDemandAggregate[] {
  const allowed = new Map(links.filter(l => l.approved && l.conversionToBase > 0).map(l => [`${l.familyId}::${l.sku}`, l]));
  const out = new Map<string, FamilyDemandAggregate>();
  for (const row of rows) {
    const link = allowed.get(`${row.familyId}::${row.sku}`);
    if (!link) continue;
    const factor = link.conversionToBase;
    const current = out.get(row.familyId) ?? { familyId: row.familyId, memberSkus: [], requestedUnits: 0, fulfilledUnits: 0, stockUnits: 0, avgDailyDemand: 0, forecastDailyDemand: 0, fillRate: 1, daysOfCover: Number.POSITIVE_INFINITY, lostUnits: 0, lostRevenue: 0, customersAffected: 0 };
    if (!current.memberSkus.includes(row.sku)) current.memberSkus.push(row.sku);
    current.requestedUnits += nonNegative(row.requestedUnits) * factor;
    current.fulfilledUnits += Math.min(nonNegative(row.requestedUnits), nonNegative(row.fulfilledUnits)) * factor;
    current.stockUnits += nonNegative(row.stockUnits) * factor;
    current.avgDailyDemand += nonNegative(row.avgDailyDemand) * factor;
    current.forecastDailyDemand += nonNegative(row.forecastDailyDemand) * factor;
    current.lostUnits += Math.max(0, nonNegative(row.requestedUnits) - nonNegative(row.fulfilledUnits)) * factor;
    current.lostRevenue += Math.max(0, nonNegative(row.requestedUnits) - nonNegative(row.fulfilledUnits)) * nonNegative(row.unitPrice);
    current.customersAffected += Math.floor(nonNegative(row.customersAffected));
    out.set(row.familyId, current);
  }
  for (const value of out.values()) {
    value.fillRate = value.requestedUnits > 0 ? Math.max(0, Math.min(1, value.fulfilledUnits / value.requestedUnits)) : 1;
    const demand = value.forecastDailyDemand || value.avgDailyDemand;
    value.daysOfCover = demand > 0 ? value.stockUnits / demand : Number.POSITIVE_INFINITY;
  }
  return [...out.values()];
}

export function familyReorderNeed(aggregate: FamilyDemandAggregate, leadTimeDays: number, safetyDays: number): number {
  const demand = aggregate.forecastDailyDemand || aggregate.avgDailyDemand;
  if (demand <= 0) return 0;
  const targetDays = Math.max(0, leadTimeDays) + Math.max(0, safetyDays);
  return Math.max(0, Math.ceil(demand * Math.max(0, targetDays - aggregate.daysOfCover)));
}
