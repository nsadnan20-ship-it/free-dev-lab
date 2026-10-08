import { matchCanonicalField, type CanonicalField } from './canonical-schema.js';
import { buildAdvisoryPacket, type AdvisoryPacket, type AdvisoryPacketInput } from './report-advisory-orchestrator.js';
import { deriveReportIntelligence } from './report-smart-insights.js';
import { applyArchetypeRuleSet, type PersistedIntelligenceCalculation } from './archetype-evaluator.js';
import { attachArchetypeRuleFamily, type ArchetypeRuleFamily } from './archetype-rule-map.js';

export type ArchetypeDomain =
  | 'sales'
  | 'purchases'
  | 'inventory'
  | 'customers'
  | 'suppliers'
  | 'finance'
  | 'demand';

export type ArchetypeRuntimeState =
  | 'SUPPORTED'
  | 'NOT_AVAILABLE'
  | 'INSUFFICIENT_SAMPLE'
  | 'REVIEW_REQUIRED'
  | 'BLOCKED';

export type ArchetypeProfile = {
  number: number;
  id: string;
  title: string;
  domain: ArchetypeDomain;
  adapterSpecialty: 'sales' | 'purchases' | 'inventory' | 'receivables' | 'payments' | 'profitability';
  version: 1;
  aliases: string[];
  grain: string;
  requiredFields: CanonicalField[];
  optionalFields: CanonicalField[];
  minimumSample: number;
  capabilities: string[];
  recommendationFocus: string[];
  recommendationRules: string[];
  decisionQuestions: string[];
  provenanceRequirements: string[];
  evidenceRequirements: string[];
  evaluatorId: string;
  limitations: string[];
  ruleFamily?: ArchetypeRuleFamily;
};

const p = (
  number: number,
  id: string,
  title: string,
  domain: ArchetypeDomain,
  adapterSpecialty: ArchetypeProfile['adapterSpecialty'],
  aliases: string[],
  grain: string,
  requiredFields: CanonicalField[],
  optionalFields: CanonicalField[],
  minimumSample: number,
  capabilities: string[],
  recommendationFocus: string[],
): ArchetypeProfile => ({
  number,
  id,
  title,
  domain,
  adapterSpecialty,
  version: 1,
  aliases,
  grain,
  requiredFields,
  optionalFields,
  minimumSample,
  capabilities,
  recommendationFocus,
  recommendationRules: recommendationFocus.map((focus) => 'recommend-only-when-evidence-supports:' + focus),
  decisionQuestions: ['ماذا حدث؟', 'أين تركز التغير؟', 'ما الدليل؟', 'ما الإجراء التالي؟', 'ماذا حدث بعد الإجراء؟'],
  provenanceRequirements: ['tenantId', 'sourceHash', 'reportExecutionJobId', 'evidenceSnapshotId|evidencePassportId'],
  evidenceRequirements: ['tenantId', 'sourceHash', 'reportExecutionJobId', 'evidenceSnapshotId|evidencePassportId'],
  evaluatorId: 'archetype.evaluator.' + id,
  limitations: ['لا تُثبت السببية من الوصف وحده.', 'الحقول غير المتاحة لا تُستبدل بقيم مفترضة.'],
});

