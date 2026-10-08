export type CashAction = 'COLLECT_NOW' | 'COLLECT_SOON' | 'MONITOR' | 'HOLD_PAYMENT' | 'PAY_NOW' | 'PAY_SOON';

export interface ReceivablePriorityInput { id: string; amount: number; overdueDays: number; customerScore?: number; lastPaymentDays?: number; }
export interface ReceivablePriority { id: string; amount: number; priority: CashAction; urgency: number; reason: string; }
export interface PaymentPriorityInput { id: string; amount: number; overdueDays: number; dependencyRisk?: number; deliveryRisk?: number; }
export interface PaymentPriority { id: string; amount: number; priority: CashAction; urgency: number; reason: string; }
export interface ReserveProtection { openingCash: number; minimumReserve: number; committedOutflow: number; collectibleInflow: number; protectedReserve: number; availableForPayments: number; blockedAmount: number; }

const clamp = (n: number, min = 0, max = 100) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : 0));

export function prioritizeReceivables(items: ReceivablePriorityInput[]): ReceivablePriority[] {
  return items.map(item => {
    const overdue = clamp(item.overdueDays * 2);
    const customerRisk = clamp(100 - (item.customerScore ?? 50));
    const paymentStaleness = clamp((item.lastPaymentDays ?? 0) * 0.8);
    const urgency = Math.round(overdue * 0.5 + customerRisk * 0.3 + paymentStaleness * 0.2);
    const priority: CashAction = urgency >= 75 ? 'COLLECT_NOW' : urgency >= 50 ? 'COLLECT_SOON' : 'MONITOR';
    return { id: item.id, amount: Math.max(0, item.amount), priority, urgency, reason: urgency >= 75 ? 'تأخر مرتفع أو خطر تحصيل مرتفع.' : urgency >= 50 ? 'يحتاج متابعة تحصيل قريبة.' : 'لا توجد إشارة تحصيل حرجة.' };
  }).sort((a, b) => b.urgency - a.urgency || b.amount - a.amount);
}

export function prioritizeSupplierPayments(items: PaymentPriorityInput[], reserve: ReserveProtection): PaymentPriority[] {
  const available = Math.max(0, reserve.availableForPayments);
  return items.map(item => {
    const dependency = clamp(item.dependencyRisk ?? 0);
    const delivery = clamp(item.deliveryRisk ?? 0);
    const overdue = clamp(item.overdueDays * 2);
    const liquidityPenalty = item.amount > available ? 25 : 0;
    const urgency = Math.round(overdue * 0.45 + dependency * 0.25 + delivery * 0.2 + liquidityPenalty * 0.1);
    const priority: CashAction = reserve.blockedAmount > 0 || item.amount > available ? 'HOLD_PAYMENT' : urgency >= 75 ? 'PAY_NOW' : urgency >= 50 ? 'PAY_SOON' : 'MONITOR';
    return { id: item.id, amount: Math.max(0, item.amount), priority, urgency, reason: priority === 'HOLD_PAYMENT' ? 'الدفع سيضغط على الاحتياطي النقدي المحمي.' : urgency >= 75 ? 'أولوية دفع مرتفعة بسبب التأخر أو مخاطر التوريد.' : urgency >= 50 ? 'دفع قريب مطلوب لتقليل خطر التشغيل.' : 'يمكن جدولة الدفع دون ضغط فوري.' };
  }).sort((a, b) => b.urgency - a.urgency || b.amount - a.amount);
}

export function protectCashReserve(input: { openingCash: number; minimumReservePct?: number; committedOutflow: number; collectibleInflow: number }): ReserveProtection {
  const openingCash = Math.max(0, input.openingCash);
  const minimumReserve = openingCash * clamp(input.minimumReservePct ?? 20, 0, 100) / 100;
  const protectedReserve = Math.max(minimumReserve, Math.max(0, input.committedOutflow));
  const availableForPayments = Math.max(0, openingCash + Math.max(0, input.collectibleInflow) - protectedReserve);
  const blockedAmount = Math.max(0, protectedReserve - openingCash - Math.max(0, input.collectibleInflow));
  return { openingCash, minimumReserve, committedOutflow: Math.max(0, input.committedOutflow), collectibleInflow: Math.max(0, input.collectibleInflow), protectedReserve, availableForPayments, blockedAmount };
}
