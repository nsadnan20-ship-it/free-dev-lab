import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CheckCircle2, Command, Menu, Search, Upload, WifiOff, AlertTriangle, ChevronLeft, X } from 'lucide-react';
import { Link, useLocation } from '@/lib/router-compat';
import { LanguageToggle } from './LanguageToggle';
import { useLanguage } from '@/lib/language';
import type { Alert } from '@/lib/types';
import { SeverityBadge } from './ui/Badge';
import { relativeTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { NAVIGATION_SECTIONS, resolveNavigationItem } from '@/lib/navigation-registry';

type HealthState = 'checking' | 'healthy' | 'degraded' | 'offline';

export function Header({
  alerts,
  onMarkAlertRead,
  onMenuClick,
  onOpenCommandPalette,
}: {
  alerts: Alert[];
  onMarkAlertRead: (id: string) => void;
  onMenuClick: () => void;
  onOpenCommandPalette: () => void;
}) {
  const { language } = useLanguage();
  const [showAlerts, setShowAlerts] = useState(false);
  const alertTriggerRef = useRef<HTMLButtonElement>(null);
  const alertPanelRef = useRef<HTMLDivElement>(null);
  const alertRestoreFocusRef = useRef<HTMLElement | null>(null);
  const [health, setHealth] = useState<HealthState>('checking');
  const location = useLocation();
  const unreadAlerts = alerts.filter((alert) => !alert.is_read);

  const currentNavigation = useMemo(() => resolveNavigationItem(location.pathname), [location.pathname]);
  const currentLabel = currentNavigation ? (language === 'ar' ? currentNavigation.label : currentNavigation.enLabel) : 'الأغبري';
  const currentSection = useMemo(() => {
    const section = NAVIGATION_SECTIONS.find(item => item.id === currentNavigation?.section);
    return section ? (language === 'ar' ? section.title : section.enTitle) : 'Aghbari';
  }, [currentNavigation?.section, language]);

  useEffect(() => {
    if (!showAlerts) return;
    alertRestoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setShowAlerts(false);
        return;
      }
      const isTab = event.key === 'Tab';
      if (!isTab) return;
      const root = alertPanelRef.current;
      if (!root) return;
      const focusable = Array.from(root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
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
    };
    window.addEventListener('keydown', handleKeyDown);
    requestAnimationFrame(() => alertPanelRef.current?.querySelector<HTMLElement>('button[aria-label="إغلاق التنبيهات"]')?.focus({ preventScroll: true }));
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      const restoreTarget = alertRestoreFocusRef.current;
      if (restoreTarget?.isConnected) requestAnimationFrame(() => restoreTarget.focus({ preventScroll: true }));
    };
  }, [showAlerts]);

  useEffect(() => {
    let mounted = true;
    const checkHealth = async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (!mounted) return;
        if (sessionError || !sessionData.session) {
          setHealth('offline');
          return;
        }
        const { data: companyId, error: tenantError } = await supabase.rpc('current_company_id');
        if (!mounted) return;
        if (tenantError) {
          setHealth('degraded');
        } else {
          setHealth(companyId ? 'healthy' : 'degraded');
        }
      } catch {
        if (mounted) setHealth('offline');
      }
    };

    void checkHealth();
    const timer = window.setInterval(checkHealth, 60000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const healthLabel =
    health === 'healthy' ? 'متصل' :
    health === 'offline' ? 'غير متصل' :
    health === 'degraded' ? 'متأثر' :
    'فحص';

  const HealthIcon =
    health === 'healthy' ? CheckCircle2 :
    health === 'offline' ? WifiOff :
    AlertTriangle;

  const healthClass =
    health === 'healthy' ? 'text-primary-600' :
    health === 'checking' ? 'text-ink-400' :
    'text-warning-600';

  return (
    <header className="ag-topbar sticky top-0 z-30 border-b border-ink-200 bg-white">
      <div className="flex h-[60px] items-center gap-2.5 px-3 sm:px-4 lg:px-5">
        <button onClick={onMenuClick} className="min-h-11 min-w-11 rounded-[8px] p-2 text-ink-500 hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 xl:hidden" aria-label="فتح القائمة">
          <Menu size={19} />
        </button>

        <div className="hidden min-w-0 items-center gap-2 text-[10px] text-ink-400 md:flex">
          <span className="font-black text-ink-500">الأغبري</span>
          <ChevronLeft size={12} className="text-ink-300" />
          <span className="ag-top-section">{currentSection}</span>
          <ChevronLeft size={11} className="text-ink-300" />
          <span className="truncate font-black text-ink-900">{currentLabel}</span>
        </div>

        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="ag-top-search mx-auto flex h-11 w-full max-w-[470px] items-center gap-2.5 rounded-[10px] border border-ink-200 bg-ink-50/70 px-3.5 text-right text-xs text-ink-400 hover:border-primary-300 hover:bg-white"
          aria-label="فتح البحث ولوحة الأوامر"
        >
          <Search size={16} className="text-ink-500" />
          <span className="flex-1 truncate">ابحث في المؤشرات أو المستندات أو التقارير…</span>
          <kbd className="hidden items-center rounded-md border border-ink-200 bg-white px-1.5 py-0.5 text-[9px] font-bold text-ink-400 sm:inline-flex">
            <Command size={10} /> K
          </kbd>
        </button>

        <div className="flex items-center gap-0.5">
          <LanguageToggle />
          <Link to="/import" className="flex min-h-11 min-w-11 items-center justify-center rounded-[8px] p-2 text-ink-500 hover:bg-ink-100 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400" title="استيراد" aria-label="استيراد">
            <Upload size={17} />
          </Link>

          <div className="relative">
            <button
              ref={alertTriggerRef}
              type="button"
              onClick={() => setShowAlerts((value) => !value)}
              className="relative flex min-h-11 min-w-11 items-center justify-center rounded-[8px] p-2 text-ink-500 hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
              aria-label={'التنبيهات، ' + unreadAlerts.length + ' غير مقروء'}
              aria-expanded={showAlerts}
              aria-controls="ag-alert-panel"
              aria-haspopup="dialog"
            >
              <Bell size={17} />
              {unreadAlerts.length > 0 && (
                <span className="absolute -left-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-600 px-1 text-[9px] font-black text-white">
                  {unreadAlerts.length}
                </span>
              )}
            </button>

            {showAlerts && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowAlerts(false)} />
                <div ref={alertPanelRef} id="ag-alert-panel" role="dialog" aria-modal="true" aria-label="التنبيهات" className="ag-alert-panel absolute left-0 z-50 mt-1.5 w-80 overflow-hidden rounded-[12px] border border-ink-200 bg-white shadow-elevated">
                  <div className="ag-alert-head flex items-center justify-between border-b border-ink-100 px-4 py-3">
                    <div className="min-w-0">
                      <span className="block text-sm font-black text-ink-900">الانتباه</span>
                      <span className="mt-0.5 block text-[10px] text-ink-400">{unreadAlerts.length} غير مقروء</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAlerts(false)}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-50 hover:text-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                      aria-label="إغلاق التنبيهات"
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  </div>

                  {alerts.length === 0 ? (
                    <div className="p-6 text-center text-sm text-ink-400">لا توجد تنبيهات</div>
                  ) : (
                    <div className="max-h-96 divide-y divide-ink-100 overflow-y-auto">
                      {alerts.map((alert) => (
                        <button
                          type="button"
                          key={alert.id}
                          onClick={() => onMarkAlertRead(alert.id)}
                          className={'w-full p-3.5 text-right transition-colors hover:bg-ink-50 ' + (!alert.is_read ? 'bg-primary-50/40 ring-1 ring-inset ring-primary-100' : '')}
                        >
                          <div className="flex items-start gap-2">
                            <SeverityBadge severity={alert.severity} />
                            <span className="mr-auto text-[10px] text-ink-400">{relativeTime(alert.created_at)}</span>
                          </div>
                          <div className="mt-1.5 text-[13px] font-bold text-ink-800">{alert.title}</div>
                          {alert.description && <div className="mt-1 text-[11px] leading-5 text-ink-500">{alert.description}</div>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="hidden items-center gap-2 border-r border-ink-200 pr-2.5 lg:flex">
            <div className="ag-health-pill flex items-center gap-1.5" role="status" aria-live="polite" title={healthLabel}>
              <HealthIcon size={14} className={healthClass} />
              <span className="text-[11px] font-semibold text-ink-500">{healthLabel}</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