const REPORT_ARCHETYPES_RAW: readonly ArchetypeProfile[] = [
  p(1,'sales.over-time','المبيعات الإجمالية عبر الزمن','sales','sales',['sales','إجمالي المبيعات','sales trend'],'transaction-period',['documentDate','netAmount'],['customerCode','customerName','productCode','productName','quantity','cost'],6,['trend','growth','period-comparison','contributors','detractors','anomaly','concentration'],['مراجعة اتجاه المبيعات وأهم محركات التغير']),
  p(2,'sales.invoice-detail','تفاصيل فواتير المبيعات','sales','sales',['sales invoices','فواتير المبيعات'],'invoice-line',['documentNo','documentDate','netAmount'],['customerCode','customerName','productCode','productName','quantity','unitPrice','discount','grossAmount','cost'],12,['invoice-volume','average-invoice','customer-mix','product-mix','outliers','discounts','payment-trace'],['مراجعة الفواتير الشاذة ومصادر القيمة']),
  p(3,'sales.by-customer','المبيعات حسب العميل','sales','sales',['sales by customer','مبيعات العملاء'],'customer-period',['customerCode','netAmount'],['customerName','documentDate','quantity','productCode'],12,['customer-value','activity','trend','concentration','churn-signal','drilldown'],['مراجعة تركّز العملاء والعملاء المتغيرين']),
  p(4,'sales.by-customer-month','المبيعات حسب العميل والشهر','sales','sales',['customer monthly sales','مبيعات العميل الشهرية'],'customer-month',['customerCode','documentDate','netAmount'],['customerName','quantity','productCode'],12,['continuity','recency','acceleration','deceleration','portfolio-map'],['مراجعة الانقطاع والتسارع حسب العميل']),
  p(5,'sales.by-product','المبيعات حسب الصنف','sales','sales',['sales by product','مبيعات الأصناف'],'product-period',['productCode','netAmount'],['productName','documentDate','quantity','customerCode','cost'],12,['top-bottom','growth','velocity','concentration','outliers','inventory-crosscheck'],['مراجعة الأصناف القيادية والمتراجعة']),
  p(6,'sales.by-category-brand','المبيعات حسب الفئة/العلامة','sales','sales',['sales category','brand sales'],'category-period',['category','netAmount'],['productCode','productName','customerCode','documentDate'],12,['category-contribution','mix-shift','growth','drivers','concentration'],['مراجعة تحول مزيج الفئات']),
  p(7,'sales.by-branch-warehouse','المبيعات حسب الفرع/المخزن','sales','sales',['branch sales','warehouse sales'],'location-period',['warehouse','netAmount'],['documentDate','productCode','customerCode','quantity'],12,['branch-comparison','contribution','productivity','anomaly','imbalance'],['مراجعة اختلال المبيعات بين المواقع']),
  p(8,'sales.by-representative','المبيعات حسب المندوب','sales','sales',['sales representative','مندوب المبيعات'],'representative-period',['salesRep','netAmount'],['documentDate','customerCode','productCode'],12,['representative-contribution','portfolio-trend','mix','concentration','drilldown'],['مراجعة محفظة المندوبين والانحرافات']),
  p(9,'sales.returns','مرتجعات المبيعات','sales','sales',['sales returns','مرتجعات المبيعات'],'return-line',['productCode','quantity','returnQty'],['customerCode','documentDate','netAmount','unitPrice'],12,['return-rate','trend','spikes','customer-concentration','product-concentration','cause-when-present'],['مراجعة بؤر المرتجعات قبل الإجراء']),
  p(10,'sales.discounts','الخصومات','sales','sales',['discounts','خصومات المبيعات'],'invoice-line',['documentNo','discount'],['documentDate','customerCode','productCode','netAmount','cost'],12,['discount-distribution','outliers','customer-mix','product-mix','margin-impact-when-cost-exists'],['مراجعة الخصومات المؤثرة على القيمة والهامش']),
  p(11,'sales.payment-terms','المبيعات حسب طريقة الدفع/الشروط','sales','sales',['payment terms','طرق الدفع'],'invoice-payment',['paymentMethod','netAmount'],['documentDate','customerCode','dueDate','currency'],12,['cash-credit-mix','shift','exposure','receivables-link','collection-opportunity'],['مراجعة التحول بين النقد والآجل والتعرض']),
  p(12,'sales.target-vs-actual','المستهدف مقابل الفعلي','sales','sales',['target actual','المستهدف والفعلي'],'target-period',['targetAmount','netAmount'],['documentDate','customerCode','productCode'],6,['gap','pace','trend','contributors','detractors','forecast-when-valid'],['مراجعة الفجوة وتصحيح المسار']),

  p(13,'purchases.over-time','المشتريات الإجمالية عبر الزمن','purchases','purchases',['purchases','إجمالي المشتريات'],'purchase-period',['documentDate','netAmount'],['supplierCode','productCode','quantity','cost'],6,['spend-trend','drivers','spikes','concentration','opportunity'],['مراجعة اتجاه الإنفاق ومحركاته']),
  p(14,'purchases.invoice-detail','تفاصيل فواتير المشتريات','purchases','purchases',['purchase invoices','فواتير المشتريات'],'purchase-line',['documentNo','documentDate','netAmount'],['supplierCode','supplierName','productCode','productName','quantity','unitPrice','cost'],12,['supplier-item','price','quantity','outliers','concentration','trace'],['مراجعة الفواتير والأسعار الشاذة']),
  p(15,'purchases.by-supplier','المشتريات حسب المورد','purchases','purchases',['purchases by supplier','مشتريات الموردين'],'supplier-period',['supplierCode','netAmount'],['supplierName','documentDate','productCode','unitPrice'],12,['supplier-value','dependency','trend','continuity','price-signal','risk'],['مراجعة الاعتماد على الموردين']),
  p(16,'purchases.by-supplier-month','المشتريات حسب المورد والشهر','purchases','purchases',['supplier monthly purchases','مشتريات المورد الشهرية'],'supplier-month',['supplierCode','documentDate','netAmount'],['supplierName','productCode','quantity'],12,['continuity','seasonality','supplier-shift','spikes','concentration'],['مراجعة تغير نمط التوريد']),
  p(17,'purchases.by-product-category','المشتريات حسب الصنف/الفئة','purchases','purchases',['purchase product mix','مزيج المشتريات'],'product-period',['productCode','netAmount'],['productName','documentDate','supplierCode','quantity','unitPrice'],12,['mix','growth','price-quantity-decomposition','concentration','demand-linkage'],['مراجعة الأصناف والفئات التي ترفع التكلفة']),
  p(18,'purchases.price-change','تغير أسعار الشراء','purchases','purchases',['purchase price change','تغير أسعار الشراء'],'product-price-period',['productCode','unitPrice','documentDate'],['supplierCode','productName','cost','netAmount'],12,['price-variance','affected-items','timing','magnitude','margin-pressure'],['مراجعة ضغط التكلفة قبل التسعير']),
  p(19,'purchases.returns','مرتجعات المشتريات','purchases','purchases',['purchase returns','مرتجعات المشتريات'],'return-line',['supplierCode','quantity','returnQty'],['productCode','documentDate','netAmount'],12,['return-rate','supplier-concentration','trend','anomaly','quality-signal'],['مراجعة جودة التوريد والمرتجعات']),
  p(20,'purchases.by-branch-warehouse','المشتريات حسب الفرع/المخزن','purchases','purchases',['branch purchases','warehouse purchases'],'location-period',['warehouse','netAmount'],['documentDate','supplierCode','productCode','quantity'],12,['branch-demand','allocation','imbalance','supplier-exposure','opportunity'],['مراجعة توزيع المشتريات على المواقع']),
  p(21,'purchases.supplier-concentration','تركيز الموردين/الاعتماد عليهم','suppliers','purchases',['supplier concentration','تركيز الموردين'],'supplier-period',['supplierCode','netAmount'],['supplierName','documentDate','productCode'],12,['top-supplier-share','dependency','single-supplier-risk','diversification'],['مراجعة مخاطر الاعتماد والتركيز']),
  p(22,'purchases.supply-cycle','أداء دورة الشراء/التوريد','suppliers','purchases',['supply cycle','lead time','أداء التوريد'],'supplier-cycle',['supplierCode','documentDate','leadTimeDays'],['supplierName','productCode','dueDate','quantity','netAmount'],12,['lead-time','delay','fulfillment','supplier-comparison','exceptions'],['مراجعة الاستثناءات في دورة التوريد']),

  p(23,'inventory.balances','أرصدة المخزون','inventory','inventory',['inventory balances','أرصدة المخزون'],'product-location',['productCode','currentStock'],['productName','warehouse','cost','netAmount'],1,['on-hand','value','concentration','zero-negative','branch-comparison','working-capital'],['مراجعة المخزون غير الطبيعي والقيمة المعرضة']),
  p(24,'inventory.movement-card','بطاقة/حركة الصنف','inventory','inventory',['item movement','حركة الصنف'],'product-period',['productCode','openingStock','inbound','outbound','currentStock'],['openingBalance','inbound','outbound','currentStock','documentDate','warehouse','quantity'],1,['opening-in-out-closing','movement-trend','abnormal-movements','reconciliation','trace'],['مراجعة مسار حركة الصنف والتسوية']),
  p(25,'inventory.aging','أعمار المخزون والراكد','inventory','inventory',['inventory aging','الراكد'],'product-aging',['productCode','currentStock','documentDate'],['productName','documentDate','cost','warehouse','salesQty'],12,['aging-bands','dead-slow','value-at-risk','liquidation-candidates'],['مراجعة رأس المال المجمد وفرص التصفية']),
  p(26,'inventory.velocity','سرعة دوران الأصناف','inventory','inventory',['inventory velocity','سرعة الدوران'],'product-period',['productCode','salesQty','documentDate'],['documentDate','currentStock','warehouse','quantity'],12,['velocity','movement-class','trend','seasonality','stock-linkage'],['مراجعة المنتجات السريعة والبطيئة']),
  p(27,'inventory.coverage','تغطية المخزون','inventory','inventory',['stock coverage','تغطية المخزون'],'product-period',['productCode','currentStock','salesQty'],['documentDate','warehouse','quantity'],12,['days-weeks-cover','excess-shortage','coverage-risk'],['مراجعة الأصناف المعرضة للنفاد أو التكدس']),
  p(28,'inventory.stockout-reorder','نفاد المخزون وإعادة الطلب','inventory','inventory',['stockout reorder','إعادة الطلب','الفترة المتوقعة لنفاد الكمية','expected stockout period'],'product-period',['productCode','currentStock','salesQty'],['documentDate','supplierCode','quantity','dueDate','leadTimeDays'],12,['stockout-risk','reorder-point','suggested-quantity-when-valid','priority-queue'],['مراجعة أولوية إعادة الطلب']),
  p(29,'inventory.valuation','تقييم المخزون','inventory','inventory',['inventory valuation','تقييم المخزون'],'product-location',['productCode','currentStock','cost'],['productName','warehouse'],12,['quantity-cost-value','concentration','valuation-anomaly','reconciliation'],['مراجعة قيمة المخزون وتعرضه']),
  p(30,'inventory.location-comparison','مقارنة المخازن/الفروع','inventory','inventory',['warehouse comparison','مقارنة المخازن'],'product-location',['warehouse','productCode','currentStock'],['salesQty','cost','netAmount'],12,['imbalance','over-understock','transfer-candidates','concentration'],['مراجعة فرص إعادة التوزيع']),
  p(31,'inventory.abnormal-adjustments','تسويات/حركات غير طبيعية للمخزون','inventory','inventory',['inventory adjustments','تسويات المخزون'],'movement-line',['productCode','quantity'],['documentDate','warehouse','inbound','outbound','currentStock'],12,['unusual-adjustments','negative-balances','spikes','duplicate-like','investigation'],['مراجعة الحركات غير الطبيعية قبل اعتماد قرار']),
  p(32,'inventory.transfers','التحويلات بين المخازن','inventory','inventory',['warehouse transfers','تحويلات المخازن'],'transfer-line',['productCode','warehouse','quantity'],['documentDate','currentStock'],12,['source-destination-flow','imbalance','frequency','concentration','transfer-optimization'],['مراجعة فرص التحويل بين المواقع']),

  p(33,'customers.activity','دليل العملاء/نشاطهم','customers','sales',['customer activity','نشاط العملاء'],'customer-period',['customerCode'],['customerName','documentDate','netAmount','quantity','productCode'],1,['active-inactive-new-recovered','recency','frequency','value','segment','next-action'],['مراجعة العملاء الذين يحتاجون متابعة']),
  p(34,'customers.statement','كشف حساب العميل/الذمم','customers','receivables',['customer statement','كشف حساب العميل'],'customer-statement',['customerCode','netAmount','dueDate'],['customerName','documentDate','dueDate','currency'],12,['outstanding','aging','debit-credit','overdue','concentration','collection-priority'],['مراجعة أولويات التحصيل']),
  p(35,'customers.continuity','استمرارية/خمول العملاء','customers','sales',['customer continuity','خمول العملاء'],'customer-period',['customerCode','documentDate'],['customerName','netAmount','productCode','quantity'],12,['churn-signal','inactivity','historical-value','revival-candidates','risk-map'],['مراجعة إشارات الخمول والاستعادة']),
  p(36,'customers.rfm-abc-xyz','RFM / ABC / XYZ للعملاء','customers','sales',['customer RFM','RFM العملاء'],'customer-period',['customerCode','documentDate','netAmount'],['customerName','productCode','quantity'],12,['monetary','recency','frequency','concentration','behavior-clusters','action-segments'],['مراجعة شرائح العملاء ذات الأولوية']),
  p(37,'customers.product-intelligence','ذكاء العميل × المنتج','customers','sales',['customer product','العميل والمنتج'],'customer-product',['customerCode','productCode'],['customerName','productName','documentDate','quantity','netAmount'],12,['mix','cross-sell','lost-product-links','concentration','basket-opportunity','drilldown'],['مراجعة فرص التوسع وفقد العلاقات']),

  p(38,'suppliers.activity','دليل الموردين/نشاطهم','suppliers','purchases',['supplier activity','نشاط الموردين'],'supplier-period',['supplierCode'],['supplierName','documentDate','netAmount','productCode'],1,['active-inactive','purchase-value','continuity','concentration','portfolio'],['مراجعة الموردين وتغير نشاطهم']),
  p(39,'suppliers.statement','كشف حساب المورد/الذمم الدائنة','suppliers','receivables',['supplier statement','كشف حساب المورد'],'supplier-statement',['supplierCode','netAmount','dueDate'],['supplierName','documentDate','dueDate','currency'],12,['outstanding','aging','due-dates','concentration','payment-priority'],['مراجعة أولويات الالتزامات']),
  p(40,'suppliers.performance','أداء المورد','suppliers','purchases',['supplier performance','أداء المورد'],'supplier-period',['supplierCode','documentDate','leadTimeDays'],['supplierName','dueDate','quantity','unitPrice','netAmount'],12,['delivery','price','consistency','exceptions','dependency','review-list'],['مراجعة استثناءات المورد وأدائه']),

  p(41,'finance.cash-bank','حركة الصندوق/البنك','finance','payments',['cash bank','حركة النقد'],'cash-period',['documentDate','netAmount'],['currency','documentNo'],6,['inflow','outflow','net-movement','concentration','anomaly','timing','liquidity'],['مراجعة حركة النقد والشذوذات']),
  p(42,'finance.receivables-aging','أعمار الذمم المدينة','finance','receivables',['receivables aging','أعمار الذمم المدينة'],'customer-aging',['customerCode','dueDate','netAmount'],['customerName','documentDate','currency'],12,['aging-buckets','overdue-exposure','concentration','collection-queue','trend'],['مراجعة التعرض المتأخر وأولوية التحصيل']),
  p(43,'finance.payables-aging','أعمار الذمم الدائنة','finance','receivables',['payables aging','أعمار الذمم الدائنة'],'supplier-aging',['supplierCode','dueDate','netAmount'],['supplierName','documentDate','currency'],12,['obligations','due-schedule','concentration','supplier-risk','payment-priority'],['مراجعة جدول الالتزامات']),
  p(44,'finance.cashflow-liquidity','التدفق النقدي/السيولة','finance','payments',['cash flow liquidity','التدفق النقدي'],'cash-period',['documentDate','netAmount'],['currency','dueDate','customerCode','supplierCode'],6,['cash-position','inflows-outflows','liquidity-gap','obligations-vs-collections','scenarios-when-valid'],['مراجعة فجوة السيولة وتخصيص النقد']),
  p(45,'finance.profitability','الربحية / قائمة الدخل','finance','profitability',['profitability','قائمة الدخل'],'profit-period',['netAmount','cost'],['documentDate','productCode','customerCode','profit'],12,['revenue','cost','gross-profit','margin','pressure','drivers','leakage','opportunity'],['مراجعة مصادر الهامش والربح']),
  p(46,'finance.general-ledger','الأستاذ العام/القيود اليومية','finance','payments',['general ledger','الأستاذ العام'],'account-period',['accountCode','netAmount','documentDate'],['documentNo','currency'],12,['account-movement','unusual-entries','period-changes','concentration','reconciliation-audit'],['مراجعة القيود غير المعتادة والتسويات']),
  p(47,'finance.balance-sheet','الميزان/المراكز المالية','finance','profitability',['balance sheet','المراكز المالية'],'account-period',['asset','liability','equity'],['documentDate','documentNo','currency'],12,['assets-liabilities-equity-when-present','movement','concentration','reconciliation'],['مراجعة تغير المراكز والاستثناءات']),

  p(48,'demand.forecast','الطلب/التنبؤ','demand','sales',['demand forecast','التنبؤ بالطلب'],'product-period',['productCode','documentDate','salesQty'],['productName','currentStock','customerCode','warehouse','netAmount'],12,['demand-trend','velocity','seasonality','forecast','uncertainty','stock-linkage','reorder-production-implications'],['مراجعة الطلب المتوقع وحدود التنبؤ']),
] as const;

