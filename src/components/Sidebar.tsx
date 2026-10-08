import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from '@/lib/router-compat';
import { Activity, BarChart3, ShieldCheck, Brain, ChevronDown, ClipboardCheck, Database, FileBarChart, Files, Gauge, Layers3, LayoutDashboard, ListChecks, LogOut, Package, Scale, ScanSearch, Settings, Target, Upload, UserCircle, Users, Warehouse, AlertCircle, PlugZap, Truck, WalletCards } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { getDisplayEmail, getDisplayName } from '@/lib/profile-display';
import { useLanguage } from '@/lib/language';
import { isWorkspacePathVisible, readWorkspaceMode, readWorkspacePreferences, type WorkspaceMode, type WorkspacePreferences } from '@/lib/workspace-mode';
import { withActiveReportContext } from '@/lib/report-context-url';

import { NAVIGATION_SECTIONS, resolveNavigationItem, type NavigationIconKey, type NavigationItem, type NavigationSectionId } from '@/lib/navigation-registry';

interface NavItem extends NavigationItem { iconNode: ReactNode }
interface NavSection {
  id: NavigationItem['section'];
  title: string;
  enTitle: string;
  items: NavItem[];
}

const iconFor: Record<NavigationIconKey, ReactNode> = {
  dashboard: <LayoutDashboard size={16}/>,
  'command-center': <Scale size={16}/>,
  decision: <ClipboardCheck size={16}/>,
  intelligence: <Brain size={16}/>,
  'work-center': <Activity size={16}/>,
  import: <Upload size={16}/>,
  document: <ScanSearch size={16}/>,
  quality: <AlertCircle size={16}/>,
  connections: <PlugZap size={16}/>,
  money: <FileBarChart size={16}/>,
  purchases: <FileBarChart size={16}/>,
  receivables: <CreditMark/>,
  profitability: <Gauge size={16}/>,
  customers: <Users size={16}/>,
  products: <Package size={16}/>,
  inventory: <Warehouse size={16}/>,
  alternatives: <Layers3 size={16}/>,
  recommendations: <Brain size={16}/>,
  forecasts: <Target size={16}/>,
  scenarios: <ScenarioMark/>,
  rfm: <BarChart3 size={16}/>,
  abc: <BarChart3 size={16}/>,
  aging: <BarChart3 size={16}/>,
  metrics: <Gauge size={16}/>,
  trust: <ShieldCheck size={16}/>,
  'master-data': <Files size={16}/>,
  'executive-report': <ClipboardCheck size={16}/>,
  reports: <FileBarChart size={16}/>,
  'inventory-report': <Warehouse size={16}/>,
  'inventory-intelligence': <Gauge size={16}/>,
  replay: <Activity size={16}/>,
  benchmark: <BarChart3 size={16}/>,
  demand: <Activity size={16}/>,
  analytics: <BarChart3 size={16}/>,
  liquidity: <WalletCards size={16}/>,
  suppliers: <Truck size={16}/>,
  onboarding: <ListChecks size={16}/>,
  settings: <Settings size={16}/>,
  profile: <UserCircle size={16}/>,
};

const navSections: NavSection[] = NAVIGATION_SECTIONS.map(section => ({
  ...section,
  items: section.items.map(item => ({ ...item, iconNode: iconFor[item.icon] })),
}));

function CreditMark(){return <span className="text-[13px] font-black">◫</span>}
function ScenarioMark(){return <span className="text-[12px] font-black">◎</span>}
const sectionIcons = {
  'decision-center': <Target size={17} />,
  'data-operations': <Database size={17} />,
  analytics: <BarChart3 size={17} />,
  intelligence: <Brain size={17} />,
  trust: <Database size={17} />,
  outputs: <FileBarChart size={17} />,
  reference: <Files size={17} />,
  admin: <Settings size={17} />,
};
const sectionMeta = {
  'decision-center': { hint: 'الصورة التنفيذية والقرار', tag: 'DECIDE' },
  'data-operations': { hint: 'مصادر، مستندات وجودة', tag: 'DATA' },
  analytics: { hint: 'المؤشرات والتقارير التجارية', tag: 'BI' },
  intelligence: { hint: 'إشارات واستكشاف ذكي', tag: 'INTEL' },
  trust: { hint: 'إثبات، مصدر، وثقة', tag: 'TRUST' },
  outputs: { hint: 'تقارير ومخرجات القرار', tag: 'OUTPUT' },
  reference: { hint: 'كيانات ومعارف أساسية', tag: 'MASTER' },
  admin: { hint: 'التهيئة وضبط مساحة العمل', tag: 'ADMIN' },
};


