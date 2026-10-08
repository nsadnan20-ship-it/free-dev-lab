export interface SaleEvent { productId: string; date: string; quantity: number; netValue: number; }
export interface VelocityWindow { days: number; quantity: number; value: number; avgDailyQuantity: number; avgDailyValue: number; }
export interface ProductVelocity {
  productId: string;
  windows: { daily: VelocityWindow; weekly: VelocityWindow; monthly: VelocityWindow; halfYear: VelocityWindow; annual: VelocityWindow };
  rankValue: number;
  rankQuantity: number;
  trend: number;
  class: 'top' | 'high' | 'normal' | 'low' | 'inactive';
}

const clamp = (n: number, a = -1, b = 1) => Math.max(a, Math.min(b, n));
const start = (days: number, now = Date.now()) => now - days * 86400000;

function isFiniteNumber(value: number): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validEvents(events: SaleEvent[]): SaleEvent[] {
  return events.filter((event) =>
    typeof event.productId === 'string' &&
    event.productId.trim().length > 0 &&
    Number.isFinite(new Date(event.date).getTime()) &&
    isFiniteNumber(event.quantity) &&
    isFiniteNumber(event.netValue),
  );
}

function window(events: SaleEvent[], days: number, now: number): VelocityWindow {
  const cutoff = start(days, now);
  const rows = events.filter((event) => new Date(event.date).getTime() >= cutoff);
  const quantity = rows.reduce((sum, event) => sum + event.quantity, 0);
  const value = rows.reduce((sum, event) => sum + event.netValue, 0);
  return { days, quantity, value, avgDailyQuantity: quantity / days, avgDailyValue: value / days };
}

export function calculateSalesVelocity(events: SaleEvent[], now = Date.now()): ProductVelocity[] {
  const by = new Map<string, SaleEvent[]>();
  for (const event of validEvents(events)) {
    const list = by.get(event.productId) ?? [];
    list.push(event);
    by.set(event.productId, list);
  }

  const base = Array.from(by.entries()).map(([productId, rows]) => {
    const daily = window(rows, 1, now);
    const weekly = window(rows, 7, now);
    const monthly = window(rows, 30, now);
    const halfYear = window(rows, 182, now);
    const annual = window(rows, 365, now);
    const prior = window(rows, 30, now - 30 * 86400000).avgDailyValue;
    const trend = prior > 0 ? clamp((monthly.avgDailyValue - prior) / prior) : monthly.avgDailyValue > 0 ? 1 : 0;
    return {
      productId,
      windows: { daily, weekly, monthly, halfYear, annual },
      rankValue: annual.value,
      rankQuantity: annual.quantity,
      trend,
      class: 'normal' as const,
    };
  });

  const values = base.map((item) => item.rankValue).sort((a, b) => b - a);
  const quantities = base.map((item) => item.rankQuantity).sort((a, b) => b - a);
  return base.map((item) => {
    const valueIndex = values.indexOf(item.rankValue);
    const quantityIndex = quantities.indexOf(item.rankQuantity);
    const rank = Math.max(valueIndex, quantityIndex);
    const ratio = base.length > 1 ? rank / (base.length - 1) : 0;
    const itemClass: ProductVelocity['class'] =
      item.windows.annual.value === 0 ? 'inactive' :
      ratio <= 0.1 ? 'top' :
      ratio <= 0.3 ? 'high' :
      ratio <= 0.75 ? 'normal' : 'low';
    return { ...item, class: itemClass };
  }).sort((a, b) => b.rankValue - a.rankValue);
}

export function aggregateVelocity(events: SaleEvent[], now = Date.now()) {
  const velocity = calculateSalesVelocity(events, now);
  return {
    products: velocity,
    top: velocity.filter((item) => item.class === 'top'),
    low: velocity.filter((item) => item.class === 'low'),
    inactive: velocity.filter((item) => item.class === 'inactive'),
    totals: {
      dailyValue: velocity.reduce((sum, item) => sum + item.windows.daily.value, 0),
      weeklyValue: velocity.reduce((sum, item) => sum + item.windows.weekly.value, 0),
      monthlyValue: velocity.reduce((sum, item) => sum + item.windows.monthly.value, 0),
      halfYearValue: velocity.reduce((sum, item) => sum + item.windows.halfYear.value, 0),
      annualValue: velocity.reduce((sum, item) => sum + item.windows.annual.value, 0),
    },
  };
}
