export const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
export const mean = (a: number[]) => (a.length ? sum(a) / a.length : 0);
export function std(a: number[]) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - 1));
}
export function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}
export function median(a: number[]) { return quantile([...a].sort((x, y) => x - y), 0.5); }
export function mad(a: number[]) { const m = median(a); return median(a.map((x) => Math.abs(x - m))); }
export function skewness(a: number[]) {
  const s = std(a), m = mean(a);
  if (!s || a.length < 3) return 0;
  return mean(a.map((x) => ((x - m) / s) ** 3));
}
export function pearson(x: number[], y: number[]) {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  const mx = mean(x), my = mean(y);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { const a = x[i]! - mx, b = y[i]! - my; num += a * b; dx += a * a; dy += b * b; }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}
export function ols(y: number[]) {
  const n = y.length, xs = y.map((_, i) => i);
  const mx = mean(xs), my = mean(y);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i]! - mx) * (y[i]! - my); den += (xs[i]! - mx) ** 2; }
  const slope = den ? num / den : 0, intercept = my - slope * mx;
  const fit = xs.map((x) => intercept + slope * x);
  const ssr = sum(y.map((v, i) => (v - fit[i]!) ** 2)), sst = sum(y.map((v) => (v - my) ** 2));
  return { slope, intercept, r2: sst ? 1 - ssr / sst : 0 };
}
/** Holt's linear exponential smoothing with simple grid-searched parameters. */
export function holt(y: number[], horizon: number) {
  let best = { a: 0.5, b: 0.3, sse: Infinity, fitted: [] as number[] };
  for (const a of [0.2, 0.4, 0.6, 0.8]) for (const b of [0.1, 0.2, 0.4]) {
    let l = y[0]!, t = (y[1]! - y[0]!) || 0, sse = 0; const fitted = [y[0]!];
    for (let i = 1; i < y.length; i++) {
      const f = l + t; fitted.push(f); sse += (y[i]! - f) ** 2;
      const nl = a * y[i]! + (1 - a) * (l + t); t = b * (nl - l) + (1 - b) * t; l = nl;
    }
    if (sse < best.sse) best = { a, b, sse, fitted };
  }
  let l = y[0]!, t = (y[1]! - y[0]!) || 0;
  for (let i = 1; i < y.length; i++) { const nl = best.a * y[i]! + (1 - best.a) * (l + t); t = best.b * (nl - l) + (1 - best.b) * t; l = nl; }
  const resid = y.slice(1).map((v, i) => v - best.fitted[i + 1]!);
  const sigma = std(resid);
  const mape = mean(y.slice(1).map((v, i) => (v ? Math.abs((v - best.fitted[i + 1]!) / v) : 0)));
  const forecast = Array.from({ length: horizon }, (_, h) => {
    const point = l + t * (h + 1), w = 1.96 * sigma * Math.sqrt(h + 1);
    return { point, lo: point - w, hi: point + w };
  });
  return { forecast, alpha: best.a, beta: best.b, sigma, mape };
}
export function fmt(n: number | null | undefined, digits = 0) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: digits }).format(n);
}
export function pct(n: number, digits = 1) { return `${fmt(n * 100, digits)}%`; }
