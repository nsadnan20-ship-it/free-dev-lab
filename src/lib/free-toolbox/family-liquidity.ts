export interface FamilyLiquidityInput {
  familyId: string;
  salesUnits: number;
  salesRevenue: number;
  grossProfit?: number;
  stockValue?: number;
  inventoryDays?: number;
  cashCycleDays?: number;
}

export interface FamilyLiquiditySignal {
  familyId: string;
  revenue: number;
  grossProfit: number | null;
  stockValue: number | null;
  revenueShare: number | null;
  profitShare: number | null;
  capitalIntensity: number | null;
  liquidityRole: 'cash_generator' | 'capital_tied' | 'balanced' | 'insufficient_data';
  evidence: string[];
}

function finiteOptional(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) ? value : null;
}

export function analyzeFamilyLiquidity(rows: FamilyLiquidityInput[]): FamilyLiquiditySignal[] {
  const grouped = new Map<string, { revenue: number; profit: number | null; stock: number | null }>();
  for (const row of rows) {
    if (!row.familyId.trim() || !Number.isFinite(row.salesRevenue)) continue;
    const current = grouped.get(row.familyId) ?? { revenue: 0, profit: null, stock: null };
    current.revenue += row.salesRevenue;
    const profit = finiteOptional(row.grossProfit);
    const stock = finiteOptional(row.stockValue);
    if (profit !== null) current.profit = (current.profit ?? 0) + profit;
    if (stock !== null) current.stock = (current.stock ?? 0) + stock;
    grouped.set(row.familyId, current);
  }

  const totalRevenue = [...grouped.values()].reduce((sum, value) => sum + value.revenue, 0);
  const totalProfit = [...grouped.values()].reduce((sum, value) => sum + (value.profit ?? 0), 0);
  const hasProfit = [...grouped.values()].some((value) => value.profit !== null);

  return [...grouped.entries()].map(([familyId, value]) => {
    const capitalIntensity = value.stock !== null && value.revenue > 0 ? value.stock / value.revenue : null;
    let liquidityRole: FamilyLiquiditySignal['liquidityRole'] = 'insufficient_data';
    if (capitalIntensity !== null && value.revenue > 0) {
      if (capitalIntensity <= 0.25) liquidityRole = 'cash_generator';
      else if (capitalIntensity >= 0.75) liquidityRole = 'capital_tied';
      else liquidityRole = 'balanced';
    }

    const evidence = [`revenue=${value.revenue}`];
    if (value.stock !== null) evidence.push(`stock_value=${value.stock}`);
    if (value.profit !== null) evidence.push(`gross_profit=${value.profit}`);
    if (capitalIntensity !== null) evidence.push(`stock_value/revenue=${capitalIntensity.toFixed(3)}`);

    return {
      familyId,
      revenue: value.revenue,
      grossProfit: value.profit,
      stockValue: value.stock,
      revenueShare: totalRevenue > 0 ? value.revenue / totalRevenue : null,
      profitShare: hasProfit && totalProfit > 0 && value.profit !== null ? value.profit / totalProfit : null,
      capitalIntensity,
      liquidityRole,
      evidence,
    };
  });
}
