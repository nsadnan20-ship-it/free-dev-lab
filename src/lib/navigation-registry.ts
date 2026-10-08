export type WorkspaceVisibilityMode = 'essential' | 'advanced' | 'expert';

export type NavigationSectionId =
  | 'decision-center'
  | 'data-operations'
  | 'analytics'
  | 'intelligence'
  | 'trust'
  | 'outputs'
  | 'reference'
  | 'admin';

export type NavigationIconKey =
  | 'dashboard'
  | 'command-center'
  | 'decision'
  | 'intelligence'
  | 'work-center'
  | 'import'
  | 'document'
  | 'quality'
  | 'connections'
  | 'money'
  | 'purchases'
  | 'receivables'
  | 'profitability'
  | 'customers'
  | 'products'
  | 'inventory'
  | 'alternatives'
  | 'recommendations'
  | 'forecasts'
  | 'scenarios'
  | 'rfm'
  | 'abc'
  | 'aging'
  | 'metrics'
  | 'trust'
  | 'executive-report'
  | 'reports'
  | 'inventory-report'
  | 'inventory-intelligence'
  | 'replay'
  | 'benchmark'
  | 'demand'
  | 'analytics'
  | 'onboarding'
  | 'settings'
  | 'profile'
  | 'master-data'
  | 'liquidity'
  | 'suppliers'
;

export interface NavigationItem {
  section: NavigationSectionId;
  path: string;
  label: string;
  enLabel: string;
  description: string;
  keywords: string[];
  icon: NavigationIconKey;
  minimumWorkspaceMode?: WorkspaceVisibilityMode;
}

export interface NavigationSection {
  id: NavigationSectionId;
  title: string;
  enTitle: string;
  items: NavigationItem[];
}

