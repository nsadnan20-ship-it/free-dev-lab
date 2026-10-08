export type ReplenishmentInput = { demandKg: number; dailyDemandKg: number; stockKg: number; effectiveAlternativeKg: number; leadTimeDays: number; safetyStockDays: number; protectedLiquidity: number; unitCostPerKg: number };
export type ReplenishmentPlan = { netDemandKg: number; reorderPointKg: number; suggestedPurchaseKg: number; purchaseCost: number; liquiditySafe: boolean; risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKED' };

export function optimizeReplenishment(input: ReplenishmentInput): ReplenishmentPlan {
  for (const [key, value] of Object.entries(input)) if (!Number.isFinite(value as number) || (value as number) < 0) throw new Error(`REPLENISHMENT_INPUT_INVALID:${key}`);
  const netDemandKg = Math.max(0, input.demandKg - input.effectiveAlternativeKg);
  const reorderPointKg = input.dailyDemandKg * (input.leadTimeDays + input.safetyStockDays);
  const availableKg = input.stockKg + input.effectiveAlternativeKg;
  const suggestedPurchaseKg = Math.max(0, netDemandKg + reorderPointKg - availableKg);
  const purchaseCost = suggestedPurchaseKg * input.unitCostPerKg;
  const liquiditySafe = purchaseCost <= input.protectedLiquidity;
  const risk = !liquiditySafe ? 'BLOCKED' : suggestedPurchaseKg > netDemandKg * 1.5 ? 'HIGH' : suggestedPurchaseKg > netDemandKg ? 'MEDIUM' : 'LOW';
  return { netDemandKg, reorderPointKg, suggestedPurchaseKg, purchaseCost, liquiditySafe, risk };
}
