export type ExperienceCommand = {
  id: string;
  label: string;
  description: string;
  shortcut?: string;
  path?: string;
  keywords: string[];
};

export const EXPERIENCE_COMMANDS: ExperienceCommand[] = [
  { id: 'dashboard', label: 'لوحة القيادة', description: 'نظرة تنفيذية على حالة الأعمال', shortcut: 'G D', path: '/', keywords: ['dashboard', 'لوحة', 'رئيسية'] },
  { id: 'cockpit', label: 'غرفة القرار التنفيذية', description: 'المخاطر والفرص والقرارات ذات الأولوية', shortcut: 'G C', path: '/cockpit', keywords: ['cockpit', 'قرار', 'تنفيذي'] },
  { id: 'command-center', label: 'مركز القيادة', description: 'المخزون والسيولة والسرعة', path: '/command-center', keywords: ['command', 'مخزون', 'سيولة'] },
  { id: 'chat', label: 'اسأل بياناتك', description: 'تحليل طبيعي مع أدلة وحقائق موثقة', shortcut: 'G A', path: '/chat', keywords: ['chat', 'ai', 'سؤال', 'بيانات'] },
  { id: 'import', label: 'استيراد البيانات', description: 'تحميل ومعاينة وربط الملفات', path: '/import', keywords: ['import', 'excel', 'csv', 'pdf', 'استيراد'] },
  { id: 'data-quality', label: 'جودة البيانات', description: 'النواقص والتعارضات والثقة', path: '/data-quality', keywords: ['quality', 'جودة', 'نقص'] },
  { id: 'inventory', label: 'ذكاء المخزون', description: 'التغطية وإعادة الطلب والمخاطر', path: '/inventory/intelligence', keywords: ['inventory', 'stock', 'مخزون', 'شراء'] },
  { id: 'forecast', label: 'التنبؤ', description: 'الطلب والتنبؤ والاختبار الخلفي', path: '/inventory/forecast', keywords: ['forecast', 'تنبؤ', 'طلب'] },
  { id: 'finance', label: 'غرفة السيولة', description: 'النقد والتحصيل والالتزامات', path: '/finance/intelligence', keywords: ['cash', 'finance', 'سيولة', 'مالية'] },
  { id: 'decisions', label: 'مركز القرار', description: 'قائمة القرارات الموثقة', path: '/decisions', keywords: ['decision', 'قرار', 'توصيات'] },
  { id: 'reports', label: 'مركز التقارير', description: 'تقارير الأعمال القابلة للتخصيص', path: '/reports', keywords: ['report', 'تقارير'] },
  { id: 'studio', label: 'استوديو التقارير', description: 'إنشاء تقرير وتحكم في العرض', path: '/reports/studio', keywords: ['studio', 'تقرير', 'تصميم'] },
  { id: 'customers', label: 'العملاء', description: 'العملاء وRFM وخطر الخمول', path: '/customers', keywords: ['customer', 'عميل', 'rfm'] },
  { id: 'products', label: 'المنتجات', description: 'المنتجات والأسعار والمخزون', path: '/products', keywords: ['product', 'منتج'] },
  { id: 'settings', label: 'الإعدادات', description: 'إعدادات مساحة العمل', path: '/settings', keywords: ['settings', 'إعدادات'] },
];

export const EXPERIENCE_GROUPS = [
  { id: 'navigate', label: 'تنقل' },
  { id: 'analyze', label: 'تحليل' },
  { id: 'operate', label: 'تشغيل' },
  { id: 'manage', label: 'إدارة' },
] as const;

export const VIEW_MODES = ['table', 'chart', 'board'] as const;
export type ViewMode = typeof VIEW_MODES[number];

export function scoreExperienceCommand(command: ExperienceCommand, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return 0;
  const haystack = [command.label, command.description, ...command.keywords].join(' ').toLocaleLowerCase();
  if (command.label.toLocaleLowerCase().startsWith(normalized)) return 100;
  if (haystack.includes(normalized)) return 75;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 10 : 0), 0);
}

export function rankExperienceCommands(commands: ExperienceCommand[], query: string) {
  return commands
    .map(command => ({ command, score: scoreExperienceCommand(command, query) }))
    .filter(item => !query.trim() || item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.command);
}
