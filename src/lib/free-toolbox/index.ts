export * from './statistics';
export * from './profiler';
export * from './forecast';

/**
 * Built-in free/open-source capability registry. Product UI shows capabilities,
 * not vendor names. Provider adapters can be swapped without changing reports.
 */
export const FREE_CAPABILITIES = [
  {id:'local-statistics',label:'إحصاء وتحليل وصفي',mode:'local',cost:'free'},
  {id:'data-profiler',label:'فحص جودة البيانات واكتشاف الشذوذ',mode:'local',cost:'free'},
  {id:'forecast-baseline',label:'تنبؤ أساسي قابل للتدقيق',mode:'local',cost:'free'},
  {id:'abc-rfm',label:'ABC وRFM وتقسيم العملاء',mode:'local',cost:'free'},
  {id:'pdf-ingestion',label:'قراءة PDF والجداول',mode:'local',cost:'free'},
  {id:'office-ingestion',label:'Excel/CSV/Word ingestion',mode:'local',cost:'free'},
  {id:'ocr',label:'OCR للمستندات والصور',mode:'local',cost:'free'},
  {id:'charts',label:'لوحات ورسوم تفاعلية',mode:'local',cost:'free'},
  {id:'semantic-layer',label:'قاموس مقاييس الأعمال وLineage',mode:'local',cost:'free'},
  {id:'decision-engine',label:'محرك التوصيات والقرارات',mode:'local',cost:'free'},
] as const;
