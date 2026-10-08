import { Component, type ErrorInfo, type ReactNode, useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from '@/lib/router-compat';
import type { User } from '@supabase/supabase-js';
import { Header } from '@/components/Header';
import { LanguageProvider, useLanguage } from '@/lib/language';
import { AuthGate } from '@/components/AuthGate';
import { CommandPalette } from '@/components/CommandPalette';
import { ProductJourneyNav } from '@/components/ProductJourneyNav';
import { DeterministicIntelligenceAssistant } from '@/components/DeterministicIntelligenceAssistant';
import { DashboardPage } from '@/views/DashboardPage';
const ScenarioTruthGuardPage = lazy(() => import('@/views/ScenarioTruthGuardPage').then(m => ({ default: m.ScenarioTruthGuardPage })));
import { markAlertRead } from '@/lib/queries';
import { fetchDashboardIntelligence } from '@/lib/dashboard-canonical';
import { getAuthenticatedUser } from '@/lib/auth-session';
import type { Alert } from '@/lib/types';
import { AlertTriangle, BarChart3, BrainCircuit, ClipboardCheck, Home, RefreshCw, Search, Upload, X } from 'lucide-react';
import { FeedbackHost, notifyFeedback } from '@/components/ui/Feedback';
import { ReportSourceContext } from '@/components/ReportSourceContext';
import { ReportContextProvider } from '@/components/ReportContext';
import { isWorkspacePathVisible, readWorkspaceMode, readWorkspacePreferences } from '@/lib/workspace-mode';
import { resolveNavigationItem } from '@/lib/navigation-registry';
import { withActiveReportContext } from '@/lib/report-context-url';
const Sidebar = lazy(() => import('@/components/Sidebar').then(m => ({ default: m.Sidebar })));
const ImportPage = lazy(() => import('@/views/ImportPage').then(m => ({ default: m.ImportPage })));
const ExternalFileAnalysisPage = lazy(() => import('@/views/ExternalFileAnalysisPage').then(m => ({ default: m.ExternalFileAnalysisPage })));
const ReportsCenterPage = lazy(() => import('@/views/ReportsPage').then(m => ({ default: m.ReportsCenterPage })));
const SmartReportPage = lazy(() => import('@/views/SmartReportPage').then(m => ({ default: m.SmartReportPage })));
const SalesReportPage = lazy(() => import('@/views/ReportsPage').then(m => ({ default: m.SalesReportPage })));
const PurchasesReportPage = lazy(() => import('@/views/ReportsPage').then(m => ({ default: m.PurchasesReportPage })));
const InventoryReportPage = lazy(() => import('@/views/ReportsPage').then(m => ({ default: m.InventoryReportPage })));
const InventoryIntelligencePage = lazy(() => import('@/views/InventoryIntelligencePage').then(m => ({ default: m.InventoryIntelligencePage })));
const DemandVelocityPage = lazy(() => import('@/views/DemandVelocityPage').then(m => ({ default: m.DemandVelocityPage })));
const ReceivablesReportPage = lazy(() => import('@/views/ReceivablesReportCanonicalPage').then(m => ({ default: m.ReceivablesReportCanonicalPage })));
const ProfitabilityReportPage = lazy(() => import('@/views/ProfitabilityReportCanonicalPage').then(m => ({ default: m.ProfitabilityReportCanonicalPage })));
const AnalyticsCenterPage = lazy(() => import('@/views/AnalyticsPage').then(m => ({ default: m.AnalyticsCenterPage })));
const RFMAnalysisPage = lazy(() => import('@/views/AnalyticsPage').then(m => ({ default: m.RFMAnalysisPage })));
const ABCAnalysisPage = lazy(() => import('@/views/AnalyticsPage').then(m => ({ default: m.ABCAnalysisPage })));
const AgingAnalysisPage = lazy(() => import('@/views/AnalyticsPage').then(m => ({ default: m.AgingAnalysisPage })));
const LiquidityPage = lazy(() => import('@/views/LiquidityPage').then(m => ({ default: m.LiquidityPage })));
const SuppliersPage = lazy(() => import('@/views/SuppliersPage').then(m => ({ default: m.SuppliersPage })));
const IntelligenceCenterPage = lazy(() => import('@/views/IntelligencePage').then(m => ({ default: m.IntelligenceCenterPage })));
const RecommendationsPage = lazy(() => import('@/views/IntelligencePage').then(m => ({ default: m.RecommendationsPage })));
const ForecastsPage = lazy(() => import('@/views/IntelligencePage').then(m => ({ default: m.ForecastsPage })));
const CustomersPage = lazy(() => import('@/views/EntityPages').then(m => ({ default: m.CustomersPage })));
const ProductsPage = lazy(() => import('@/views/EntityPages').then(m => ({ default: m.ProductsPage })));
const InventoryPage = lazy(() => import('@/views/EntityPages').then(m => ({ default: m.InventoryPage })));
const DataQualityPage = lazy(() => import('@/views/DataQualitySnapshotPage').then(m => ({ default: m.DataQualitySnapshotPage })));
const CompanySettingsPage = lazy(() => import('@/views/CompanySettingsPage').then(m => ({ default: m.CompanySettingsPage })));
const ProfileSettingsPage = lazy(() => import('@/views/ProfileSettingsPage').then(m => ({ default: m.ProfileSettingsPage })));
const ExecutiveCommandCenterPage = lazy(() => import('@/views/ExecutiveCommandCenterPage').then(m => ({ default: m.ExecutiveCommandCenterPage })));
const DecisionInboxPage = lazy(() => import('@/views/DecisionInboxPage').then(m => ({ default: m.DecisionInboxPage })));
const AlternativeGroupsPage = lazy(() => import('@/views/AlternativeGroupsPage').then(m => ({ default: m.AlternativeGroupsPage })));
const DecisionExperiencePage = lazy(() => import('@/views/DecisionExperiencePage').then(m => ({ default: m.DecisionExperiencePage })));
const AdvisorCasesPage = lazy(() => import('@/views/AdvisorCasesPage').then(m => ({ default: m.AdvisorCasesPage })));
const ExecutiveReportPage = lazy(() => import('@/views/ExecutiveReportPage').then(m => ({ default: m.ExecutiveReportPage })));
const MetricInspectorPage = lazy(() => import('@/views/MetricInspectorPage').then(m => ({ default: m.MetricInspectorPage })));
const ProposalDemoPage = lazy(() => import('@/views/ProposalDemoPage').then(m => ({ default: m.ProposalDemoPage })));
const PublicSmartReportDemoPage = lazy(() => import('@/views/PublicSmartReportDemoPage').then(m => ({ default: m.PublicSmartReportDemoPage })));
const OnboardingPage = lazy(() => import('@/views/OnboardingPage').then(m => ({ default: m.OnboardingPage })));
const WorkCenterPage = lazy(() => import('@/views/WorkCenterPage').then(m => ({ default: m.WorkCenterPage })));
const OperationsPage = lazy(() => import('@/views/OperationsPage').then(m => ({ default: m.OperationsPage })));
const ConnectionsPage = lazy(() => import('@/views/ConnectionsPage').then(m => ({ default: m.ConnectionsPage })));
const TrustEvidencePage = lazy(() => import('@/views/TrustEvidencePage').then(m => ({ default: m.TrustEvidencePage })));
const MasterDataHubPage = lazy(() => import('@/views/MasterDataHubPage').then(m => ({ default: m.MasterDataHubPage })));
const BusinessReplayPage = lazy(() => import('@/views/BusinessReplayPage').then(m => ({ default: m.BusinessReplayPage })));
const BenchmarkPage = lazy(() => import('@/views/BenchmarkPage').then(m => ({ default: m.BenchmarkPage })));
class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; errorMessage?: string }> {
  state = { hasError: false, errorMessage: undefined as string | undefined };
  static getDerivedStateFromError(error: Error): { hasError: boolean; errorMessage: string } {
    return { hasError: true, errorMessage: error?.stack || error?.message || String(error) };
  }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[AppErrorBoundary]', error, info); }
  handleRetry = () => { this.setState({ hasError: false, errorMessage: undefined }); };
  render() {
    if (!this.state.hasError) return this.props.children;
    const preview = typeof window !== 'undefined' && (window.location.hostname.endsWith('--aghbari-report-advisor.netlify.app') || new URLSearchParams(window.location.search).get('demo') === '1');
    return <div dir="rtl" className="min-h-screen bg-[#f6f7fb] flex items-center justify-center p-6"><div className="relative w-full max-w-2xl overflow-hidden rounded-[24px] border border-slate-700 bg-[#0b1020] p-8 text-right text-white shadow-[0_30px_80px_-44px_rgba(15,23,42,.78)]"><div className="relative z-10"><div className="text-[9px] font-black tracking-[.14em] text-indigo-200">AGHBARI · RECOVERY</div><h1 className="mt-2 text-xl font-black">تعذر عرض هذه المساحة</h1><p className="mt-2 text-sm leading-6 text-slate-300">تعذر عرض هذه الشاشة الحالية.</p>{preview && this.state.errorMessage ? <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-red-400/30 bg-red-950/30 p-4 text-left text-xs text-red-100">{this.state.errorMessage}</pre> : null}<div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row"><button type="button" onClick={this.handleRetry} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-black text-white hover:bg-indigo-400"><RefreshCw size={16} /> المحاولة مرة أخرى</button><Link to="/" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/10"><Home size={16} /> مركز القرار</Link></div></div></div></div>;
  }
}
function MobileActionBar({ onOpenCommandPalette, onOpenAdvisor, advisorOpen }: { onOpenCommandPalette: () => void; onOpenAdvisor: () => void; advisorOpen: boolean }) {
  const location = useLocation();
  const items = [
    { path: '/', icon: Home },
    { path: '/import', icon: Upload },
    { path: '/decision-experience', icon: ClipboardCheck },
    { path: '/reports', icon: BarChart3 },
  ];
  return (
    <nav aria-label="إجراءات الهاتف الرئيسية" className="ag-mobile-bar fixed inset-x-3 bottom-3 z-40 rounded-[16px] border border-ink-200/90 bg-white/95 p-1.5 shadow-elevated backdrop-blur xl:hidden" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 6px)' }}>
      <div className="grid grid-cols-6 gap-1">
        {items.map(({ path, icon: Icon }) => {
          const label = resolveNavigationItem(path)?.label ?? path;
          const active = location.pathname === path || (path !== '/' && location.pathname.startsWith(path + '/'));
          return (
            <Link
              key={path}
              to={withActiveReportContext(path, location.search)}
              className={"ag-mobile-item flex min-h-12 flex-col items-center justify-center gap-1 rounded-[11px] px-1 text-[10px] font-bold transition-colors " + (active ? "ag-mobile-item-active text-primary-800" : "text-ink-500 hover:bg-ink-50 hover:text-ink-900")}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={17} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onOpenAdvisor}
          className="ag-mobile-advisor ag-mobile-item flex min-h-12 flex-col items-center justify-center gap-1 rounded-[11px] px-1 text-[10px] font-black text-primary-800 transition-colors hover:bg-primary-50"
          aria-expanded={advisorOpen}
          aria-label="فتح المستشار الأغبري"
        >
          <BrainCircuit size={17} aria-hidden="true" />
          <span>المستشار</span>
        </button>
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="ag-mobile-search ag-mobile-item flex min-h-12 flex-col items-center justify-center gap-1 rounded-[11px] px-1 text-[10px] font-bold transition-colors hover:bg-ink-50 hover:text-ink-900"
          aria-label="فتح البحث ولوحة الأوامر"
        >
          <Search size={17} aria-hidden="true" />
          <span>بحث</span>
        </button>
      </div>
    </nav>
  );
}

function NotFoundPage() { return <div dir="rtl" className="min-h-[60vh] flex items-center justify-center p-6"><div className="w-full max-w-lg rounded-2xl border border-ink-100 bg-white p-8 shadow-sm text-center"><div className="text-5xl font-black text-primary-600">404</div><h1 className="mt-3 text-xl font-bold text-ink-900">الصفحة غير موجودة</h1><p className="mt-2 text-sm leading-6 text-ink-500">الرابط الذي طلبته غير موجود أو تم نقله.</p><Link to="/" className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700">العودة للرئيسية</Link></div></div>; }
function AppShell() { const { language, direction } = useLanguage(); const navigate = useNavigate(); const landingAppliedRef = useRef(false); const [alerts, setAlerts] = useState<Alert[]>([]); const [advisorCounts, setAdvisorCounts] = useState({ recommendations: 0, forecasts: 0 }); const [sidebarOpen, setSidebarOpen] = useState(false); const mobileSidebarRef = useRef<HTMLDivElement>(null); const mobileSidebarRestoreFocusRef = useRef<HTMLElement | null>(null); const [commandOpen, setCommandOpen] = useState(false); const [advisorOpen, setAdvisorOpen] = useState(false); const advisorPanelRef = useRef<HTMLElement>(null); const advisorRestoreFocusRef = useRef<HTMLElement | null>(null); const [user, setUser] = useState<User | null>(null); const location = useLocation(); const loadAlerts = useCallback(async () => { try { const intelligence = await fetchDashboardIntelligence(); setAlerts(intelligence.alerts); setAdvisorCounts(prev => ({ ...prev, recommendations: intelligence.recommendations.length })); } catch (error) { console.error('[AppShell] Failed to load alerts', error); setAlerts([]); } }, []); useEffect(() => { void getAuthenticatedUser().then(setUser); void loadAlerts(); }, [loadAlerts]); useEffect(() => { setSidebarOpen(false); }, [location.pathname]); useEffect(() => {
if (!sidebarOpen) return;
mobileSidebarRestoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
const previousOverflow = document.body.style.overflow;
document.body.style.overflow = 'hidden';
const onKeyDown = (event: KeyboardEvent) => {
if (event.key === 'Escape') { event.preventDefault(); setSidebarOpen(false); return; }
const isTab = event.key === 'Tab';
if (!isTab) return;
const root = mobileSidebarRef.current;
if (!root) return;
const focusable = Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'));
if (focusable.length === 0) return;
const first = focusable[0];
const last = focusable[focusable.length - 1];
if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
};
window.addEventListener('keydown', onKeyDown);
requestAnimationFrame(() => mobileSidebarRef.current?.querySelector<HTMLElement>('button[aria-label="إغلاق القائمة"]')?.focus({ preventScroll: true }));
return () => {
document.body.style.overflow = previousOverflow;
window.removeEventListener('keydown', onKeyDown);
const restoreTarget = mobileSidebarRestoreFocusRef.current;
if (restoreTarget?.isConnected) requestAnimationFrame(() => restoreTarget.focus({ preventScroll: true }));
};
}, [sidebarOpen]); useEffect(() => {
if (!advisorOpen) return;
advisorRestoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
const previousOverflow = document.body.style.overflow;
document.body.style.overflow = 'hidden';
const onKeyDown = (event: KeyboardEvent) => {
if (event.key === 'Escape') { event.preventDefault(); setAdvisorOpen(false); return; }
const isTab = event.key === 'Tab';
if (!isTab) return;
const root = advisorPanelRef.current;
if (!root) return;
const focusable = Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'));
if (focusable.length === 0) return;
const first = focusable[0];
const last = focusable[focusable.length - 1];
if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
};
window.addEventListener('keydown', onKeyDown);
requestAnimationFrame(() => advisorPanelRef.current?.querySelector<HTMLElement>('button[aria-label="إغلاق المستشار"]')?.focus({ preventScroll: true }));
return () => {
document.body.style.overflow = previousOverflow;
window.removeEventListener('keydown', onKeyDown);
const restoreTarget = advisorRestoreFocusRef.current;
if (restoreTarget?.isConnected) requestAnimationFrame(() => restoreTarget.focus({ preventScroll: true }));
};
}, [advisorOpen]); useEffect(() => { if (landingAppliedRef.current) return; landingAppliedRef.current = true; const preferences = readWorkspacePreferences(); if (location.pathname === '/' && preferences.defaultLandingPath !== '/' && isWorkspacePathVisible(preferences.defaultLandingPath, readWorkspaceMode(), preferences)) navigate(preferences.defaultLandingPath, { replace: true }); }, [location.pathname, navigate]); useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setCommandOpen(value => !value); } }; window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown); }, []); const handleMarkAlert = useCallback(async (id: string) => { try { await markAlertRead(id); setAlerts(prev => prev.map(a => a.id === id ? { ...a, is_read: true } : a)); notifyFeedback({ tone: 'success', title: 'تم تحديث التنبيه', message: 'أزيل من قائمة الانتباه.' }); } catch (error) { notifyFeedback({ tone: 'danger', title: 'تعذر تحديث التنبيه', message: 'حاول مرة أخرى.' }); console.error('[AppShell] Failed to mark alert as read', error); } }, []); const alertCount = alerts.filter(a => !a.is_read).length;
  const journeyPaths = ['/command-center','/decision-inbox','/decision-experience','/advisor-cases','/trust','/intelligence','/work-center','/replay','/benchmark','/reports/executive'];
  const reportContextPaths = [
    '/',
    '/onboarding','/connections','/master-data',
    '/reports','/reports/smart/','/reports/executive','/reports/sales','/reports/purchases',
    '/reports/inventory','/reports/inventory-intelligence','/reports/demand-velocity','/reports/receivables','/reports/profitability',
    '/import','/import/analyze','/data-quality',
    '/analytics','/analytics/rfm','/analytics/abc','/analytics/aging','/analytics/liquidity',
    '/command-center','/decision-inbox','/decision-experience','/advisor-cases',
    '/intelligence','/intelligence/recommendations','/intelligence/forecasts','/intelligence/scenarios',
    '/work-center','/operations','/trust','/replay','/benchmark','/metrics',
    '/customers','/products','/inventory','/suppliers','/alternative-groups','/try-report'
  ];
  const showJourney = journeyPaths.some((path) => location.pathname === path || location.pathname.startsWith(path + '/'));
  const showReportContext = reportContextPaths.some((path) => location.pathname === path || location.pathname.startsWith(path + '/'));
  return <div dir={direction} className="ag-app-shell flex min-h-screen flex-row bg-transparent"><Suspense fallback={<div className="hidden w-[238px] shrink-0 bg-[#0b1020] xl:block" aria-hidden="true" />}><div className="hidden xl:block"><Sidebar alertCount={alertCount} user={user} /></div></Suspense>{sidebarOpen && <div className="xl:hidden fixed inset-0 z-50 flex"><div className="fixed inset-0 bg-ink-900/50 backdrop-blur-sm" aria-hidden="true" tabIndex={-1} onClick={() => setSidebarOpen(false)} /><div ref={mobileSidebarRef} role="dialog" aria-modal="true" aria-label="القائمة الرئيسية" className={"relative h-full animate-slide-in " + (language === "ar" ? "ml-auto" : "mr-auto")}><Suspense fallback={<div className="relative h-full w-[296px] bg-[#0b1020]" aria-hidden="true" />}><Sidebar alertCount={alertCount} user={user} onNavigate={() => setSidebarOpen(false)} /></Suspense><button type="button" onClick={() => setSidebarOpen(false)} className="absolute left-3 top-3 inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-ink-400 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400" aria-label="إغلاق القائمة"><X size={20} /></button></div></div>}<div className="flex-1 flex flex-col min-w-0"><FeedbackHost /><Header alerts={alerts} onMarkAlertRead={handleMarkAlert} onMenuClick={() => setSidebarOpen(true)} onOpenCommandPalette={() => setCommandOpen(true)} /><button type="button" onClick={() => setAdvisorOpen(value => !value)} className="fixed bottom-5 left-5 z-50 hidden items-center gap-2 rounded-full border border-primary-300 bg-ink-950 px-4 py-3 text-xs font-black text-white shadow-elevated lg:inline-flex" aria-expanded={advisorOpen} aria-controls="ag-global-advisor"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-500">✦</span>المستشار الأغبري</button>{advisorOpen && <aside id="ag-global-advisor" ref={advisorPanelRef} role="dialog" aria-modal="true" aria-labelledby="ag-global-advisor-title" className="fixed bottom-24 left-5 z-50 w-[min(430px,calc(100vw-2rem))] max-h-[calc(100vh-8rem)] overflow-y-auto rounded-3xl border border-ink-200 bg-white p-3 shadow-elevated lg:bottom-20 lg:max-h-[78vh]"><div className="mb-2 flex items-center justify-between gap-3"><h2 id="ag-global-advisor-title" className="text-sm font-black text-ink-900">المستشار الأغبري</h2><button type="button" onClick={() => setAdvisorOpen(false)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-ink-200 text-ink-500 hover:bg-ink-50 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500" aria-label="إغلاق المستشار"><X size={18} aria-hidden="true" /></button></div><DeterministicIntelligenceAssistant recommendationsCount={advisorCounts.recommendations} activeAlertsCount={alerts.filter(a => !a.is_read).length} forecastsCount={advisorCounts.forecasts} /></aside>}<ReportContextProvider><main className="ag-main executive-canvas flex-1 min-w-0 w-full max-w-none p-3 pb-24 sm:p-4 sm:pb-24 lg:p-5 lg:pb-5 2xl:px-7 2xl:pb-7 mx-auto">
  {showJourney ? <ProductJourneyNav/> : null}
  {showReportContext ? <ReportSourceContext/> : null}
  <Suspense fallback={<div className="flex items-center justify-center py-20" role="status" aria-live="polite"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 border-t-transparent" /><span className="sr-only">جارٍ تحميل الصفحة</span></div>}><Routes><Route path="/" element={<DashboardPage />} /><Route path="/onboarding" element={<OnboardingPage />} /><Route path="/work-center" element={<WorkCenterPage />} /><Route path="/operations" element={<OperationsPage />} />
      <Route path="/connections" element={<ConnectionsPage />} /><Route path="/trust" element={<TrustEvidencePage />} /><Route path="/replay" element={<BusinessReplayPage />} /><Route path="/benchmark" element={<BenchmarkPage />} /><Route path="/master-data" element={<MasterDataHubPage />} /><Route path="/command-center" element={<ExecutiveCommandCenterPage />} /><Route path="/decision-inbox" element={<DecisionInboxPage />} /><Route path="/decision-experience" element={<DecisionExperiencePage />} /><Route path="/advisor-cases" element={<AdvisorCasesPage />} /><Route path="/metrics" element={<MetricInspectorPage />} /><Route path="/reports" element={<ReportsCenterPage />} /><Route path="/reports/smart/:jobId" element={<SmartReportPage />} /><Route path="/reports/executive" element={<ExecutiveReportPage />} /><Route path="/reports/sales" element={<SalesReportPage />} /><Route path="/reports/purchases" element={<PurchasesReportPage />} /><Route path="/reports/inventory" element={<InventoryReportPage />} /><Route path="/reports/inventory-intelligence" element={<InventoryIntelligencePage />} /><Route path="/reports/demand-velocity" element={<DemandVelocityPage />} /><Route path="/reports/receivables" element={<ReceivablesReportPage />} /><Route path="/reports/profitability" element={<ProfitabilityReportPage />} /><Route path="/import" element={<ImportPage />} /><Route path="/import/analyze" element={<ExternalFileAnalysisPage />} /><Route path="/data-quality" element={<DataQualityPage />} /><Route path="/analytics" element={<AnalyticsCenterPage />} /><Route path="/analytics/rfm" element={<RFMAnalysisPage />} /><Route path="/analytics/abc" element={<ABCAnalysisPage />} /><Route path="/analytics/aging" element={<AgingAnalysisPage />} /><Route path="/analytics/liquidity" element={<LiquidityPage />} /><Route path="/intelligence" element={<IntelligenceCenterPage />} /><Route path="/intelligence/recommendations" element={<RecommendationsPage />} /><Route path="/intelligence/forecasts" element={<ForecastsPage />} /><Route path="/intelligence/scenarios" element={<ScenarioTruthGuardPage />} /><Route path="/customers" element={<CustomersPage />} /><Route path="/suppliers" element={<SuppliersPage />} /><Route path="/products" element={<ProductsPage />} /><Route path="/inventory" element={<InventoryPage />} /><Route path="/alternative-groups" element={<AlternativeGroupsPage />} /><Route path="/settings" element={<CompanySettingsPage />} /><Route path="/settings/profile" element={<ProfileSettingsPage />} /><Route path="/*" element={<NotFoundPage />} /></Routes></Suspense></main></ReportContextProvider></div><MobileActionBar onOpenCommandPalette={() => setCommandOpen(true)} onOpenAdvisor={() => setAdvisorOpen(true)} advisorOpen={advisorOpen} /><CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} /></div>; }