export const NAVIGATION_SECTIONS: NavigationSection[] = [
  {
    id: 'decision-center',
    title: 'مركز القرار',
    enTitle: 'Decision Center',
    items: [
      { section: 'decision-center', path: '/', label: 'نبض الأعمال', enLabel: 'Business Pulse', description: 'الصورة التنفيذية اليومية في شاشة واحدة', keywords: ['dashboard', 'home', 'نبض', 'أعمال', 'رئيسية'], icon: 'dashboard' },
      { section: 'decision-center', path: '/command-center', label: 'مركز القرار', enLabel: 'Decision Command', description: 'الإشارات والأولويات التي تستحق الانتباه الآن', keywords: ['command', 'decision', 'قيادة', 'قرار', 'أولوية'], icon: 'command-center' },
      { section: 'decision-center', path: '/decision-inbox', label: 'صندوق القرار', enLabel: 'Decision Inbox', description: 'ما يحتاج قرارًا أو اعتمادًا أو متابعة أو نتيجة، من السجلات الكانونية', keywords: ['decision inbox', 'inbox', 'approval', 'work', 'outcome', 'قرار', 'اعتماد', 'عمل', 'نتيجة'], icon: 'decision' },
      { section: 'decision-center', path: '/decision-experience', label: 'تجربة القرار', enLabel: 'Decision Experience', description: 'الدليل والسياق والموافقة والإجراء والنتيجة', keywords: ['decision', 'evidence', 'approval', 'قرار', 'دليل', 'نتيجة'], icon: 'decision' },
      { section: 'decision-center', path: '/advisor-cases', label: 'قضايا Advisor', enLabel: 'Advisor Cases', description: 'قضايا الأعمال المحفوظة والمُتابعة من التقارير إلى القرار والنتيجة', keywords: ['advisor', 'cases', 'saved', 'follow', 'continue', 'قضايا', 'متابعة', 'استئناف'], icon: 'decision' },
    ],
  },
  {
    id: 'data-operations',
    title: 'العمل والبيانات',
    enTitle: 'Data Operations',
    items: [
      { section: 'data-operations', path: '/work-center', label: 'مركز العمل', enLabel: 'Work Center', description: 'صف التنفيذ والاستثناءات ودورات العمل', keywords: ['work center', 'jobs', 'عمليات', 'تشغيل', 'استثناء'], icon: 'work-center' },
      { section: 'data-operations', path: '/operations', label: 'مركز العمليات', enLabel: 'Operations Center', description: 'تشغيل الطلبات والفواتير والتحصيل وربطها بالتسعير والمستودع', keywords: ['operations','orders','invoices','payments','pricing','warehouse','طلبات','فواتير','تحصيل','تسعير','مستودعات'], icon: 'work-center' },
      { section: 'data-operations', path: '/import', label: 'إدخال البيانات', enLabel: 'Data Import', description: 'رفع ومعاينة واعتماد المصادر دون تجاوز مسار الحقيقة', keywords: ['import', 'upload', 'excel', 'csv', 'pdf', 'استيراد', 'رفع'], icon: 'import' },
      { section: 'data-operations', path: '/try-report', label: 'جرّب تقريرك الآن', enLabel: 'Try Your Report', description: 'تجربة العميل المباشرة: ارفع تقريرًا واحصل على قراءة استشارية قبل الحفظ', keywords: ['try report', 'demo', 'upload', 'trial', 'تجربة', 'تقريرك', 'عميل'], icon: 'document' },
      { section: 'data-operations', path: '/import/analyze', label: 'تحليل المستندات', enLabel: 'Document Analysis', description: 'استخراج المستندات وإثبات الحقول والثقة', keywords: ['document', 'ocr', 'extract', 'تحليل', 'مستند'], icon: 'document' },
      { section: 'data-operations', path: '/data-quality', label: 'جودة البيانات', enLabel: 'Data Quality', description: 'التغطية والفجوات والأخطاء والثقة', keywords: ['quality', 'dq', 'جودة', 'بيانات', 'ثقة'], icon: 'quality' },
      { section: 'data-operations', path: '/connections', label: 'مصادر البيانات', enLabel: 'Data Sources', description: 'اتصالات ومصادر النظام وحالتها', keywords: ['connections', 'sources', 'integrations', 'مصادر', 'اتصالات'], icon: 'connections' },
    ],
  },
  {
    id: 'analytics',
    title: 'التحليل التجاري',
    enTitle: 'Business Analytics',
    items: [
      { section: 'analytics', path: '/reports/sales', label: 'المبيعات', enLabel: 'Sales', description: 'اتجاه المبيعات وقيمتها وتغيراتها', keywords: ['sales', 'مبيعات'], icon: 'money' },
      { section: 'analytics', path: '/reports/purchases', label: 'المشتريات', enLabel: 'Purchases', description: 'الحركة الشرائية والإنفاق', keywords: ['purchases', 'مشتريات'], icon: 'purchases' },
      { section: 'analytics', path: '/reports/receivables', label: 'التحصيل والذمم', enLabel: 'Receivables', description: 'التحصيل والأعمار والتعرض المالي', keywords: ['receivables', 'aging', 'collection', 'ذمم', 'تحصيل'], icon: 'receivables' },
      { section: 'analytics', path: '/analytics/liquidity', label: 'السيولة والتعرض النقدي', enLabel: 'Liquidity & Exposure', description: 'قراءة الذمم والمستحقات والتحصيل دون اختلاق رصيد نقدي', keywords: ['liquidity', 'cash', 'payables', 'receivables', 'سيولة', 'نقد'], icon: 'liquidity', minimumWorkspaceMode: 'advanced' },
      { section: 'analytics', path: '/reports/profitability', label: 'الربحية والهامش', enLabel: 'Profitability', description: 'الإيراد والتكلفة والهامش', keywords: ['profitability', 'margin', 'profit', 'ربحية', 'هامش'], icon: 'profitability', minimumWorkspaceMode: 'advanced' },
      { section: 'analytics', path: '/reports/inventory', label: 'تقرير المخزون', enLabel: 'Inventory Report', description: 'حالة المخزون وقيمته', keywords: ['inventory report', 'مخزون'], icon: 'inventory-report' },
      { section: 'analytics', path: '/reports/inventory-intelligence', label: 'ذكاء المخزون', enLabel: 'Inventory Intelligence', description: 'التغطية ونقاط الخطر وإعادة الطلب', keywords: ['inventory intelligence', 'stock', 'مخزون', 'إعادة الطلب'], icon: 'inventory-intelligence', minimumWorkspaceMode: 'advanced' },
      { section: 'analytics', path: '/reports/demand-velocity', label: 'حركة الطلب', enLabel: 'Demand & Velocity', description: 'سرعة الحركة والاتجاهات', keywords: ['demand velocity', 'demand', 'velocity', 'طلب'], icon: 'demand', minimumWorkspaceMode: 'advanced' },
      { section: 'analytics', path: '/analytics', label: 'مساحة التحليلات', enLabel: 'Analytics', description: 'تحليلات تجميعية واستكشافية', keywords: ['analytics', 'تحليلات'], icon: 'analytics', minimumWorkspaceMode: 'advanced' },
      { section: 'analytics', path: '/analytics/aging', label: 'تحليل الأعمار', enLabel: 'Aging Analysis', description: 'قراءة أعمار المستحقات كتحليل مستقل', keywords: ['aging', 'أعمار', 'ذمم'], icon: 'aging', minimumWorkspaceMode: 'advanced' },
      { section: 'analytics', path: '/analytics/rfm', label: 'RFM', enLabel: 'RFM', description: 'تقسيم العملاء حسب القيمة والسلوك', keywords: ['rfm', 'عملاء', 'قيمة'], icon: 'rfm', minimumWorkspaceMode: 'advanced' },
      { section: 'analytics', path: '/analytics/abc', label: 'ABC', enLabel: 'ABC', description: 'تصنيف المنتجات حسب الأهمية والقيمة', keywords: ['abc', 'منتجات', 'أهمية'], icon: 'abc', minimumWorkspaceMode: 'advanced' },
    ],
  },
  {
    id: 'intelligence',
    title: 'الذكاء والقرار',
    enTitle: 'Intelligence & Decision',
    items: [
      { section: 'intelligence', path: '/intelligence', label: 'مركز الذكاء', enLabel: 'Intelligence Center', description: 'الإشارات والتوصيات من المصدر الكانوني', keywords: ['ai', 'intelligence', 'ذكاء', 'إشارات'], icon: 'intelligence', minimumWorkspaceMode: 'advanced' },
      { section: 'intelligence', path: '/intelligence/recommendations', label: 'التوصيات', enLabel: 'Recommendations', description: 'إجراءات مقترحة مرتبطة بسياقها وأدلتها', keywords: ['recommendations', 'actions', 'توصيات'], icon: 'recommendations', minimumWorkspaceMode: 'advanced' },
      { section: 'intelligence', path: '/intelligence/forecasts', label: 'التنبؤات', enLabel: 'Forecasts', description: 'استعراض التنبؤات المتاحة دون اختلاق نتيجة', keywords: ['forecast', 'forecasts', 'تنبؤات'], icon: 'forecasts', minimumWorkspaceMode: 'advanced' },
      { section: 'intelligence', path: '/intelligence/scenarios', label: 'السيناريوهات', enLabel: 'Scenarios', description: 'محاكاة محكومة منفصلة عن الحقيقة التشغيلية', keywords: ['scenarios', 'scenario', 'سيناريوهات'], icon: 'scenarios', minimumWorkspaceMode: 'advanced' },
    ],
  },
  {
    id: 'trust',
    title: 'الثقة والأدلة',
    enTitle: 'Trust & Evidence',
    items: [
      { section: 'trust', path: '/trust', label: 'مركز الثقة والأدلة', enLabel: 'Trust & Evidence', description: 'حالة الحقيقة ومسارات الإثبات من المصدر إلى القرار', keywords: ['trust', 'evidence', 'truth', 'ثقة', 'أدلة'], icon: 'trust' },
      { section: 'trust', path: '/metrics', label: 'تفسير المؤشرات', enLabel: 'Metric Inspector', description: 'هوية المؤشر وصيغة الحساب ومصدره وحالته', keywords: ['metrics', 'kpi', 'evidence'], icon: 'metrics', minimumWorkspaceMode: 'advanced' },
    ],
  },
  {
    id: 'outputs',
    title: 'التقارير والمخرجات',
    enTitle: 'Reports & Outputs',
    items: [
      { section: 'outputs', path: '/reports', label: 'مركز التقارير', enLabel: 'Reports Center', description: 'التقارير التنفيذية والتفصيلية ومخرجات الأداء', keywords: ['reports', 'تقارير'], icon: 'reports' },
      { section: 'outputs', path: '/reports/executive', label: 'التقرير التنفيذي', enLabel: 'Executive Report', description: 'قصة الأداء والقرارات للإدارة', keywords: ['executive report', 'management'], icon: 'executive-report' },
      { section: 'outputs', path: '/replay', label: 'إعادة تشغيل الأعمال', enLabel: 'Business Replay', description: 'خط زمني مصدرّي من التقرير إلى القرار والعمل والنتيجة', keywords: ['replay', 'timeline', 'قرارات', 'إجراءات'], icon: 'replay' },
      { section: 'outputs', path: '/benchmark', label: 'المعيار المقارن', enLabel: 'Benchmark', description: 'جاهزية المقارنة ومعايير العينة دون اختلاق مرجع', keywords: ['benchmark', 'cohort', 'مقارنة', 'عينة'], icon: 'benchmark' },
    ],
  },
  {
    id: 'reference',
    title: 'البيانات المرجعية',
    enTitle: 'Master Data',
    items: [
      { section: 'reference', path: '/master-data', label: 'مركز البيانات المرجعية', enLabel: 'Master Data Center', description: 'مدخل موحد للكيانات المرجعية والسياق الدلالي', keywords: ['master data', 'reference', 'بيانات مرجعية'], icon: 'master-data' },
      { section: 'reference', path: '/suppliers', label: 'الموردون', enLabel: 'Suppliers', description: 'هوية الموردين وسياقهم المرجعي المرتبط بالمشتريات', keywords: ['suppliers', 'vendors', 'موردون'], icon: 'suppliers', minimumWorkspaceMode: 'advanced' },
      { section: 'reference', path: '/customers', label: 'العملاء', enLabel: 'Customers', description: 'الكيانات والعملاء وشرائحهم', keywords: ['customers', 'clients', 'عملاء'], icon: 'customers' },
      { section: 'reference', path: '/products', label: 'المنتجات', enLabel: 'Products', description: 'الأصناف والمنتجات والهوية المرجعية', keywords: ['products', 'sku', 'منتجات', 'أصناف'], icon: 'products' },
      { section: 'reference', path: '/inventory', label: 'المخزون', enLabel: 'Inventory', description: 'مرجع المخزون وحركته', keywords: ['inventory', 'stock', 'مخزون'], icon: 'inventory' },
      { section: 'reference', path: '/alternative-groups', label: 'مجموعات البدائل', enLabel: 'Alternative Groups', description: 'ربط الأصناف البديلة ضمن مجموعات قابلة للتحقيق', keywords: ['alternative groups', 'substitutes', 'بدائل'], icon: 'alternatives', minimumWorkspaceMode: 'advanced' },
    ],
  },
  {
    id: 'admin',
    title: 'الإعدادات والتجهيز',
    enTitle: 'Settings & Setup',
    items: [
      { section: 'admin', path: '/onboarding', label: 'تجهيز المنصة', enLabel: 'Platform Setup', description: 'تهيئة مساحة الشركة ومسار البدء', keywords: ['onboarding', 'setup', 'تهيئة'], icon: 'onboarding' },
      { section: 'admin', path: '/settings', label: 'إعدادات الشركة', enLabel: 'Company Settings', description: 'إعدادات المنتج ومساحة العمل', keywords: ['settings', 'config', 'إعدادات'], icon: 'settings' },
      { section: 'admin', path: '/settings/profile', label: 'الملف الشخصي', enLabel: 'Profile', description: 'هوية المستخدم داخل المنصة', keywords: ['profile', 'account', 'ملف', 'حساب'], icon: 'profile' },
    ],
  },
];

export const NAVIGATION_ITEMS = NAVIGATION_SECTIONS.flatMap(section => section.items);

export function resolveNavigationItem(path: string): NavigationItem | null {
  return [...NAVIGATION_ITEMS]
    .sort((a, b) => b.path.length - a.path.length)
    .find(item => path === item.path || (item.path !== '/' && path.startsWith(item.path + '/'))) ?? null;
}
