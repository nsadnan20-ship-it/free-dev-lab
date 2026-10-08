import { classifyABCXYZ, classifyFSN, detectAnomalies, opportunityScan, type ABCXYZItem, type FsnItem, type Anomaly, type Opportunity } from '../advancedIntelligence';
import { decideReplenishment, scoreCustomer, scoreSupplier, type CustomerScore, type SupplierScore, type InventoryDecision } from '../businessIntelligenceEngines';

export interface OperationalProductInput {
  id: string;
  value: number;
  unitsSold: number;
  days: number;
  history: number[];
  stock: number;
  avgDailyDemand: number;
  leadTimeDays: number;
  reserved?: number;
  onOrder?: number;
}

export interface OperationalCustomerInput { id: string; recencyDays: number; orders: number; revenue: number; }
export interface OperationalSupplierInput { id: string; avgDeliveryDelayDays: number; priceVariationPct: number; dependencyPct: number; }

export interface OperationalIntelligence {
  abcxyz: ABCXYZItem[];
  fsn: FsnItem[];
  replenishment: Array<{ id: string; decision: InventoryDecision }>;
  customers: Array<{ id: string; score: CustomerScore }>;
  suppliers: Array<{ id: string; score: SupplierScore }>;
  anomalies: Anomaly[];
  opportunities: Opportunity[];
  warnings: string[];
}

export function buildOperationalIntelligence(input: {
  products: OperationalProductInput[];
  customers?: OperationalCustomerInput[];
  suppliers?: OperationalSupplierInput[];
  observations?: Array<{ id: string; value: number; date?: string }>;
}): OperationalIntelligence {
  const products = input.products.filter(p => Number.isFinite(p.value) && Number.isFinite(p.unitsSold));
  const abcxyz = classifyABCXYZ(products.map(p => ({ id: p.id, value: p.value, history: p.history.filter(Number.isFinite) })));
  const fsn = classifyFSN(products.map(p => ({ id: p.id, unitsSold: Math.max(0, p.unitsSold), days: Math.max(1, p.days) })));
  const replenishment = products.map(p => ({ id: p.id, decision: decideReplenishment({ onHand: Math.max(0, p.stock), reserved: Math.max(0, p.reserved ?? 0), onOrder: Math.max(0, p.onOrder ?? 0), avgDailyDemand: Math.max(0, p.avgDailyDemand), leadTimeDays: Math.max(0, p.leadTimeDays) }) }));
  const customers = (input.customers ?? []).map(c => ({ id: c.id, score: scoreCustomer(c) }));
  const suppliers = (input.suppliers ?? []).map(s => ({ id: s.id, score: scoreSupplier(s) }));
  const anomalies = detectAnomalies(input.observations ?? []);
  const opportunities = opportunityScan({
    crossSell: [],
    margin: [],
    deadStock: products.filter(p => p.unitsSold <= 0).map(p => ({ id: p.id, value: Math.max(0, p.value), daysIdle: Math.max(0, p.days) })),
    idleCash: products.map(p => ({ id: p.id, value: Math.max(0, p.value), velocity: p.days > 0 ? p.unitsSold / p.days : 0 })),
  });
  const warnings: string[] = [];
  if (products.length < 3) warnings.push('بيانات المنتجات محدودة؛ تصنيفات المخزون أقل موثوقية.');
  if (customers.length === 0) warnings.push('لا توجد بيانات عملاء كافية لتفعيل RFM/churn.');
  if (suppliers.length === 0) warnings.push('لا توجد بيانات موردين كافية لتقييم المخاطر.');
  return { abcxyz, fsn, replenishment, customers, suppliers, anomalies, opportunities, warnings };
}