export function Sidebar({alertCount=0,onNavigate,user}:{alertCount?:number;onNavigate?:()=>void;user?:User|null}){
 const{language}=useLanguage();const location=useLocation();const[workspaceMode,setWorkspaceMode]=useState<WorkspaceMode>(readWorkspaceMode);
 const [workspacePreferences,setWorkspacePreferences]=useState<WorkspacePreferences>(readWorkspacePreferences); const visibleSections=useMemo(()=>navSections.map(s=>({...s,items:s.items.filter(i=>isWorkspacePathVisible(i.path,workspaceMode,workspacePreferences))})).filter(s=>s.items.length).sort((a,b)=>workspacePreferences.sectionOrder.indexOf(a.id)-workspacePreferences.sectionOrder.indexOf(b.id)),[workspaceMode,workspacePreferences]);;
 const activeSection=useMemo(()=>resolveNavigationItem(location.pathname)?.section ?? 'decision-center',[location.pathname]);
 const[expandedSection,setExpandedSection]=useState<NavigationSectionId | ''>(activeSection);
 useEffect(()=>{const sync=()=>{setWorkspaceMode(readWorkspaceMode());setWorkspacePreferences(readWorkspacePreferences())};window.addEventListener('storage',sync);window.addEventListener('report-advisor:workspace-mode',sync);window.addEventListener('report-advisor:workspace-preferences',sync);return()=>{window.removeEventListener('storage',sync);window.removeEventListener('report-advisor:workspace-mode',sync);window.removeEventListener('report-advisor:workspace-preferences',sync)}},[]);
 useEffect(()=>setExpandedSection(activeSection),[activeSection]);
 const signOut=async()=>{const{error}=await supabase.auth.signOut({scope:'local'});if(error)throw error;onNavigate?.()};
 return <aside dir={language==='ar'?'rtl':'ltr'} className={'ag-sidebar flex h-screen w-[284px] shrink-0 flex-col border-ink-200 bg-white text-ink-900 '+(language==='ar'?'border-l':'border-r')}>
  <div className="border-b border-ink-200 px-4 py-4"><Link to="/" onClick={onNavigate} className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#e7b52b] text-sm font-black text-[#073b37] shadow-sm">أ</div><div className="min-w-0"><div className="text-[14px] font-black">الأغبري</div><div className="mt-0.5 text-[10px] text-ink-400">ذكاء الأعمال والقرار</div></div></Link></div>
  <div className="px-3 py-3">
    <div className="ag-sidebar-workspace rounded-[14px] border border-primary-100 bg-gradient-to-br from-primary-50/80 via-white to-[#fff8e8] p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-primary-700 text-white"><Target size={15}/></span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-black text-ink-800">مركز القرار</div>
          <div className="mt-0.5 text-[9px] text-ink-400">{workspaceMode==='essential'?'أساسية':workspaceMode==='advanced'?'متقدمة':'خبيرة'} · وصول تدريجي</div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <Link to="/command-center" onClick={onNavigate} className="flex items-center justify-center gap-1 rounded-[8px] bg-ink-950 px-2 py-2 text-[10px] font-black text-white hover:bg-ink-800"><Target size={12}/> مركز القرار</Link>
        <Link to="/import" onClick={onNavigate} className="flex items-center justify-center gap-1 rounded-[8px] border border-ink-200 bg-white px-2 py-2 text-[10px] font-black text-ink-700 hover:border-primary-200 hover:bg-primary-50 hover:text-primary-800"><Upload size={12}/> إدخال البيانات</Link>
      </div>
    </div>
  </div>
  <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label={language==='ar'?'التنقل الرئيسي للمنصة':'Primary analytics navigation'}>
    <div className="space-y-1">
      {visibleSections.map(section => {
        const active = activeSection === section.id;
        const open = expandedSection === section.id;
        const meta = sectionMeta[String(section.id) as keyof typeof sectionMeta] ?? { hint: '', tag: '' };
        return (
          <div key={section.id} className="ag-nav-section">
            <button
              type="button"
              onClick={() => setExpandedSection(open ? '' : section.id)}
              className={'ag-section-toggle flex min-h-11 w-full items-center gap-2.5 rounded-[11px] px-2.5 py-2.5 text-right transition ' + (active ? 'ag-section-toggle-active' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-950')}
              aria-expanded={open}
              aria-controls={`nav-section-${section.id}`}
            >
              <span className={'flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] ' + (active ? 'bg-white text-primary-700' : 'bg-ink-50 text-ink-400')}>
                {sectionIcons[section.id]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-[13px] font-black">{language === 'ar' ? section.title : section.enTitle}</span>
                  <span className="ag-section-tag">{meta.tag}</span>
                </span>
                <span className="mt-0.5 block truncate text-[9px] font-medium text-ink-400">{meta.hint}</span>
              </span>
              <ChevronDown size={14} className={'shrink-0 text-ink-300 transition-transform ' + (open ? '' : '-rotate-90')} />
            </button>
            <div id={`nav-section-${section.id}`} hidden={!open} className="ag-nav-sublist mr-3 mt-0.5 space-y-0.5 pr-2">
              {section.items.map(item => {
                const activeItem = resolveNavigationItem(location.pathname)?.path === item.path;
                return (
                  <Link
                    key={item.path}
                    to={withActiveReportContext(item.path, location.search)}
                    onClick={onNavigate}
                    className={'ag-nav-item nav-item min-h-11 ' + (activeItem ? 'ag-nav-item-active' : 'ag-nav-item-inactive')}
                    aria-current={activeItem ? 'page' : undefined}
                  >
                    <span className="shrink-0">{item.iconNode}</span>
                    <span className="min-w-0 flex-1 truncate">{language === 'ar' ? item.label : item.enLabel}</span>
                    {activeItem && <span className="ag-nav-current" />}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  </nav>
  <div className="border-t border-ink-200 p-3"><div className="flex items-center gap-2.5"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-ink-100 text-[11px] font-black text-ink-700">{getDisplayName(user??null).slice(0,1)||'م'}</div><div className="min-w-0 flex-1"><div className="truncate text-[12px] font-bold text-ink-800">{getDisplayName(user??null)}</div><div className="truncate text-[10px] text-ink-400" dir="ltr">{getDisplayEmail(user??null)}</div></div><button type="button" onClick={()=>void signOut()} className="flex min-h-11 min-w-11 items-center justify-center rounded-[8px] p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400" aria-label={language==='ar'?'تسجيل الخروج':'Sign out'}><LogOut size={15}/></button></div></div>
 </aside>
}