export const REPORT_ARCHETYPE_CATALOG_ID = 'report-intelligence.48';
export const REPORT_ARCHETYPE_CATALOG_VERSION = '1.0.0';
export const REPORT_ARCHETYPE_CATALOG_SIZE = 48;

export const REPORT_ARCHETYPES = REPORT_ARCHETYPES_RAW.map(attachArchetypeRuleFamily) as readonly (ArchetypeProfile & { ruleFamily: ArchetypeRuleFamily })[];

if (REPORT_ARCHETYPES.length !== REPORT_ARCHETYPE_CATALOG_SIZE) throw new Error('REPORT_ARCHETYPE_CATALOG_SIZE_MISMATCH');

const byId = new Map(REPORT_ARCHETYPES.map((profile) => [profile.id, profile]));
const byNumber = new Map(REPORT_ARCHETYPES.map((profile) => [profile.number, profile]));

export function getReportArchetype(id: string): ArchetypeProfile | null {
  return byId.get(id) ?? null;
}

export function getReportArchetypeByNumber(number: number): ArchetypeProfile | null {
  return byNumber.get(number) ?? null;
}

export function listReportArchetypes(): readonly ArchetypeProfile[] {
  return REPORT_ARCHETYPES;
}

function normalize(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().normalize('NFKC').replace(/[\s_\-./]+/g, '');
}

