export type ReportFormat='executive'|'inventory'|'cashflow'|'sales'|'customer'|'supplier'|'data-quality';
export interface ReportTemplate{key:ReportFormat;title:string;description:string;sections:string[];requiredDomains:string[]}
export const REPORT_TEMPLATES:ReportTemplate[]=[
{key:'executive',title:'التقرير التنفيذي',description:'ملخص القرار والأداء والمخاطر والأولويات',sections:['health','kpis','alerts','actions','evidence'],requiredDomains:['inventory','cash','sales']},
{key:'inventory',title:'ذكاء المخزون',description:'السيولة والسرعة والركود وإعادة الطلب',sections:['velocity','liquidity','stockout','reorder','actions'],requiredDomains:['inventory','sales']},
{key:'cashflow',title:'السيولة والالتزامات',description:'التدفقات والاستحقاقات ومخاطر السيولة',sections:['cash-position','receivables','payables','stress','actions'],requiredDomains:['cash']},
{key:'sales',title:'أداء المبيعات',description:'السرعة والاتجاه والأصناف والعملاء',sections:['velocity','trend','top-bottom','customers','actions'],requiredDomains:['sales']},
{key:'customer',title:'ذكاء العملاء',description:'النشاط والانقطاع والقيمة والأولوية',sections:['segments','inactive','value','retention','actions'],requiredDomains:['customer']},
{key:'supplier',title:'ذكاء الموردين',description:'الحركة والاستحقاقات والأولوية',sections:['movement','payables','reliability','priority','actions'],requiredDomains:['supplier']},
{key:'data-quality',title:'جودة البيانات',description:'مصادر البيانات ونسب الاكتمال والمشاكل',sections:['score','checks','errors','coverage','recommendations'],requiredDomains:['data']}
];
export function getReportTemplate(key:ReportFormat){return REPORT_TEMPLATES.find(t=>t.key===key)??REPORT_TEMPLATES[0];}
export function canRenderTemplate(key:ReportFormat,availableDomains:string[]){const t=getReportTemplate(key);return t.requiredDomains.every(d=>availableDomains.includes(d));}
