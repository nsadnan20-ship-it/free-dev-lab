import type { CanonicalField } from './canonical-schema.js';
import type { BusinessQuestion } from './business-question-engine.js';

export type BusinessArchetype =
  | 'sales'
  | 'purchases'
  | 'inventory'
  | 'receivables'
  | 'payments'
  | 'profitability'
  | 'generic';

type QuestionDefinition = {
  id: string;
  label: string;
  requiredFields: CanonicalField[];
  minimumSample: number;
  priority: number;
};

const UNIVERSAL: readonly QuestionDefinition[] = [
  { id: 'report.what-happened', label: 'ماذا حدث؟', requiredFields: [], minimumSample: 1, priority: 100 },
  { id: 'report.where', label: 'أين تركز التغير؟', requiredFields: [], minimumSample: 1, priority: 95 },
  { id: 'report.contributors', label: 'من/ما الذي ساهم في التغير؟', requiredFields: [], minimumSample: 1, priority: 90 },
  { id: 'report.detractors', label: 'من/ما الذي سحب النتيجة إلى الأسفل؟', requiredFields: [], minimumSample: 1, priority: 85 },
  { id: 'report.why', label: 'لماذا حدث ذلك؟', requiredFields: [], minimumSample: 1, priority: 80 },
  { id: 'report.so-what', label: 'ما أثر ذلك على القرار؟', requiredFields: [], minimumSample: 1, priority: 75 },
  { id: 'report.what-next', label: 'ما الذي ينبغي فعله الآن؟', requiredFields: [], minimumSample: 1, priority: 70 },
  { id: 'report.proof', label: 'ما الدليل؟', requiredFields: [], minimumSample: 1, priority: 65 },
  { id: 'report.after-action', label: 'ماذا حدث بعد الإجراء؟', requiredFields: [], minimumSample: 1, priority: 60 },
];

const ARCHETYPE: Record<BusinessArchetype, readonly QuestionDefinition[]> = {
  sales: [
    { id: 'sales.trend', label: 'كيف تغيرت المبيعات عبر الزمن؟', requiredFields: ['documentDate', 'netAmount'], minimumSample: 6, priority: 94 },
    { id: 'sales.customer-concentration', label: 'أين يتركز الاعتماد على العملاء؟', requiredFields: ['customerCode', 'netAmount'], minimumSample: 12, priority: 92 },
    { id: 'sales.product-mix', label: 'أي أصناف تقود القيمة أو الانخفاض؟', requiredFields: ['productCode', 'netAmount'], minimumSample: 12, priority: 91 },
    { id: 'sales.profitability', label: 'هل التغير مربح فعلًا؟', requiredFields: ['netAmount', 'cost'], minimumSample: 12, priority: 88 },
    { id: 'sales.returns', label: 'أين تتركز المرتجعات؟', requiredFields: ['productCode', 'quantity'], minimumSample: 12, priority: 82 },
  ],
  purchases: [
    { id: 'purchases.trend', label: 'كيف تغير الإنفاق؟', requiredFields: ['documentDate', 'netAmount'], minimumSample: 6, priority: 94 },
    { id: 'purchases.supplier-concentration', label: 'أين يتركز الاعتماد على الموردين؟', requiredFields: ['supplierCode', 'netAmount'], minimumSample: 12, priority: 92 },
    { id: 'purchases.product-price', label: 'ما الأصناف/الموردون الذين يرفعون التكلفة؟', requiredFields: ['productCode', 'unitPrice'], minimumSample: 12, priority: 90 },
    { id: 'purchases.payment-exposure', label: 'ما الالتزامات التي تتطلب متابعة؟', requiredFields: ['supplierCode', 'dueDate', 'netAmount'], minimumSample: 12, priority: 84 },
  ],
  inventory: [
    { id: 'inventory.position', label: 'ما وضع المخزون الآن؟', requiredFields: ['productCode', 'currentStock'], minimumSample: 1, priority: 96 },
    { id: 'inventory.coverage', label: 'كم تكفي التغطية؟', requiredFields: ['productCode', 'currentStock', 'salesQty'], minimumSample: 12, priority: 94 },
    { id: 'inventory.aging', label: 'أين يوجد المخزون الراكد أو البطيء؟', requiredFields: ['productCode', 'currentStock'], minimumSample: 12, priority: 92 },
    { id: 'inventory.location-imbalance', label: 'أين يوجد اختلال بين المواقع؟', requiredFields: ['productCode', 'warehouse', 'currentStock'], minimumSample: 12, priority: 88 },
    { id: 'inventory.valuation', label: 'ما قيمة المخزون المعرضة للخطر؟', requiredFields: ['productCode', 'currentStock', 'cost'], minimumSample: 12, priority: 86 },
  ],
  receivables: [
    { id: 'receivables.aging', label: 'كم حجم الذمم المتأخرة؟', requiredFields: ['customerCode', 'dueDate', 'netAmount'], minimumSample: 12, priority: 96 },
    { id: 'receivables.concentration', label: 'على من تتركز الذمم؟', requiredFields: ['customerCode', 'netAmount'], minimumSample: 12, priority: 92 },
    { id: 'receivables.recovery', label: 'ما الذي يحتاج تحصيلًا أولًا؟', requiredFields: ['customerCode', 'dueDate', 'netAmount'], minimumSample: 12, priority: 90 },
  ],
  payments: [
    { id: 'payments.flow', label: 'ما اتجاه حركة النقد؟', requiredFields: ['documentDate', 'netAmount'], minimumSample: 6, priority: 96 },
    { id: 'payments.currency', label: 'هل هناك فصل واضح للعملات؟', requiredFields: ['currency', 'netAmount'], minimumSample: 1, priority: 94 },
    { id: 'payments.reconciliation', label: 'هل توجد فروقات تحتاج تسوية؟', requiredFields: ['documentNo', 'netAmount'], minimumSample: 12, priority: 90 },
  ],
  profitability: [
    { id: 'profitability.margin', label: 'ما الهامش الحقيقي؟', requiredFields: ['netAmount', 'cost'], minimumSample: 12, priority: 98 },
    { id: 'profitability.drivers', label: 'ما الذي يقود الربح أو التراجع؟', requiredFields: ['netAmount', 'cost', 'productCode'], minimumSample: 12, priority: 94 },
    { id: 'profitability.customer-mix', label: 'هل يتركز الربح على عملاء محددين؟', requiredFields: ['customerCode', 'netAmount', 'cost'], minimumSample: 12, priority: 90 },
  ],
  generic: [],
};

export function getBusinessQuestionDefinitions(archetype: BusinessArchetype): readonly QuestionDefinition[] {
  return [...UNIVERSAL, ...(ARCHETYPE[archetype] ?? ARCHETYPE.generic)];
}

export function buildBusinessQuestionSet<TAnswer>(
  archetype: BusinessArchetype,
  evaluate: (input: Omit<BusinessQuestion<TAnswer>, 'state' | 'missingFields' | 'evidenceBoundary' | 'followUpQuestion'> & {
    availableFields: CanonicalField[];
    sampleSize: number;
    answer?: TAnswer | null;
    reviewRequired?: boolean;
    blockedReason?: string | null;
  }) => BusinessQuestion<TAnswer>,
  input: {
    availableFields: CanonicalField[];
    sampleSize: number;
    answers?: Record<string, TAnswer | null>;
  },
): BusinessQuestion<TAnswer>[] {
  return getBusinessQuestionDefinitions(archetype).map((definition) => evaluate({
    ...definition,
    availableFields: input.availableFields,
    sampleSize: input.sampleSize,
    answer: input.answers?.[definition.id] ?? null,
  }));
}
