export type ErpSource='onyx-pro'|'motakamel-plus'|'roqsh'|'generic-arabic-erp';
export type ReportDomain='inventory'|'sales'|'purchases'|'customers'|'suppliers'|'accounts'|'transfers'|'adjustments'|'profitability'|'aging'|'unknown';
export interface HeaderDefinition {canonical:string;aliases:string[];kind:'text'|'number'|'date'|'currency'|'quantity'|'identifier'|'status';}
export interface ReportSchema {source:ErpSource;domain:ReportDomain;version:'known'|'adaptive';required:string[];optional:string[];headers:HeaderDefinition[];}
export interface ClassificationEvidence {source:ErpSource;domain:ReportDomain;score:number;matchedCanonical:string[];matchedAliases:string[];unknownHeaders:string[];reasons:string[];}
export const CORE_HEADERS:HeaderDefinition[]=[
{canonical:'sku',aliases:['رقم الصنف','كود الصنف','كود المادة','رقم المادة','رمز الصنف','رقم المنتج','SKU','Item Code','Product Code'],kind:'identifier'},
{canonical:'item_name',aliases:['اسم الصنف','اسم المادة','اسم المنتج','وصف الصنف','Item Name','Product Name','Description'],kind:'text'},
{canonical:'unit',aliases:['الوحدة','وحدة القياس','Unit','UOM'],kind:'text'},
{canonical:'warehouse',aliases:['المخزن','المستودع','المخزن/المستودع','Warehouse','Store'],kind:'text'},
{canonical:'quantity',aliases:['الكمية','كمية','Quantity','Qty'],kind:'quantity'},
{canonical:'current_stock',aliases:['الرصيد الحالي','الرصيد','الكمية المتوفرة','المتوفر','Current Stock','Balance','Available Qty'],kind:'quantity'},
{canonical:'opening_balance',aliases:['الرصيد الافتتاحي','بداية الفترة','Opening Balance'],kind:'quantity'},
{canonical:'net_sales_qty',aliases:['صافي المبيعات','كمية المبيعات','المبيعات الصافية','Net Sales Qty','Sold Qty'],kind:'quantity'},
{canonical:'customer_id',aliases:['رقم العميل','كود العميل','رمز العميل','Customer No','Customer Code'],kind:'identifier'},
{canonical:'customer_name',aliases:['اسم العميل','اسم الزبون','Customer Name'],kind:'text'},
{canonical:'supplier_id',aliases:['رقم المورد','كود المورد','Supplier No','Supplier Code'],kind:'identifier'},
{canonical:'supplier_name',aliases:['اسم المورد','Vendor Name','Supplier Name'],kind:'text'},
{canonical:'invoice_no',aliases:['رقم الفاتورة','رقم الفاتورة/السند','رقم المستند','Invoice No','Document No'],kind:'identifier'},
{canonical:'transaction_date',aliases:['التاريخ','تاريخ الحركة','تاريخ الفاتورة','Date','Transaction Date'],kind:'date'},
{canonical:'price',aliases:['السعر','سعر البيع','سعر الوحدة','Price','Unit Price'],kind:'currency'},
{canonical:'net_amount',aliases:['الصافي','صافي المبيعات','المبلغ الصافي','Net Amount','Net Sales'],kind:'currency'},
{canonical:'discount',aliases:['الخصم','قيمة الخصم','Discount'],kind:'currency'},
{canonical:'cost_amount',aliases:['التكلفة','تكلفة المبيعات','تكلفة الشراء','Cost','Cost Amount'],kind:'currency'},
{canonical:'gross_profit',aliases:['مجمل الربح','إجمالي الربح','الربح الإجمالي','Gross Profit'],kind:'currency'},
{canonical:'profit_margin',aliases:['هامش الربح','نسبة الربح','نسبة الربحية','Profit Margin','Margin %'],kind:'number'},
{canonical:'collections',aliases:['المحصل','التحصيل','المبالغ المحصلة','Collections','Paid'],kind:'currency'},
{canonical:'customer_balance',aliases:['رصيد العميل','الرصيد المستحق','المديونية','Customer Balance','Receivable'],kind:'currency'},
{canonical:'due_date',aliases:['تاريخ الاستحقاق','تاريخ الاستحقاق المالي','Due Date'],kind:'date'},
{canonical:'document_type',aliases:['نوع السند','نوع المستند','نوع الحركة','Document Type','Transaction Type'],kind:'status'},
{canonical:'source_warehouse',aliases:['المخزن المحول منه','المستودع المصدر','From Warehouse','Source Warehouse'],kind:'text'},
{canonical:'destination_warehouse',aliases:['المخزن المحول إليه','المستودع المستلم','To Warehouse','Destination Warehouse'],kind:'text'},
{canonical:'expiry_date',aliases:['تاريخ الانتهاء','تاريخ الصلاحية','Expiry Date','Expiration Date'],kind:'date'}
];
const norm=(s:string)=>s.toLowerCase().normalize('NFKC').replace(/[ً-ٟ]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/[\s_\-./\\]+/g,' ').trim();
const aliasMap=new Map<string,HeaderDefinition>(CORE_HEADERS.flatMap(h=>h.aliases.map(a=>[norm(a),h] as const)));
export function mapHeaders(headers:string[]){return headers.map(h=>({header:h,definition:aliasMap.get(norm(h))??null}));}
export function classifyReport(headers:string[]):ClassificationEvidence[]{const mapped=mapHeaders(headers);const matched=[...new Set(mapped.flatMap(x=>x.definition?[x.definition.canonical]:[]))];const unknown=mapped.filter(x=>!x.definition).map(x=>x.header);const has=(...xs:string[])=>xs.some(x=>matched.includes(x));const candidates:ClassificationEvidence[]=[];const push=(source:ErpSource,domain:ReportDomain,signals:string[],reason:string)=>{const hits=signals.filter(s=>matched.includes(s));if(hits.length){candidates.push({source,domain,score:Math.min(1,.45+hits.length/signals.length*.55),matchedCanonical:hits,matchedAliases:mapped.filter(x=>x.definition&&hits.includes(x.definition.canonical)).map(x=>x.header),unknownHeaders:unknown,reasons:[reason]});}};for(const source of ['onyx-pro','motakamel-plus','roqsh','generic-arabic-erp'] as ErpSource[]) {push(source,'inventory',['sku','item_name','current_stock','warehouse','unit'],'مؤشرات مخزون');push(source,'sales',['sku','item_name','net_sales_qty','price','transaction_date'],'مؤشرات مبيعات');push(source,'customers',['customer_id','customer_name','customer_balance'],'مؤشرات عملاء');push(source,'purchases',['supplier_id','supplier_name','invoice_no','cost_amount'],'مؤشرات مشتريات');push(source,'transfers',['sku','source_warehouse','destination_warehouse','quantity'],'مؤشرات تحويلات');push(source,'profitability',['net_amount','cost_amount','gross_profit','profit_margin'],'مؤشرات ربحية');push(source,'aging',['customer_id','customer_balance','due_date'],'مؤشرات أعمار ذمم');}return candidates.sort((a,b)=>b.score-a.score);}
