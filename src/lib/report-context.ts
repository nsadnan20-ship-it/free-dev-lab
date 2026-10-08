export type ActiveReportContext = {
  jobId: string;
  sourceHash: string;
  savedAt: number;
};

/**
 * Report context is authoritative only when it is explicit in the current URL.
 * This module intentionally does not persist or restore a global "active report".
 * A previous report must never become the context of a new route implicitly.
 */
export function saveActiveReportContext(_context: Omit<ActiveReportContext, 'savedAt'>): void {
  // Deliberately disabled: persisted global report context is a cross-report
  // contamination vector. Keep the function for source compatibility only.
}

export function readActiveReportContext(): ActiveReportContext | null {
  // Deliberately fail closed. Source-bound routes must receive reportJobId +
  // sourceHash explicitly in their route/search params.
  return null;
}

export function clearActiveReportContext(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem('aghbari.active-report-context.v1');
    window.localStorage.removeItem('aghbari.active-report-context.v1');
  } catch {
    // Best effort cleanup of legacy persisted context.
  }
}
