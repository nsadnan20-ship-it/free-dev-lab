import { NAVIGATION_SECTIONS, resolveNavigationItem, type WorkspaceVisibilityMode } from '@/lib/navigation-registry';

export type WorkspaceMode = WorkspaceVisibilityMode;
export type WorkspacePreset =
  | 'owner-executive' | 'finance' | 'sales' | 'collections'
  | 'inventory' | 'operations' | 'analyst' | 'data-import';
export type DashboardWidgetId = 'kpis' | 'analysis' | 'attention' | 'entities' | 'work-paths';

export interface WorkspacePreferences {
  mode: WorkspaceMode;
  preset: WorkspacePreset;
  defaultLandingPath: string;
  hiddenPaths: string[];
  favoritePaths: string[];
  sectionOrder: string[];
  dashboardWidgets: DashboardWidgetId[];
}

export const WORKSPACE_MODE_KEY = 'report-advisor.workspace-mode';
export const WORKSPACE_PREFERENCES_KEY = 'report-advisor.workspace-preferences';

const VALID_PRESETS = new Set<WorkspacePreset>([
  'owner-executive', 'finance', 'sales', 'collections', 'inventory', 'operations', 'analyst', 'data-import',
]);
const VALID_WIDGETS = new Set<DashboardWidgetId>(['kpis', 'analysis', 'attention', 'entities', 'work-paths']);

const DEFAULT_SECTION_ORDER = NAVIGATION_SECTIONS.map(section => section.id);

export const DEFAULT_WORKSPACE_PREFERENCES: WorkspacePreferences = {
  mode: 'essential',
  preset: 'owner-executive',
  defaultLandingPath: '/',
  hiddenPaths: [],
  favoritePaths: ['/reports/executive', '/reports/sales', '/reports/receivables', '/import/analyze'],
  sectionOrder: DEFAULT_SECTION_ORDER,
  dashboardWidgets: ['kpis', 'analysis', 'attention', 'entities', 'work-paths'],
};

const normalizeList = (value: unknown): string[] =>
  Array.isArray(value) ? [...new Set(value.filter(item => typeof item === 'string'))] : [];

function coercePreferences(input: Partial<WorkspacePreferences> | null | undefined): WorkspacePreferences {
  const sectionOrder = normalizeList(input?.sectionOrder).filter(item => DEFAULT_WORKSPACE_PREFERENCES.sectionOrder.includes(item));
  const mergedSections = [...sectionOrder, ...DEFAULT_WORKSPACE_PREFERENCES.sectionOrder.filter(item => !sectionOrder.includes(item))];
  const widgets = normalizeList(input?.dashboardWidgets).filter((item): item is DashboardWidgetId => VALID_WIDGETS.has(item as DashboardWidgetId));
  return {
    ...DEFAULT_WORKSPACE_PREFERENCES,
    ...input,
    mode: input?.mode === 'advanced' || input?.mode === 'expert' ? input.mode : 'essential',
    preset: VALID_PRESETS.has(input?.preset as WorkspacePreset) ? input!.preset as WorkspacePreset : 'owner-executive',
    defaultLandingPath: typeof input?.defaultLandingPath === 'string' ? input.defaultLandingPath : '/',
    hiddenPaths: normalizeList(input?.hiddenPaths),
    favoritePaths: normalizeList(input?.favoritePaths),
    sectionOrder: mergedSections,
    dashboardWidgets: widgets.length ? widgets : DEFAULT_WORKSPACE_PREFERENCES.dashboardWidgets,
  };
}

export function readWorkspacePreferences(): WorkspacePreferences {
  if (typeof window === 'undefined') return DEFAULT_WORKSPACE_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(WORKSPACE_PREFERENCES_KEY);
    return raw ? coercePreferences(JSON.parse(raw) as Partial<WorkspacePreferences>) : DEFAULT_WORKSPACE_PREFERENCES;
  } catch {
    return DEFAULT_WORKSPACE_PREFERENCES;
  }
}

export function writeWorkspacePreferences(next: Partial<WorkspacePreferences>): WorkspacePreferences {
  const merged = coercePreferences({ ...readWorkspacePreferences(), ...next });
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(WORKSPACE_PREFERENCES_KEY, JSON.stringify(merged));
    window.localStorage.setItem(WORKSPACE_MODE_KEY, merged.mode);
    window.dispatchEvent(new Event('report-advisor:workspace-preferences'));
    window.dispatchEvent(new Event('report-advisor:workspace-mode'));
  }
  return merged;
}

export function resetWorkspacePreferences(): WorkspacePreferences {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(WORKSPACE_PREFERENCES_KEY);
    window.localStorage.removeItem(WORKSPACE_MODE_KEY);
  }
  return writeWorkspacePreferences(DEFAULT_WORKSPACE_PREFERENCES);
}

export function readWorkspaceMode(): WorkspaceMode {
  return readWorkspacePreferences().mode;
}

export function isWorkspacePathVisible(
  path: string,
  mode: WorkspaceMode,
  preferences: WorkspacePreferences = readWorkspacePreferences(),
): boolean {
  if (preferences.hiddenPaths.includes(path)) return false;
  const item = resolveNavigationItem(path);
  const required = item?.minimumWorkspaceMode;
  if (!required) return true;
  const rank: Record<WorkspaceMode, number> = { essential: 0, advanced: 1, expert: 2 };
  return rank[mode] >= rank[required];
}
