import { analyzeTrend, backtestForecast, forecastSeries, unifiedConfidence } from './advancedIntelligence';
import { cashConversionCycle, decideReplenishment, projectLiquidity, type CashConversionCycle, type InventoryDecision, type LiquidityProjection } from './businessIntelligenceEngines';
import { prioritizeReceivables, prioritizeSupplierPayments, protectCashReserve, type PaymentPriority, type ReceivablePriority, type ReserveProtection } from './financialDecisionEngines';
import { calculateInventoryDecision, type InventoryDecision as StochasticInventoryDecision } from './intelligence/inventoryEngine';
import { aggregateAlternativeGroups, type AlternativeGroupDecision, type AlternativeGroupInput } from './intelligence/groupDemand';
import { evaluateMetric, type MetricEvaluation } from './metricEngine';
export interface IntelligenceInvoice { id: string; total: number; paidAmount: number; date?: string | null; }
export interface IntelligencePurchase { total: number; paidAmount: number; }
export interface IntelligenceInventoryRow { sku: string; stock: number; unitCost: number; dailySales?: number[]; leadTimeDays?: number; }
export interface CanonicalIntelligenceInput { sales: IntelligenceInvoice[]; purchases: IntelligencePurchase[]; inventory: IntelligenceInventoryRow[]; salesHistory: number[]; costOfSales?: number; alternativeGroups?: AlternativeGroupInput[]; receivablePriorities?: Parameters<typeof prioritizeReceivables>[0]; supplierPaymentPriorities?: Parameters<typeof prioritizeSupplierPayments>[0]; openingLiquidity?: number; dailyInflow?: number; dailyOutflow?: number; committedOutflow?: number; periodDays?: number; }
export interface CanonicalIntelligence { metrics: MetricEvaluation[]; trend: ReturnType<typeof analyzeTrend>; forecast: ReturnType<typeof forecastSeries>; backtest: ReturnType<typeof backtestForecast>; cashConversionCycle: CashConversionCycle; liquidity: LiquidityProjection[]; reserveProtection: ReserveProtection; collections: ReceivablePriority[]; supplierPayments: PaymentPriority[]; replenishment: InventoryDecision[]; stochasticInventory: StochasticInventoryDecision[]; alternativeGroups: AlternativeGroupDecision[]; confidence: number; warnings: string[]; }
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
export function buildCanonicalIntelligence(input: CanonicalIntelligenceInput): CanonicalIntelligence {
  const sales = input.sales.filter(row => Number.isFinite(row.total)); const purchases = input.purchases.filter(row => Number.isFinite(row.total)); const inventory = input.inventory.filter(row => Number.isFinite(row.stock) && Number.isFinite(row.unitCost));
  const salesTotal = sales.reduce((sum, row) => sum + Math.max(0, row.total), 0); const purchaseTotal = purchases.reduce((sum, row) => sum + Math.max(0, row.total), 0);
  const receivables = sales.reduce((sum, row) => sum + Math.max(0, row.total - finite(row.paidAmount)), 0); const payables = purchases.reduce((sum, row) => sum + Math.max(0, row.total - finite(row.paidAmount)), 0);
  const inventoryValue = inventory.reduce((sum, row) => sum + Math.max(0, row.stock) * Math.max(0, row.unitCost), 0);
  const trend = analyzeTrend(input.salesHistory.map((value, index) => ({ id: `sales-history-${index}`, date: String(index), value })));
  const forecast = forecastSeries(input.salesHistory, 30, 7); const backtest = backtestForecast(input.salesHistory, 7);
  const ccc = cashConversionCycle({ receivables, revenue: salesTotal, inventory: inventoryValue, costOfSales: Math.max(0, input.costOfSales ?? 0), payables, purchases: purchaseTotal, periodDays: input.periodDays ?? 365 });
  const liquidity = projectLiquidity({ openingLiquidity: Math.max(0, input.openingLiquidity ?? 0), horizons: [0, 7, 15, 30, 60, 90], dailyInflow: Math.max(0, input.dailyInflow ?? 0), dailyOutflow: Math.max(0, input.dailyOutflow ?? 0), committedOutflow: Math.max(0, input.committedOutflow ?? 0) });
  const reserveProtection = protectCashReserve({ openingCash: Math.max(0, input.openingLiquidity ?? 0), committedOutflow: Math.max(0, input.committedOutflow ?? 0), collectibleInflow: Math.max(0, input.dailyInflow ?? 0) * 30 });
  const collections = prioritizeReceivables(input.receivablePriorities ?? sales.map(row => ({ id: row.id, amount: Math.max(0, row.total - finite(row.paidAmount)), overdueDays: 0 })));
  const supplierPayments = prioritizeSupplierPayments(input.supplierPaymentPriorities ?? purchases.map((row, index) => ({ id: `purchase-${index}`, amount: Math.max(0, row.total - finite(row.paidAmount)), overdueDays: 0 })), reserveProtection);
  const replenishment = inventory.map(row => decideReplenishment({ onHand: Math.max(0, row.stock), avgDailyDemand: average((row.dailySales ?? []).filter(Number.isFinite).map(value => Math.max(0, value))), leadTimeDays: Math.max(0, row.leadTimeDays ?? 7), safetyDays: 7, reserved: 0, onOrder: 0 }));
  const stochasticInventory = inventory.map(row => calculateInventoryDecision({ sku: row.sku, stock: Math.max(0, row.stock), dailySales: row.dailySales ?? [], leadTimeDays: Math.max(0, row.leadTimeDays ?? 7), safetyDays: 2, reviewPeriodDays: 7, unitCost: Math.max(0, row.unitCost) }));
  const alternativeGroups = input.alternativeGroups ? aggregateAlternativeGroups(input.alternativeGroups) : [];
  const metrics = [
    evaluateMetric({ key: 'net_sales', value: salesTotal, sourceRows: sales.length, confidence: sales.length ? 0.98 : 0 }),
    evaluateMetric({ key: 'receivables', value: receivables, sourceRows: sales.length, confidence: sales.length ? 0.98 : 0 }),
    evaluateMetric({ key: 'payables', value: payables, sourceRows: purchases.length, confidence: purchases.length ? 0.98 : 0 }),
    evaluateMetric({ key: 'inventory_value', value: inventoryValue, sourceRows: inventory.length, confidence: inventory.length ? 0.98 : 0 }),
    evaluateMetric({ key: 'inventory_velocity', value: average(input.salesHistory), sourceRows: input.salesHistory.length, confidence: input.salesHistory.length >= 3 ? 0.9 : 0 }),
    evaluateMetric({ key: 'stock_coverage', value: inventory.length && input.salesHistory.length ? inventory.reduce((sum, row) => sum + row.stock, 0) / Math.max(average(input.salesHistory), 0.000001) : null, sourceRows: inventory.length && input.salesHistory.length ? inventory.length + input.salesHistory.length : 0, confidence: input.salesHistory.length >= 7 ? forecast.confidence : 0, status: 'FORECAST' }),
  ];
  const dataConfidence = Math.min(1, (sales.length ? 0.25 : 0) + (inventory.length ? 0.25 : 0) + (purchases.length ? 0.2 : 0) + (input.salesHistory.length >= 7 ? 0.3 : 0));
  const forecastConfidence = backtest.ready ? Math.max(0, Math.min(1, forecast.confidence * (1 - Math.min(1, (backtest.mape ?? 100) / 100)))) : 0.35 * forecast.confidence;
  const confidence = unifiedConfidence({ data: dataConfidence, mapping: 1, calculation: 0.95, forecast: forecastConfidence, recommendation: inventory.length ? 0.9 : 0.3 });
  const warnings: string[] = []; if (!sales.length) warnings.push('لا توجد مبيعات صالحة للتحليل.'); if (!inventory.length) warnings.push('لا توجد أرصدة مخزون صالحة للتحليل.'); if (!backtest.ready) warnings.push('التنبؤ لم يجتز حد البيانات الكافي للاختبار الخلفي.'); if (input.costOfSales == null || input.costOfSales <= 0) warnings.push('CCC غير مكتمل: تكلفة المبيعات الفعلية غير متاحة، ولن يتم استبدالها بقيمة المشتريات.'); if (ccc.status === 'INSUFFICIENT_DATA') warnings.push('CCC غير متاح بسبب نقص أساس التكلفة أو المشتريات.');
  return { metrics, trend, forecast, backtest, cashConversionCycle: ccc, liquidity, reserveProtection, collections, supplierPayments, replenishment, stochasticInventory, alternativeGroups, confidence, warnings };
}
