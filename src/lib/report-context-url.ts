const REPORT_CONTEXT_PATHS = [
  '/command-center',
  '/decision-inbox',
  '/decision-experience',
  '/advisor-cases',
  '/trust',
  '/intelligence',
  '/work-center',
  '/operations',
  '/replay',
  '/benchmark',
  '/metrics',
  '/reports/executive',
  '/reports/sales',
  '/reports/purchases',
  '/reports/inventory',
  '/reports/inventory-intelligence',
  '/reports/demand-velocity',
  '/reports/receivables',
  '/reports/profitability',
  '/analytics',
  '/data-quality',
] as const;

function isReportContextPath(pathname: string): boolean {
  return REPORT_CONTEXT_PATHS.some((path) => pathname === path || pathname.startsWith(path + '/'));
}

/**
 * Carry the exact active report lineage into product surfaces that must remain
 * source-bound. Existing target query params (for example decision stage) are
 * preserved.
 */
export function withActiveReportContext(path: string, currentSearch: string): string {
  const querySeparator = path.indexOf('?');
  const pathname = querySeparator >= 0 ? path.slice(0, querySeparator) : path;
  const targetQuery = new URLSearchParams(querySeparator >= 0 ? path.slice(querySeparator + 1) : '');
  if (!isReportContextPath(pathname)) return path;

  const currentQuery = new URLSearchParams(currentSearch);
  const reportJobId = currentQuery.get('reportJobId')?.trim() || '';
  const sourceHash = currentQuery.get('sourceHash')?.trim() || '';
  if (!reportJobId || !/^sha256:[0-9a-fA-F]{64}$/.test(sourceHash)) return path;

  targetQuery.set('reportJobId', reportJobId);
  targetQuery.set('sourceHash', sourceHash);
  const serialized = targetQuery.toString();
  return serialized ? pathname + '?' + serialized : pathname;
}
