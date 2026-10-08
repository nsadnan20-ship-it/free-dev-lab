export type GroupDemandRow = { groupId: string; sku: string; requestedQty: number; fulfilledQty: number; stockQty: number; unitWeightKg?: number; substitutability: number };
export type GroupSubstitutionSummary = { groupId: string; requestedQty: number; fulfilledQty: number; unfulfilledQty: number; stockQty: number; requestedKg: number; stockKg: number; effectiveSupplyKg: number; coverageRatio: number; substitutionGapKg: number };

export function aggregateGroupSubstitution(rows: GroupDemandRow[]): GroupSubstitutionSummary[] {
  const map = new Map<string, GroupSubstitutionSummary>();
  for (const row of rows) {
    if (!row.groupId || !row.sku) throw new Error('GROUP_SUBSTITUTION_SCOPE_REQUIRED');
    if (row.substitutability < 0 || row.substitutability > 1) throw new Error('GROUP_SUBSTITUTABILITY_INVALID');
    const weight = row.unitWeightKg ?? 0;
    const requestedKg = row.requestedQty * weight;
    const stockKg = row.stockQty * weight;
    const effectiveSupplyKg = stockKg * row.substitutability;
    const current = map.get(row.groupId) ?? { groupId: row.groupId, requestedQty: 0, fulfilledQty: 0, unfulfilledQty: 0, stockQty: 0, requestedKg: 0, stockKg: 0, effectiveSupplyKg: 0, coverageRatio: 0, substitutionGapKg: 0 };
    current.requestedQty += row.requestedQty;
    current.fulfilledQty += row.fulfilledQty;
    current.unfulfilledQty += Math.max(0, row.requestedQty - row.fulfilledQty);
    current.stockQty += row.stockQty;
    current.requestedKg += requestedKg;
    current.stockKg += stockKg;
    current.effectiveSupplyKg += effectiveSupplyKg;
    map.set(row.groupId, current);
  }
  for (const summary of map.values()) {
    summary.coverageRatio = summary.requestedKg === 0 ? 0 : Math.min(1, summary.effectiveSupplyKg / summary.requestedKg);
    summary.substitutionGapKg = Math.max(0, summary.requestedKg - summary.effectiveSupplyKg);
  }
  return [...map.values()];
}
