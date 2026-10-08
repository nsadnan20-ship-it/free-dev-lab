import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from '@/lib/router-compat';
import { ArrowRight, Command, Search, X } from 'lucide-react';
import { NAVIGATION_ITEMS, type NavigationItem, type NavigationSectionId } from '@/lib/navigation-registry';
import { withActiveReportContext } from '@/lib/report-context-url';
import { searchUnifiedKnowledge, type UnifiedSearchResult } from '@/lib/unified-search';

type CommandItem = Pick<NavigationItem, 'label' | 'description' | 'path' | 'keywords' | 'section'>;

const COMMANDS: CommandItem[] = NAVIGATION_ITEMS;

type CommandCategory = 'مركز القرار' | 'العمل والبيانات' | 'التحليل التجاري' | 'الذكاء والاستكشاف' | 'البيانات المرجعية' | 'الإعدادات والتجهيز';

const COMMAND_CATEGORY_LABELS: Record<string, CommandCategory> = {
  'decision-center': 'مركز القرار',
  'data-operations': 'العمل والبيانات',
  analytics: 'التحليل التجاري',
  intelligence: 'الذكاء والاستكشاف',
  reference: 'البيانات المرجعية',
  admin: 'الإعدادات والتجهيز',
};

function commandCategory(section: NavigationSectionId): CommandCategory {
  return COMMAND_CATEGORY_LABELS[section] ?? (section === 'trust' ? 'Trust & Evidence' : 'Reports & Outputs');
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

const RECENT_COMMANDS_KEY = 'aghbari.commandPalette.recent';
const RECENT_LIMIT = 5;

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const [knowledgeResults, setKnowledgeResults] = useState<UnifiedSearchResult[]>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null);

  const recentCommands = useMemo(
    () => recentPaths.map(path => COMMANDS.find(item => item.path === path)).filter((item): item is CommandItem => Boolean(item)),
    [recentPaths],
  );

  const contextScore = useCallback((path: string) => {
    const current = location.pathname;
    if (path === current) return 100;
    if (path !== '/' && current.startsWith(path + '/')) return 80;
    const currentRoot = current.split('/').filter(Boolean)[0];
    const itemRoot = path.split('/').filter(Boolean)[0];
    if (currentRoot && currentRoot === itemRoot) return 45;
    return 0;
  }, [location.pathname]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    const matches = COMMANDS.filter(item =>
      !q || [item.label, item.description, ...item.keywords].join(' ').toLowerCase().includes(q),
    );

    return [...matches].sort((a, b) => {
      if (!q) {
        const recentDelta = Number(recentPaths.includes(b.path)) - Number(recentPaths.includes(a.path));
        if (recentDelta !== 0) return recentDelta;
      }

      const contextDelta = contextScore(b.path) - contextScore(a.path);
      if (contextDelta !== 0) return contextDelta;

      if (q) {
        const aLabel = a.label.toLowerCase();
        const bLabel = b.label.toLowerCase();
        const aPrefix = Number(aLabel.startsWith(q));
        const bPrefix = Number(bLabel.startsWith(q));
        if (aPrefix !== bPrefix) return bPrefix - aPrefix;
      }

      return a.label.localeCompare(b.label, 'ar');
    });
  }, [contextScore, query, recentPaths]);

  const openSearchResult = useCallback((item: UnifiedSearchResult) => {
    navigate(withActiveReportContext(item.path, location.search));
    onClose();
  }, [location.search, navigate, onClose]);

  const openCommand = useCallback((item: CommandItem) => {
    const next = [item.path, ...recentPaths.filter(path => path !== item.path)].slice(0, RECENT_LIMIT);
    setRecentPaths(next);
    try {
      window.localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(next));
    } catch {
      // Optional persistence; navigation remains functional.
    }
    navigate(withActiveReportContext(item.path, location.search));
    onClose();
  }, [location.search, navigate, onClose, recentPaths]);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setQuery('');
    setActive(0);
    try {
      const raw = window.localStorage.getItem(RECENT_COMMANDS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        setRecentPaths(parsed.filter((path): path is string => typeof path === 'string').slice(0, RECENT_LIMIT));
      }
    } catch {
      // Optional persistence; command palette remains functional.
    }
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    return () => {
      document.body.style.overflow = previousOverflow;
      const restoreTarget = restoreFocusRef.current;
      if (restoreTarget?.isConnected) {
        requestAnimationFrame(() => restoreTarget.focus({ preventScroll: true }));
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const normalized = query.trim();
    if (normalized.length < 2) {
      setKnowledgeResults([]);
      setKnowledgeLoading(false);
      setKnowledgeError(null);
      return;
    }
    let activeRequest = true;
    setKnowledgeLoading(true);
    setKnowledgeError(null);
    const timer = window.setTimeout(() => {
      void searchUnifiedKnowledge(normalized)
        .then(results => {
          if (!activeRequest) return;
          setKnowledgeResults(results);
        })
        .catch(error => {
          if (!activeRequest) return;
          setKnowledgeResults([]);
          setKnowledgeError(error instanceof Error ? error.message : 'تعذر الوصول إلى المعرفة المحفوظة');
        })
        .finally(() => {
          if (activeRequest) setKnowledgeLoading(false);
        });
    }, 180);
    return () => {
      activeRequest = false;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'Tab') {
        const root = dialogRef.current;
        if (!root) return;
        const focusable = Array.from(root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActive(value => Math.min(value + 1, Math.max(filtered.length - 1, 0)));
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActive(value => Math.max(value - 1, 0));
      }
      if (event.key === 'Enter' && filtered[active]) {
        event.preventDefault();
        openCommand(filtered[active]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, filtered, onClose, open, openCommand]);

  if (!open) return null;

  const knowledgeKindLabel: Record<UnifiedSearchResult['kind'], string> = {
    SOURCE: 'مصدر', EVIDENCE: 'دليل', RECOMMENDATION: 'توصية', DECISION: 'قرار',
    APPROVAL: 'موافقة', WORK: 'عمل', OUTCOME: 'نتيجة', AUDIT: 'تدقيق',
  };

  return (
    <div className="ag-command-overlay fixed inset-0 z-[100] flex items-start justify-center bg-ink-950/45 px-4 pt-[10vh] backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="لوحة الأوامر">
      <button className="absolute inset-0 cursor-default" aria-label="إغلاق" tabIndex={-1} onClick={onClose} />
      <div ref={dialogRef} className="ag-command-palette relative w-full max-w-3xl overflow-hidden rounded-[18px] border border-ink-200 bg-white shadow-2xl" dir="rtl">
        <div className="ag-command-search flex items-center gap-3 border-b border-ink-100 px-4 py-3.5">
          <Search size={19} className="text-ink-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={event => { setQuery(event.target.value); setActive(0); }}
            placeholder="ابحث عن صفحة أو إجراء..."
            className="min-w-0 flex-1 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400"
            aria-label="البحث في الأغبري"
            aria-autocomplete="list"
            aria-controls="command-results"
            aria-activedescendant={filtered[active] ? `command-option-${active}` : undefined}
          />
          <kbd className="hidden rounded-md border border-ink-200 bg-ink-50 px-2 py-1 text-[10px] text-ink-400 sm:inline-flex" aria-hidden="true">Esc</kbd>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-50 hover:text-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
            aria-label="إغلاق لوحة الأوامر"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>

        <div id="command-results" className="max-h-[65vh] overflow-y-auto p-2" role="listbox" aria-label="نتائج لوحة الأوامر" aria-live="polite">
          {query.trim().length >= 2 && (
            <div className="mb-3 rounded-xl border border-primary-100 bg-primary-50/40 p-2">
              <div className="flex items-center justify-between px-2 pb-2 pt-1">
                <div className="text-[10px] font-black uppercase tracking-wide text-primary-700">المعرفة المرتبطة</div>
                {knowledgeLoading && <span className="text-[10px] text-ink-400">جارٍ البحث...</span>}
              </div>
              {knowledgeError && <div className="px-2 py-2 text-xs text-red-700">تعذر البحث: {knowledgeError}</div>}
              {!knowledgeLoading && !knowledgeError && knowledgeResults.length === 0 && (
                <div className="px-2 py-3 text-xs text-ink-500">لا توجد كيانات محفوظة مطابقة لهذه العبارة.</div>
              )}
              {knowledgeResults.map(item => (
                <button
                  key={`${item.kind}:${item.id}`}
                  type="button"
                  onClick={() => openSearchResult(item)}
                  className="mb-1 flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-right transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                >
                  <span className="mt-0.5 rounded-full bg-white px-2 py-0.5 text-[9px] font-black text-primary-700">{knowledgeKindLabel[item.kind]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink-900">{item.title}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-ink-500">{item.summary}</span>
                  </span>
                  {item.status && <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-[9px] font-bold text-ink-500">{item.status}</span>}
                </button>
              ))}
            </div>
          )}

          {!query.trim() && recentCommands.length > 0 && (
            <div className="mb-2">
              <div className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-wide text-ink-400">الوصول السريع</div>
              <div className="rounded-xl border border-primary-100 bg-primary-50/50 p-1">
                {recentCommands.map(item => {
                  const index = filtered.findIndex(row => row.path === item.path);
                  return (
                    <button
                      key={item.path}
                      type="button"
                      role="option"
                      aria-selected={index === active}
                      onMouseEnter={() => setActive(Math.max(index, 0))}
                      onClick={() => openCommand(item)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-right text-primary-900 transition hover:bg-white"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-primary-700"><Command size={15}/></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{item.label}</span>
                        <span className="block truncate text-[11px] text-primary-700/65">{item.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!query.trim() && (
            <div className="px-3 pb-2 pt-2 text-[10px] font-bold uppercase tracking-wide text-ink-400">مرتبط بما تعمل عليه الآن</div>
          )}

          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-ink-400" role="status">لا توجد نتائج مطابقة</div>
          ) : (
            filtered.map((item, index) => {
              const isCurrent = contextScore(item.path) >= 45;
              return (
                <button
                  key={item.path}
                  id={`command-option-${index}`}
                  role="option"
                  aria-selected={index === active}
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => openCommand(item)}
                  className={`ag-command-result flex w-full items-center gap-3 rounded-xl px-3 py-3 text-right transition ${index === active ? 'ag-command-result-active bg-primary-50 text-primary-900' : 'hover:bg-ink-50'}`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${index === active ? 'bg-primary-100 text-primary-700' : 'bg-ink-100 text-ink-500'}`}><Command size={17}/></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="block min-w-0 truncate text-sm font-semibold">{item.label}</span>
                      <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-[9px] font-bold text-ink-500">{commandCategory(item.section)}</span>
                      {!query.trim() && isCurrent && <span className="shrink-0 rounded-full bg-primary-50 px-2 py-0.5 text-[9px] font-bold text-primary-700">في هذه المساحة</span>}
                    </span>
                    <span className="block truncate text-xs text-ink-400">{item.description}</span>
                  </span>
                  {index === active && <ArrowRight size={16} className="shrink-0 text-primary-500" />}
                </button>
              );
            })
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-ink-100 bg-ink-50/70 px-4 py-2 text-[11px] text-ink-400">
          <span>↑↓ للتنقل</span><span>Enter للفتح</span><span>Esc للإغلاق</span>
        </div>
      </div>
    </div>
  );
}