function PublicOrAuthenticatedWorkspace() {
  const location = useLocation();
  const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
  const query = new URLSearchParams(location.search);
  const isNetlifyPreview = host.endsWith('--aghbari-report-advisor.netlify.app')
    && host !== 'aghbari-report-advisor.netlify.app'
    && host !== 'main--aghbari-report-advisor.netlify.app';
  const isPrimaryPublicPreview = host === 'aghbari-report-advisor.netlify.app' || host === 'main--aghbari-report-advisor.netlify.app';
  const isGitHubPagesPublicPreview = host === 'report-engainall.github.io';
  const demoQuery = query.get('demo') === '1';
  const authQuery = query.get('auth') === '1';
  const isPublicSmartReportDemo = location.pathname === '/reports/smart/demo' || location.pathname === '/reports/smart/demo/';

  if (authQuery) return <AuthGate />;
  if (isPublicSmartReportDemo) return <PublicSmartReportDemoPage />;
  if (demoQuery || isNetlifyPreview || isPrimaryPublicPreview || isGitHubPagesPublicPreview) return <ProposalDemoPage />;
  return <AuthGate><AppShell /></AuthGate>;
}

export default function App() { return <LanguageProvider><BrowserRouter basename={import.meta.env.BASE_URL}><AppErrorBoundary><Routes><Route path="/proposal-demo" element={<ProposalDemoPage />} /><Route path="/try-report" element={<ExternalFileAnalysisPage />} /><Route path="*" element={<PublicOrAuthenticatedWorkspace />} /></Routes></AppErrorBoundary></BrowserRouter></LanguageProvider>; }