export interface DemandPointLike { date: string; quantity: number; sales: number }

export function clampAnalysisDays(days: number, min = 1, max = 730): number {
  if (!Number.isFinite(days)) return 180;
  return Math.min(max, Math.max(min, Math.floor(days)));
}

function isValidPoint(point: DemandPointLike): boolean {
  return Number.isFinite(new Date(point.date).getTime()) && Number.isFinite(point.quantity) && Number.isFinite(point.sales);
}

export function aggregateDemandPoints(points: DemandPointLike[], days: number) {
  const safeDays = clampAnalysisDays(days);
  const byDay = new Map<string, DemandPointLike>();
  for (const point of points.filter(isValidPoint)) {
    const date = point.date.slice(0, 10);
    const current = byDay.get(date);
    if (current) {
      current.quantity += point.quantity;
      current.sales += point.sales;
    } else {
      byDay.set(date, { date, quantity: point.quantity, sales: point.sales });
    }
  }
  const ordered = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  const totalQuantity = ordered.reduce((sum, point) => sum + point.quantity, 0);
  const totalSales = ordered.reduce((sum, point) => sum + point.sales, 0);
  const averageDaily = totalQuantity / safeDays;
  const peakDaily = Math.max(0, ...ordered.map((point) => point.quantity));
  const half = Math.max(1, Math.floor(ordered.length / 2));
  const first = ordered.slice(0, half).reduce((sum, point) => sum + point.quantity, 0) / half;
  const last = ordered.slice(-half).reduce((sum, point) => sum + point.quantity, 0) / half;
  const trend = first > 0 ? (last - first) / first : last > 0 ? 1 : 0;
  return { points: ordered, totalQuantity, totalSales, averageDaily, peakDaily, trend };
}