export function resolveReportArchetype(input: {
  archetypeId?: string | null;
  specialty?: string | null;
}): { profile: ArchetypeProfile | null; state: ArchetypeRuntimeState; reason: string } {
  if (input.archetypeId) {
    const exact = getReportArchetype(input.archetypeId);
    if (exact) return { profile: exact, state: 'SUPPORTED', reason: 'EXACT_ARCHETYPE_ID' };
    return { profile: null, state: 'REVIEW_REQUIRED', reason: 'UNKNOWN_ARCHETYPE_ID' };
  }

  const specialty = normalize(input.specialty);
  const candidates = REPORT_ARCHETYPES.filter((profile) =>
    normalize(profile.adapterSpecialty) === specialty ||
    normalize(profile.domain) === specialty,
  );

  if (candidates.length === 1) return { profile: candidates[0], state: 'SUPPORTED', reason: 'UNIQUE_DOMAIN_MATCH' };
  if (candidates.length > 1) return { profile: null, state: 'REVIEW_REQUIRED', reason: 'AMBIGUOUS_ARCHETYPE_MATCH' };
  return { profile: null, state: 'NOT_AVAILABLE', reason: 'NO_ARCHETYPE_MATCH' };
}


export function detectReportArchetype(input: {
  sourcePath?: string | null;
  specialty?: string | null;
  availableFields: CanonicalField[];
}): { profile: ArchetypeProfile | null; state: ArchetypeRuntimeState; reason: string } {
  const specialty = normalize(input.specialty);
  const path = normalize(input.sourcePath);
  const fields = new Set(input.availableFields);
  for (const rawField of input.availableFields) {
    const semantic = matchCanonicalField(rawField);
    if (semantic) fields.add(semantic);
    const normalizedRaw = normalize(rawField);
    if (normalize(input.specialty) === 'inventory') {
      if (normalizedRaw === 'sku') fields.add('productCode');
      if (normalizedRaw === 'balance' || normalizedRaw === 'stock') fields.add('currentStock');
    }
    if (normalize(input.specialty) === 'inventory' && (normalizedRaw === 'netsales' || normalizedRaw.includes('صافيالمبيعات'))) fields.add('salesQty');
  }

  const candidates = REPORT_ARCHETYPES.filter((profile) => {
    if (!specialty) return true;
    return normalize(profile.adapterSpecialty) === specialty || normalize(profile.domain) === specialty;
  });

  if (!candidates.length) return { profile: null, state: 'NOT_AVAILABLE', reason: 'NO_ARCHETYPE_CANDIDATES' };

  const invoiceDetailCandidate = candidates.find((profile) => profile.id === `${specialty}.invoice-detail`);
  const invoiceDetailSignalFields: CanonicalField[] = ['unitPrice', 'grossAmount', 'discount', 'cost'];
  const invoiceDetailSignals = invoiceDetailSignalFields.filter((field) => fields.has(field)).length;
  if (
    invoiceDetailCandidate &&
    fields.has('documentNo') &&
    fields.has('documentDate') &&
    fields.has('netAmount') &&
    invoiceDetailSignals >= 2
  ) {
    return {
      profile: invoiceDetailCandidate,
      state: 'SUPPORTED',
      reason: 'INVOICE_DETAIL_CANONICAL_CLUSTER',
    };
  }

  const scored = candidates.map((profile) => {
    const requiredHits = profile.requiredFields.filter((field) => fields.has(field)).length;
    const optionalHits = profile.optionalFields.filter((field) => fields.has(field)).length;
    const aliasHits = profile.aliases.filter((alias) => {
      const token = normalize(alias);
      return token.length >= 3 && path.includes(token);
    }).length;
    const requiredCoverage = profile.requiredFields.length ? requiredHits / profile.requiredFields.length : 0;
    const fieldLabels = [...fields].map((field) => normalize(field)).filter((field) => field.length >= 3);
    const fieldAliasHits = profile.aliases.filter((alias) => {
      const token = normalize(alias);
      return token.length >= 3 && fieldLabels.some((field) => field.includes(token) || token.includes(field));
    }).length;
    const titleTokens = normalize(profile.title).split(/[^\p{L}\p{N}]+/u).filter((token) => token.length >= 4);
    const titleFieldHits = titleTokens.filter((token) => fieldLabels.some((field) => field.includes(token))).length;
    const invoiceDetailBonus =
      profile.id.endsWith('.invoice-detail') &&
      fields.has('documentNo') &&
      fields.has('documentDate') &&
      fields.has('netAmount') &&
      invoiceDetailSignals >= 2
        ? 24
        : 0;
    const score = aliasHits * 8 + fieldAliasHits * 5 + titleFieldHits * 4 + requiredHits * 3 + optionalHits + requiredCoverage * 2 + invoiceDetailBonus;
    return { profile, score, requiredHits, aliasHits, fieldAliasHits, titleFieldHits };
  }).sort((a, b) => b.score - a.score || b.requiredHits - a.requiredHits || b.aliasHits - a.aliasHits);

  const top = scored[0];
  const second = scored[1];
  if (!top || top.score <= 0) {
    return { profile: null, state: 'REVIEW_REQUIRED', reason: 'ARCHETYPE_FINGERPRINT_INSUFFICIENT' };
  }
  if (second && top.score === second.score) {
    return { profile: null, state: 'REVIEW_REQUIRED', reason: 'ARCHETYPE_FINGERPRINT_AMBIGUOUS' };
  }

  return { profile: top.profile, state: 'SUPPORTED', reason: 'SEMANTIC_FINGERPRINT_MATCH' };
}

