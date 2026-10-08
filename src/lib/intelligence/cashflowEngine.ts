export interface CashEvent {
  date: string;
  amount: number;
  direction: 'inflow' | 'outflow';
  counterparty: string;
  category: string;
  priority?: number;
}

export interface LiquidityPlan {
  date: string;
  openingCash: number;
  inflows: number;
  outflows: number;
  closingCash: number;
  minimumReserve: number;
  gap: number;
  actions: Array<{ type: 'collect' | 'pay' | 'defer' | 'reserve'; counterparty: string; amount: number; reason: string }>;
}

export function buildLiquidityPlan(events: CashEvent[], openingCash: number, minimumReserve = 0): LiquidityPlan[] {
  const byDate = new Map<string, CashEvent[]>();
  for (const e of events) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);

  let cash = openingCash;
  return [...byDate.keys()].sort().map(date => {
    const day = byDate.get(date) ?? [];
    const inflows = day.filter(x => x.direction === 'inflow').reduce((s, x) => s + Math.max(0, x.amount), 0);
    const outflows = day.filter(x => x.direction === 'outflow').reduce((s, x) => s + Math.max(0, x.amount), 0);
    const closingCash = cash + inflows - outflows;
    const gap = Math.max(0, minimumReserve - closingCash);
    const actions: LiquidityPlan['actions'] = [];

    if (gap > 0) {
      const collections = day.filter(x => x.direction === 'inflow').sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
      let remaining = gap;
      for (const c of collections) {
        if (remaining <= 0) break;
        const amount = Math.min(c.amount, remaining);
        actions.push({ type: 'collect', counterparty: c.counterparty, amount, reason: 'رفع السيولة فوق الحد الأدنى' });
        remaining -= amount;
      }
      if (remaining > 0) actions.push({ type: 'defer', counterparty: 'الأولوية المالية', amount: remaining, reason: 'فجوة سيولة متوقعة؛ أعد جدولة الالتزامات الأقل أولوية' });
    } else {
      actions.push({ type: 'reserve', counterparty: 'احتياطي السيولة', amount: Math.max(0, closingCash - minimumReserve), reason: 'الحفاظ على هامش أمان نقدي' });
    }

    cash = closingCash;
    return { date, openingCash: cash - inflows + outflows, inflows, outflows, closingCash, minimumReserve, gap, actions };
  });
}
