import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type ReportContextValue = {
  reportJobId: string;
  sourceHash: string;
  setReportContext: (reportJobId: string, sourceHash: string) => void;
};

const STORAGE_KEY = 'aghbari.active-report-context.v1';
const ReportContext = createContext<ReportContextValue | null>(null);

function readStoredContext() {
  if (typeof window === 'undefined') return { reportJobId: '', sourceHash: '' };
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { reportJobId: '', sourceHash: '' };
    const parsed = JSON.parse(raw);
    return {
      reportJobId: typeof parsed?.reportJobId === 'string' ? parsed.reportJobId : '',
      sourceHash: typeof parsed?.sourceHash === 'string' ? parsed.sourceHash : '',
    };
  } catch {
    return { reportJobId: '', sourceHash: '' };
  }
}

export function ReportContextProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState(readStoredContext);
  const setReportContext = useCallback((reportJobId: string, sourceHash: string) => {
    setContext((previous) => {
      if (previous.reportJobId === reportJobId && previous.sourceHash === sourceHash) return previous;
      const next = { reportJobId, sourceHash };
      try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* sessionStorage may be unavailable in restricted contexts. */ }
      return next;
    });
  }, []);
  const value = useMemo<ReportContextValue>(() => ({
    reportJobId: context.reportJobId,
    sourceHash: context.sourceHash,
    setReportContext,
  }), [context, setReportContext]);
  return <ReportContext.Provider value={value}>{children}</ReportContext.Provider>;
}

export function useReportContext() {
  const value = useContext(ReportContext);
  if (!value) throw new Error('useReportContext must be used inside ReportContextProvider');
  return value;
}