export function runReportArchetype(
  input: Omit<AdvisoryPacketInput, 'archetypeId' | 'profileVersion'> & {
    archetypeId: string;
    profileVersion?: number | null;
    report: Parameters<typeof deriveReportIntelligence>[0] & { persistedIntelligenceCalculations?: PersistedIntelligenceCalculation[] };
  },
): {
  profile: ArchetypeProfile;
  state: ArchetypeRuntimeState;
  intelligence: ReturnType<typeof deriveReportIntelligence>;
  advisory: AdvisoryPacket;
} {
  const profile = getReportArchetype(input.archetypeId);
  if (!profile) throw new Error('UNKNOWN_ARCHETYPE_ID');
  const available = new Set(input.availableFields);
  for (const rawField of input.availableFields) {
    const semantic = matchCanonicalField(rawField);
    if (semantic) available.add(semantic);
    const normalizedRaw = normalize(rawField);
    if (profile.adapterSpecialty === 'inventory') {
      if (normalizedRaw === 'sku') available.add('productCode');
      if (normalizedRaw === 'balance' || normalizedRaw === 'stock') available.add('currentStock');
    }
    if (profile.adapterSpecialty === 'inventory' && (normalizedRaw === 'netsales' || normalizedRaw === 'صافياالمبيعات' || normalizedRaw === 'صافيالمبيعات')) available.add('salesQty');
  }
  const missingRequired = profile.requiredFields.filter((field) => !available.has(field));
  const baseIntelligence = deriveReportIntelligence({ ...input.report, specialty: profile.adapterSpecialty });
  const intelligence = applyArchetypeRuleSet(profile, { ...input.report, specialty: profile.adapterSpecialty }, baseIntelligence);
  const modelSignalPresent = intelligence.signals.some((signal) => signal.id === 'model:' + profile.id);
  const modelRecommendationPresent = intelligence.recommendations.some((recommendation) => recommendation.id === 'rec:archetype:' + profile.id);
  const advisory = buildAdvisoryPacket({
    intelligence,
    provenance: input.provenance,
    availableFields: input.availableFields,
    sampleSize: input.sampleSize,
    scope: input.scope,
    archetypeId: profile.id,
    profileVersion: input.profileVersion ?? profile.version,
  });
  if (missingRequired.length > 0) {
    return { profile, state: 'NOT_AVAILABLE', intelligence, advisory };
  }
  if (input.sampleSize < profile.minimumSample) {
    return { profile, state: 'INSUFFICIENT_SAMPLE', intelligence, advisory };
  }
  if (!input.provenance.evidenceSnapshotId && !input.provenance.evidencePassportId) {
    return { profile, state: 'REVIEW_REQUIRED', intelligence, advisory };
  }
  if (!modelSignalPresent || !modelRecommendationPresent) {
    return { profile, state: 'REVIEW_REQUIRED', intelligence, advisory };
  }
  return { profile, state: 'SUPPORTED', intelligence, advisory };
}
