export interface FreshnessPolicySource {
  freshness: Record<string, unknown>;
}

export function semanticMetricIsFresh(
  governance: FreshnessPolicySource | null,
  asOf: string | null | undefined,
): 'FRESH' | 'STALE' | 'UNKNOWN' {
  if (!governance || !asOf) return 'UNKNOWN';
  const parsed = Date.parse(asOf);
  if (!Number.isFinite(parsed)) return 'UNKNOWN';
  const minutes = Math.max(0, (Date.now() - parsed) / 60000);
  const maxAge = Number(governance.freshness.maxAgeMinutes);
  if (!Number.isFinite(maxAge) || maxAge < 0) return 'UNKNOWN';
  return minutes <= maxAge ? 'FRESH' : 'STALE';
}
