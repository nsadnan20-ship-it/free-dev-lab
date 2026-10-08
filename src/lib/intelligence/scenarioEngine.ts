export type ScenarioKind = 'PRICE_UP' | 'PRICE_DOWN' | 'COST_UP' | 'SALES_DOWN' | 'COLLECTION_DOWN' | 'INVENTORY_CHANGE' | 'DEMAND_CHANGE';
export interface ScenarioInput { kind: ScenarioKind; pct: number; label?: string; }
export interface ScenarioResult { kind: ScenarioKind; baseline: { revenue: number; cost: number; grossProfit: number; cash: number }; scenario: { revenue: number; cost: number; grossProfit: number; cash: number }; delta: { revenue: number; cost: number; grossProfit: number; cash: number }; deltaPct: { revenue: number | null; cost: number | null; grossProfit: number | null; cash: number | null }; assumptions: string[]; confidence: number; reversible: boolean; status: 'READY' | 'INVALID'; }

const pct = (n: number) => Number.isFinite(n) ? n / 100 : 0;
const deltaPct = (base: number, next: number) => base === 0 ? null : (next - base) / Math.abs(base) * 100;

export function runScenario(input: { baseline: { revenue: number; cost: number; grossProfit?: number; cash: number }; changes: ScenarioInput[] }): ScenarioResult[] {
  const base = { revenue: Math.max(0, input.baseline.revenue), cost: Math.max(0, input.baseline.cost), grossProfit: input.baseline.grossProfit ?? input.baseline.revenue - input.baseline.cost, cash: Math.max(0, input.baseline.cash) };
  return input.changes.map(change => {
    const changePct = pct(change.pct);
    const next = { ...base };
    if (!Number.isFinite(change.pct) || change.pct < -100) return { kind: change.kind, baseline: base, scenario: base, delta: { revenue: 0, cost: 0, grossProfit: 0, cash: 0 }, deltaPct: { revenue: 0, cost: 0, grossProfit: 0, cash: 0 }, assumptions: [], confidence: 0, reversible: true, status: 'INVALID' };
    switch (change.kind) {
      case 'PRICE_UP': case 'PRICE_DOWN': case 'DEMAND_CHANGE': case 'SALES_DOWN':
        next.revenue = base.revenue * (1 + changePct); break;
      case 'COST_UP':
        next.cost = base.cost * (1 + changePct); break;
      case 'COLLECTION_DOWN':
        next.cash = base.cash * (1 - Math.abs(changePct)); break;
      case 'INVENTORY_CHANGE':
        next.cash = base.cash * (1 - changePct); break;
    }
    next.grossProfit = next.revenue - next.cost;
    if (change.kind === 'COST_UP') next.cash = base.cash - Math.max(0, next.cost - base.cost);
    const assumptions = [change.label ?? change.kind, `التغير: ${change.pct}%`, 'السيناريو حتمي ولا يمثل تنبؤًا احتماليًا.'];
    return { kind: change.kind, baseline: base, scenario: next, delta: { revenue: next.revenue - base.revenue, cost: next.cost - base.cost, grossProfit: next.grossProfit - base.grossProfit, cash: next.cash - base.cash }, deltaPct: { revenue: deltaPct(base.revenue, next.revenue), cost: deltaPct(base.cost, next.cost), grossProfit: deltaPct(base.grossProfit, next.grossProfit), cash: deltaPct(base.cash, next.cash) }, assumptions, confidence: 0.9, reversible: true, status: 'READY' };
  });
}
