import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Eye, EyeOff, RotateCcw, SlidersHorizontal, Star } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { PageHeader, LoadingState, ErrorState } from '@/components/ui/States';
import { supabase, resolveCurrentCompanyId } from '@/lib/supabase';
import { NAVIGATION_ITEMS, NAVIGATION_SECTIONS } from '@/lib/navigation-registry';
import {
  readWorkspacePreferences,
  resetWorkspacePreferences,
  writeWorkspacePreferences,
  type WorkspaceMode,
  type WorkspacePreset,
  type WorkspacePreferences,
} from '@/lib/workspace-mode';

interface CompanySettings {
  id: string; name: string; legal_name: string | null; tax_id: string | null; currency: string | null;
  timezone: string | null; industry: string | null; phone: string | null; email: string | null; address: string | null;
}

const PRESET_OPTIONS: Array<{ id: WorkspacePreset; label: string; hint: string }> = [
  { id: 'owner-executive', label: 'المالك / التنفيذي', hint: 'القيادة، القرار والتقارير.' },
  { id: 'finance', label: 'المالية', hint: 'الربحية، الذمم والمبيعات.' },
  { id: 'sales', label: 'المبيعات', hint: 'المبيعات، العملاء وتحليل النشاط.' },
  { id: 'collections', label: 'التحصيل', hint: 'الذمم، العملاء ومركز العمل.' },
  { id: 'inventory', label: 'المخزون', hint: 'المخزون، المنتجات وحركة الطلب.' },
  { id: 'operations', label: 'التشغيل', hint: 'الاستيراد، الجودة والمصادر.' },
  { id: 'analyst', label: 'المحلل', hint: 'التحليلات، المقاييس والسيناريوهات.' },
  { id: 'data-import', label: 'مشغل البيانات', hint: 'الاستيراد والتحليل وجودة البيانات.' },
];

const DEFAULT_SECTION_ORDER = NAVIGATION_SECTIONS.map((section) => section.id);

const WORKSPACE_ROUTE_OPTIONS = NAVIGATION_ITEMS.map(({ path, label }) => ({ path, label }));

const WORKSPACE_MODULE_GROUPS = NAVIGATION_SECTIONS.map((section) => ({
  id: section.id,
  label: section.title,
  paths: section.items.map((item) => item.path),
}));

const DASHBOARD_WIDGET_OPTIONS = [
  { id: 'kpis', label: 'بطاقات المؤشرات' },
  { id: 'analysis', label: 'لوحة الإثبات والتحليل' },
  { id: 'attention', label: 'الانتباه وطابور القرار' },
  { id: 'entities', label: 'العملاء والمنتجات وأعمار الذمم' },
  { id: 'work-paths', label: 'مسارات العمل' },
] as const;

const PRESETS: Record<WorkspacePreset, WorkspacePreferences> = {
  'owner-executive': { mode: 'essential', preset: 'owner-executive', defaultLandingPath: '/command-center', hiddenPaths: [], favoritePaths: ['/', '/command-center', '/decision-experience', '/reports/executive'], sectionOrder: [...DEFAULT_SECTION_ORDER], dashboardWidgets: DASHBOARD_WIDGET_OPTIONS.map(option => option.id) },
  finance: { mode: 'advanced', preset: 'finance', defaultLandingPath: '/reports/profitability', hiddenPaths: [], favoritePaths: ['/reports/profitability', '/reports/receivables', '/reports/sales', '/metrics'], sectionOrder: [...DEFAULT_SECTION_ORDER], dashboardWidgets: DASHBOARD_WIDGET_OPTIONS.map(option => option.id) },
  sales: { mode: 'advanced', preset: 'sales', defaultLandingPath: '/reports/sales', hiddenPaths: [], favoritePaths: ['/reports/sales', '/customers', '/products', '/analytics/rfm'], sectionOrder: [...DEFAULT_SECTION_ORDER], dashboardWidgets: DASHBOARD_WIDGET_OPTIONS.map(option => option.id) },
  collections: { mode: 'advanced', preset: 'collections', defaultLandingPath: '/reports/receivables', hiddenPaths: [], favoritePaths: ['/reports/receivables', '/work-center', '/customers', '/reports/executive'], sectionOrder: [...DEFAULT_SECTION_ORDER], dashboardWidgets: DASHBOARD_WIDGET_OPTIONS.map(option => option.id) },
  inventory: { mode: 'advanced', preset: 'inventory', defaultLandingPath: '/inventory', hiddenPaths: [], favoritePaths: ['/inventory', '/reports/inventory-intelligence', '/reports/demand-velocity', '/products'], sectionOrder: [...DEFAULT_SECTION_ORDER], dashboardWidgets: DASHBOARD_WIDGET_OPTIONS.map(option => option.id) },
  operations: { mode: 'advanced', preset: 'operations', defaultLandingPath: '/work-center', hiddenPaths: [], favoritePaths: ['/work-center', '/import', '/data-quality', '/connections'], sectionOrder: [...DEFAULT_SECTION_ORDER], dashboardWidgets: DASHBOARD_WIDGET_OPTIONS.map(option => option.id) },
  analyst: { mode: 'advanced', preset: 'analyst', defaultLandingPath: '/analytics', hiddenPaths: [], favoritePaths: ['/analytics', '/metrics', '/intelligence/scenarios', '/data-quality'], sectionOrder: [...DEFAULT_SECTION_ORDER], dashboardWidgets: DASHBOARD_WIDGET_OPTIONS.map(option => option.id) },
  'data-import': { mode: 'expert', preset: 'data-import', defaultLandingPath: '/import', hiddenPaths: [], favoritePaths: ['/import', '/import/analyze', '/data-quality', '/connections'], sectionOrder: [...DEFAULT_SECTION_ORDER], dashboardWidgets: DASHBOARD_WIDGET_OPTIONS.map(option => option.id) },
};

export function CompanySettingsPage() {
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<WorkspacePreferences>(readWorkspacePreferences);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const companyId = await resolveCurrentCompanyId();
      if (!companyId) throw new Error('تعذر تحديد الشركة الحالية بشكل موثوق');
      const { data, error: queryError } = await supabase.from('companies')
        .select('id,name,legal_name,tax_id,currency,timezone,industry,phone,email,address')
        .eq('id', companyId).single();
      if (queryError) throw queryError;
      if (!data) throw new Error('بيانات الشركة الحالية غير متاحة');
      setCompany(data as CompanySettings);
    } catch (cause) {
      setCompany(null); setError(cause instanceof Error ? cause.message : 'تعذر تحميل إعدادات الشركة');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const sync = () => setPreferences(readWorkspacePreferences());
    window.addEventListener('storage', sync);
    window.addEventListener('report-advisor:workspace-preferences', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('report-advisor:workspace-preferences', sync);
    };
  }, []);

  const commit = (next: Partial<WorkspacePreferences>) => setPreferences(writeWorkspacePreferences(next));
  const setMode = (mode: WorkspaceMode) => commit({ mode });
  const setPreset = (preset: WorkspacePreset) => setPreferences(writeWorkspacePreferences(PRESETS[preset]));
  const togglePath = (path: string, list: 'hiddenPaths' | 'favoritePaths') => {
    const current = preferences[list];
    commit({ [list]: current.includes(path) ? current.filter(item => item !== path) : [...current, path] });
  };

  const moveSection = (sectionId: string, delta: -1 | 1) => {
    const current = [...preferences.sectionOrder];
    const index = current.indexOf(sectionId); const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return;
    [current[index], current[nextIndex]] = [current[nextIndex], current[index]];
    commit({ sectionOrder: current });
  };

  const toggleWidget = (id: WorkspacePreferences['dashboardWidgets'][number]) => {
    const current = preferences.dashboardWidgets;
    commit({ dashboardWidgets: current.includes(id) ? current.filter(item => item !== id) : [...current, id] });
  };

  const field = (value: string | null) => value?.trim() || 'غير متوفر';
  const modeLabel = useMemo(() => ({ essential: 'أساسية', advanced: 'متقدمة', expert: 'خبيرة' } satisfies Record<WorkspaceMode, string>)[preferences.mode], [preferences.mode]);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="الإعدادات" subtitle="مصدر الشركة الموثوق + محرر مساحة العمل المحلي على هذا الجهاز" />

      <div data-testid="workspace-editor">
        <Card className="ag-settings-panel">
          <CardHeader title="محرر مساحة العمل" />
          <CardBody>
            <div className="rounded-2xl border border-ink-100 bg-ink-50/70 p-4 text-xs leading-5 text-ink-500">
              هذا التخصيص بصري ومحلي على الجهاز؛ لا يغيّر الصلاحيات، عزل المستأجرين، أو مصدر البيانات الكانوني.
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {PRESET_OPTIONS.map(option => (
                <button key={option.id} type="button" onClick={() => setPreset(option.id)} aria-pressed={preferences.preset === option.id} className={'rounded-2xl border p-4 text-right transition ' + (preferences.preset === option.id ? 'border-primary-500 bg-primary-50' : 'border-ink-100 bg-white hover:border-primary-200 hover:bg-primary-50/40')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-ink-900">{option.label}</span>
                    {preferences.preset === option.id && <Check size={17} className="text-primary-600" />}
                  </div>
                  <div className="mt-1.5 text-[11px] leading-5 text-ink-500">{option.hint}</div>
                </button>
              ))}
            </div>

            <div className="mt-5 flex items-center gap-2">
              <SlidersHorizontal size={17} className="text-primary-600" />
              <div className="text-sm font-bold text-ink-900">كثافة مساحة العمل</div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              {([
                ['essential', 'أساسية', 'المسارات اليومية والصفحات الأساسية.'],
                ['advanced', 'متقدمة', 'تضيف التحليلات والربحية والطلب والقرار.'],
                ['expert', 'خبيرة', 'تُظهر كامل المساحة المتخصصة.'],
              ] as Array<[WorkspaceMode, string, string]>).map(([mode, label, hint]) => (
                <button key={mode} type="button" onClick={() => setMode(mode)} aria-pressed={preferences.mode === mode} className={'rounded-2xl border p-4 text-right ' + (preferences.mode === mode ? 'border-primary-500 bg-primary-50' : 'border-ink-100 bg-white hover:bg-ink-50')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-ink-900">{label}</span>
                    {preferences.mode === mode && <Check size={17} className="text-primary-600" />}
                  </div>
                  <div className="mt-1.5 text-[11px] leading-5 text-ink-500">{hint}</div>
                </button>
              ))}
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-ink-100 bg-white p-4">
                <div className="text-sm font-bold text-ink-900">الصفحة الافتراضية بعد تسجيل الدخول</div>
                <select aria-label="الصفحة الافتراضية بعد تسجيل الدخول" value={preferences.defaultLandingPath} onChange={event => commit({ defaultLandingPath: event.target.value })} className="mt-3 min-h-11 w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-800">
                  {WORKSPACE_ROUTE_OPTIONS.map(option => <option key={option.path} value={option.path}>{option.label}</option>)}
                </select>
              </div>

              <div className="rounded-2xl border border-ink-100 bg-white p-4">
                <div className="text-sm font-bold text-ink-900">الإجراءات السريعة المفضلة</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {WORKSPACE_ROUTE_OPTIONS.filter(option => option.path !== '/').slice(0, 8).map(option => (
                    <label key={option.path} className="flex items-center gap-2 rounded-xl border border-ink-100 px-3 py-2.5 text-xs text-ink-700">
                      <input type="checkbox" checked={preferences.favoritePaths.includes(option.path)} onChange={() => togglePath(option.path, 'favoritePaths')} />
                      <Star size={14} className={preferences.favoritePaths.includes(option.path) ? 'fill-current text-primary-600' : 'text-ink-300'} />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="إظهار / إخفاء الوحدات" />
          <CardBody>
            <div className="space-y-3">
              {WORKSPACE_MODULE_GROUPS.map(group => {
                const hiddenCount = group.paths.filter(path => preferences.hiddenPaths.includes(path)).length;
                return (
                  <div key={group.id} className="rounded-2xl border border-ink-100 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-ink-900">{group.label}</div>
                        <div className="mt-0.5 text-[10px] text-ink-400">{hiddenCount} مخفية</div>
                      </div>
                      <Eye size={16} className="text-ink-400" />
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {group.paths.map(path => {
                        const option = WORKSPACE_ROUTE_OPTIONS.find(item => item.path === path);
                        const hidden = preferences.hiddenPaths.includes(path);
                        return (
                          <label key={path} className="flex items-center gap-2 rounded-xl border border-ink-100 px-3 py-2.5 text-xs text-ink-700">
                            <input type="checkbox" checked={!hidden} onChange={() => togglePath(path, 'hiddenPaths')} />
                            {hidden ? <EyeOff size={14} className="text-ink-300" /> : <Eye size={14} className="text-success-600" />}
                            <span className="truncate">{option?.label ?? path}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="ترتيب التنقل" />
          <CardBody>
            <div className="space-y-2">
              {preferences.sectionOrder.map((sectionId, index) => (
                <div key={sectionId} className="flex items-center gap-2 rounded-xl border border-ink-100 bg-ink-50/50 p-3">
                  <div className="min-w-0 flex-1 text-sm font-bold text-ink-800">
                    {NAVIGATION_SECTIONS.find(section => section.id === sectionId)?.title ?? sectionId}
                  </div>
                  <button type="button" disabled={index === 0} onClick={() => moveSection(sectionId, -1)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-ink-200 bg-white p-2 text-ink-500 disabled:opacity-30" aria-label={'تحريك ' + (NAVIGATION_SECTIONS.find(section => section.id === sectionId)?.title ?? sectionId) + ' لأعلى'}><ArrowUp size={14}/></button>
                  <button type="button" disabled={index === preferences.sectionOrder.length - 1} onClick={() => moveSection(sectionId, 1)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-ink-200 bg-white p-2 text-ink-500 disabled:opacity-30" aria-label={'تحريك ' + (NAVIGATION_SECTIONS.find(section => section.id === sectionId)?.title ?? sectionId) + ' لأسفل'}><ArrowDown size={14}/></button>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="كروت لوحة اليوم" />
          <CardBody>
            <div className="grid gap-2 sm:grid-cols-2">
              {DASHBOARD_WIDGET_OPTIONS.map(option => {
                const enabled = preferences.dashboardWidgets.includes(option.id);
                return (
                  <label key={option.id} data-testid={`workspace-widget-${option.id}`} className="flex items-center gap-2 rounded-xl border border-ink-100 px-3 py-2.5 text-xs text-ink-700">
                    <input type="checkbox" checked={enabled} onChange={() => toggleWidget(option.id)} />
                    <span className="h-2 w-2 rounded-full bg-primary-500" />
                    {option.label}
                  </label>
                );
              })}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="إعادة ضبط المنتج" />
          <CardBody>
            <div className="rounded-2xl border border-warning-200 bg-warning-50/60 p-4 text-xs leading-5 text-warning-800">
              يعيد جميع تفضيلات مساحة العمل على هذا الجهاز إلى الإعدادات الافتراضية للمنتج.
            </div>
            <button type="button" onClick={() => setPreferences(resetWorkspacePreferences())} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-xs font-bold text-ink-700 hover:bg-ink-50">
              <RotateCcw size={15}/> إعادة الإعدادات الافتراضية
            </button>
            <div className="mt-3 text-[10px] text-ink-400">الوضع الحالي: {modeLabel} · الشخصية: {PRESET_OPTIONS.find(item => item.id === preferences.preset)?.label ?? preferences.preset}</div>
          </CardBody>
        </Card>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !company ? (
        <ErrorState message="بيانات الشركة غير متاحة" onRetry={load} />
      ) : (
        <Card>
          <CardHeader title="معلومات الشركة" />
          <CardBody>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div><div className="text-xs text-ink-500">اسم الشركة</div><div className="mt-1 text-sm font-medium text-ink-800">{field(company.name)}</div></div>
              <div><div className="text-xs text-ink-500">الاسم القانوني</div><div className="mt-1 text-sm font-medium text-ink-800">{field(company.legal_name)}</div></div>
              <div><div className="text-xs text-ink-500">السجل الضريبي</div><div className="mt-1 text-sm font-medium text-ink-800">{field(company.tax_id)}</div></div>
              <div><div className="text-xs text-ink-500">العملة</div><div className="mt-1 text-sm font-medium text-ink-800">{field(company.currency)}</div></div>
              <div><div className="text-xs text-ink-500">المنطقة الزمنية</div><div className="mt-1 text-sm font-medium text-ink-800">{field(company.timezone)}</div></div>
              <div><div className="text-xs text-ink-500">القطاع</div><div className="mt-1 text-sm font-medium text-ink-800">{field(company.industry)}</div></div>
              <div><div className="text-xs text-ink-500">الهاتف</div><div className="mt-1 text-sm font-medium text-ink-800">{field(company.phone)}</div></div>
              <div><div className="text-xs text-ink-500">البريد الإلكتروني</div><div className="mt-1 text-sm font-medium text-ink-800">{field(company.email)}</div></div>
              <div className="md:col-span-2"><div className="text-xs text-ink-500">العنوان</div><div className="mt-1 text-sm font-medium text-ink-800">{field(company.address)}</div></div>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
