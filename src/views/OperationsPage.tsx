import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '@/lib/router-compat';
import { ChevronLeft, CreditCard, PackageCheck, ReceiptText, RefreshCw, Tags, Truck, Warehouse, type LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/ui/States';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatNumber } from '@/lib/format';
import {
  createInvoiceFromOperationalOrder,
  fetchOperationalAuditTrace,
  fetchOperationalOrderStatusHistory,
  fetchOperationalInvoices,
  fetchOperationalOrders,
  fetchOperationalPriceTruth,
  fetchOperationalSuppliers,
  fetchOperationalWarehouses,
  recordOperationalSalesPayment,
  transitionOperationalOrder,
  type OperationalAuditEntry,
  type OperationalOrderStatusHistoryEntry,
  type OperationalInvoice,
  type OperationalOrder,
  type OperationalPriceTier,
  type OperationalSupplier,
  type OperationalWarehouse,
} from '@/lib/transactional-spine';

function nextStatusFor(order: OperationalOrder): string | null {
  if (order.status === 'pending') return 'confirmed';
  if (order.status === 'confirmed') return 'preparing';
  if (order.status === 'preparing') return 'ready';
  if (order.status === 'ready') return 'completed';
  return null;
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: 'مسودة',
    pending: 'بانتظار التأكيد',
    confirmed: 'مؤكد',
    preparing: 'قيد التجهيز',
    ready: 'جاهز',
    completed: 'مكتمل',
    cancelled: 'ملغى',
    partially_paid: 'مدفوع جزئيًا',
    paid: 'مدفوع',
  };
  return labels[status] ?? status;
}

function money(value: number | null, currency = 'YER'): string {
  if (value == null || !Number.isFinite(value)) return 'غير متاح';
  try {
    return formatCurrency(value, currency);
  } catch {
    return new Intl.NumberFormat('ar-YE', { maximumFractionDigits: 2 }).format(value) + ' ' + currency;
  }
}

function ErrorNote({ message }: { message: string }) {
  return <div role="alert" className="rounded-xl border border-danger-200 bg-danger-50 px-3 py-2 text-[11px] font-semibold text-danger-800">{message}</div>;
}

function operationalErrorMessage(cause: unknown, fallback: string): string {
  const candidate = cause && typeof cause === 'object' ? cause as Record<string, unknown> : null;
  const code = typeof candidate?.code === 'string' ? candidate.code : '';
  const status = Number(candidate?.status ?? 0);
  if (code === 'PERMISSION_DENIED') {
    return 'لا تملك صلاحية تنفيذ هذا الإجراء ضمن مساحة العمل الحالية.';
  }
  if (code === '42501' || code === 'PGRST301' || status === 401 || status === 403) {
    return 'لا تملك صلاحية تنفيذ هذا الإجراء ضمن مساحة العمل الحالية.';
  }
  if (cause instanceof Error && cause.message.trim()) {
    const raw = cause.message;
    if (/INVALID_|TENANT_|PGRST|permission|forbidden|unauthorized/i.test(raw)) return fallback;
    return raw;
  }
  return fallback;
}

export function OperationsPage() {
  const [orders, setOrders] = useState<OperationalOrder[]>([]);
  const [invoices, setInvoices] = useState<OperationalInvoice[]>([]);
  const [prices, setPrices] = useState<OperationalPriceTier[]>([]);
  const [suppliers, setSuppliers] = useState<OperationalSupplier[]>([]);
  const [warehouses, setWarehouses] = useState<OperationalWarehouse[]>([]);
  const [auditTrace, setAuditTrace] = useState<OperationalAuditEntry[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [orderHistory, setOrderHistory] = useState<OperationalOrderStatusHistoryEntry[]>([]);
  const [orderHistoryLoading, setOrderHistoryLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    const results = await Promise.allSettled([
      fetchOperationalOrders(),
      fetchOperationalInvoices(),
      fetchOperationalPriceTruth(),
      fetchOperationalSuppliers(),
      fetchOperationalWarehouses(),
      fetchOperationalAuditTrace(),
    ]);
    const nextErrors: Record<string, string | null> = {};
    if (results[0].status === 'fulfilled') setOrders(results[0].value); else nextErrors.orders = operationalErrorMessage(results[0].reason, 'تعذر قراءة الطلبات');
    if (results[1].status === 'fulfilled') setInvoices(results[1].value); else nextErrors.invoices = operationalErrorMessage(results[1].reason, 'تعذر قراءة الفواتير');
    if (results[2].status === 'fulfilled') setPrices(results[2].value); else nextErrors.prices = operationalErrorMessage(results[2].reason, 'تعذر قراءة التسعير');
    if (results[3].status === 'fulfilled') setSuppliers(results[3].value); else nextErrors.suppliers = operationalErrorMessage(results[3].reason, 'تعذر قراءة الموردين');
    if (results[4].status === 'fulfilled') setWarehouses(results[4].value); else nextErrors.warehouses = operationalErrorMessage(results[4].reason, 'تعذر قراءة المستودعات');
    if (results[5].status === 'fulfilled') setAuditTrace(results[5].value); else nextErrors.audit = operationalErrorMessage(results[5].reason, 'تعذر قراءة سجل التدقيق');
    setErrors(nextErrors);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!selectedOrderId) {
      setOrderHistory([]);
      return;
    }
    let cancelled = false;
    setOrderHistoryLoading(true);
    void fetchOperationalOrderStatusHistory(selectedOrderId)
      .then((rows) => {
        if (!cancelled) {
          setOrderHistory(rows);
          setErrors((current) => ({ ...current, orderHistory: null }));
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setOrderHistory([]);
          setErrors((current) => ({ ...current, orderHistory: operationalErrorMessage(cause, 'تعذر قراءة مسار الطلب') }));
        }
      })
      .finally(() => {
        if (!cancelled) setOrderHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedOrderId]);

  const selectedInvoice = useMemo(() => invoices.find(item => item.id === selectedInvoiceId) ?? null, [invoices, selectedInvoiceId]);

  const refreshOrderHistory = async (orderId: string) => {
    try {
      const rows = await fetchOperationalOrderStatusHistory(orderId);
      setOrderHistory(rows);
      setErrors((current) => ({ ...current, orderHistory: null }));
    } catch (cause) {
      setOrderHistory([]);
      setErrors((current) => ({ ...current, orderHistory: operationalErrorMessage(cause, 'تعذر قراءة مسار الطلب') }));
    }
  };

  const runOrderTransition = async (order: OperationalOrder) => {
    const next = nextStatusFor(order);
    if (!next) return;
    setBusy('order:' + order.id);
    setFeedback(null);
    try {
      await transitionOperationalOrder(order.id, next);
      setFeedback('تم حفظ انتقال الطلب وإعادة قراءة الحالة من المصدر.');
      await load();
      setSelectedOrderId(order.id);
      await refreshOrderHistory(order.id);
    } catch (cause) {
      setFeedback(operationalErrorMessage(cause, 'تعذر تنفيذ انتقال الطلب'));
    } finally {
      setBusy(null);
    }
  };

  const createInvoice = async (order: OperationalOrder) => {
    setBusy('invoice:' + order.id);
    setFeedback(null);
    try {
      const createdInvoice = await createInvoiceFromOperationalOrder(order.id);
      setSelectedInvoiceId(createdInvoice.id);
      setFeedback('تم تثبيت/قراءة الفاتورة المرتبطة بالطلب من المصدر.');
      await load();
    } catch (cause) {
      setFeedback(operationalErrorMessage(cause, 'تعذر تثبيت الفاتورة'));
    } finally {
      setBusy(null);
    }
  };

  const submitPayment = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedInvoice) return;
    const amount = Number(paymentAmount);
    setBusy('payment');
    setFeedback(null);
    try {
      await recordOperationalSalesPayment({
        invoiceId: selectedInvoice.id,
        amount,
        method: paymentMethod,
        reference: paymentReference,
        paymentDate,
      });
      setPaymentAmount('');
      setPaymentReference('');
      setFeedback('تم تسجيل الدفعة وإعادة قراءة الفاتورة والرصيد من المصدر.');
      await load();
    } catch (cause) {
      setFeedback(operationalErrorMessage(cause, 'تعذر تسجيل الدفعة'));
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <div dir="rtl"><PageHeader title="مركز العمليات" subtitle="تشغيل المعاملات الفعلية المرتبطة بالحقيقة الكانونية." /><div className="py-20 text-center text-sm text-ink-500">جارٍ قراءة الطلبات والفواتير والتسعير والموردين والمستودعات...</div></div>;
  }

  return (
    <div dir="rtl" className="ag-operations-surface space-y-5 animate-fade-in pb-10">
      <PageHeader
        title="مركز العمليات"
        subtitle="طلب → تنفيذ/مستودع → فاتورة → تحصيل، مع قراءة التسعير والموردين من المصدر."
        actions={<button type="button" onClick={() => void load()} disabled={busy !== null} className="btn-secondary inline-flex items-center gap-2 text-xs"><RefreshCw size={14}/> تحديث</button>}
      />
      {feedback && <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-xs font-bold text-primary-900" role="status">{feedback}</div>}

      <section className="grid gap-3 md:grid-cols-5">
        {([
          { label: 'الطلبات', value: orders.length, Icon: PackageCheck },
          { label: 'الفواتير', value: invoices.length, Icon: ReceiptText },
          { label: 'التسعير', value: prices.length, Icon: Tags },
          { label: 'الموردون', value: suppliers.length, Icon: Truck },
          { label: 'المستودعات', value: warehouses.length, Icon: Warehouse },
        ] satisfies Array<{ label: string; value: number; Icon: LucideIcon }>).map(({ label, value, Icon }) => (
          <article key={label} className="rounded-2xl border border-ink-200 bg-white p-4 shadow-card">
            <div className="flex items-center gap-2 text-[10px] font-black text-ink-500"><Icon size={14}/>{label}</div>
            <div className="mt-2 text-2xl font-black text-ink-950">{formatNumber(value)}</div>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <article className="rounded-2xl border border-ink-200 bg-white shadow-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-ink-100 p-4">
            <div><div className="section-kicker">ORDER → FULFILLMENT</div><h2 className="mt-1 text-lg font-black text-ink-950">سير الطلبات</h2></div>
            <Badge variant="neutral">{orders.length} سجل</Badge>
          </div>
          {errors.orders && <div className="p-4"><ErrorNote message={errors.orders}/></div>}
          {!errors.orders && !orders.length && <div className="p-6 text-center text-xs text-ink-500">لا توجد طلبات تشغيلية متاحة في tenant الحالي.</div>}
          {!errors.orders && orders.length > 0 && <div className="divide-y divide-ink-100">
            {orders.map(order => {
              const next = nextStatusFor(order);
              return <div key={order.id} className="p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-black">#{order.order_number}</span><Badge variant={order.status === 'completed' ? 'success' : order.status === 'cancelled' ? 'danger' : 'warning'}>{statusLabel(order.status)}</Badge></div>
                    <div className="mt-1 text-sm font-black text-ink-900">{order.customer?.name ?? 'عميل غير متاح'} · {order.warehouse?.name ?? 'مستودع غير متاح'}</div>
                    <div className="mt-1 text-[10px] text-ink-500">{money(order.total, order.currency)} · {new Date(order.created_at).toLocaleString('ar-YE')}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setSelectedOrderId(order.id)} className={selectedOrderId === order.id ? 'btn-ghost text-[10px] ring-1 ring-primary-300' : 'btn-ghost text-[10px]'} aria-pressed={selectedOrderId === order.id}>
                      {selectedOrderId === order.id ? 'المسار مفتوح' : 'عرض المسار'}
                    </button>
                    {next && <button type="button" onClick={() => void runOrderTransition(order)} disabled={busy !== null} className="btn-primary text-[11px]" data-testid={'advance-order-' + order.id}>{busy === 'order:' + order.id ? 'جارٍ الحفظ...' : 'تقدم إلى ' + statusLabel(next)} <ChevronLeft size={13}/></button>}
                    {order.status === 'completed' && <button type="button" onClick={() => void createInvoice(order)} disabled={busy !== null} className="btn-secondary text-[11px]" data-testid={'create-invoice-' + order.id}>{busy === 'invoice:' + order.id ? 'جارٍ التثبيت...' : 'تثبيت/قراءة الفاتورة'} <ReceiptText size={13}/></button>}
                  </div>
                </div>
              </div>;
            })}
          </div>}
          {selectedOrderId && (
            <div className="border-t border-primary-100 bg-primary-50/40 p-4" data-testid="order-status-history">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="section-kicker">ORDER HISTORY / READBACK</div>
                  <h3 className="mt-1 text-sm font-black text-primary-950">مسار الطلب المحفوظ</h3>
                  <p className="mt-1 text-[10px] leading-5 text-ink-600">الحالة هنا تُقرأ من السجل التشغيلي المحفوظ، وليست حالة مؤقتة على الشاشة.</p>
                </div>
                <Badge variant="neutral">{orderHistory.length} انتقال</Badge>
              </div>
              {orderHistoryLoading && <div className="mt-3 text-[10px] text-primary-800">جارٍ قراءة المسار...</div>}
              {!orderHistoryLoading && errors.orderHistory && <div className="mt-3"><ErrorNote message={errors.orderHistory}/></div>}
              {!orderHistoryLoading && !errors.orderHistory && !orderHistory.length && <div className="mt-3 rounded-xl border border-dashed border-primary-200 bg-white/70 p-4 text-center text-[10px] text-ink-500">لا يوجد سجل انتقال محفوظ لهذا الطلب.</div>}
              {!orderHistoryLoading && !errors.orderHistory && orderHistory.length > 0 && (
                <div className="mt-4 space-y-2">
                  {orderHistory.map((entry, index) => (
                    <div key={entry.id} className="flex gap-3 rounded-xl border border-primary-100 bg-white/80 p-3">
                      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[9px] font-black text-primary-800">{index + 1}</div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-[10px] font-black text-ink-900">
                          <span>{statusLabel(entry.from_status)}</span>
                          <span className="text-primary-600">→</span>
                          <span>{statusLabel(entry.to_status)}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[8px] text-ink-400">
                          <span>{new Date(entry.created_at).toLocaleString('ar-YE')}</span>
                          {entry.actor_id && <span className="font-mono">actor:{entry.actor_id.slice(0, 8)}…</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </article>

        <article className="rounded-2xl border border-ink-200 bg-white shadow-card p-4">
          <div className="section-kicker">INVOICE → PAYMENT</div>
          <h2 className="mt-1 text-lg font-black text-ink-950">الفواتير والتحصيل</h2>
          <p className="mt-1 text-[11px] text-ink-500">الدفعة تمر عبر RPC المحمي، ثم تعاد قراءة حالة الفاتورة والرصيد.</p>
          {errors.invoices && <div className="mt-4"><ErrorNote message={errors.invoices}/></div>}
          {!errors.invoices && <div className="mt-4 space-y-2">
            {invoices.slice(0, 8).map(invoice => {
              const balance = Math.max(0, invoice.total - invoice.paid_amount);
              return <button key={invoice.id} type="button" onClick={() => setSelectedInvoiceId(invoice.id)} className={'w-full rounded-xl border p-3 text-right ' + (selectedInvoiceId === invoice.id ? 'border-primary-300 bg-primary-50' : 'border-ink-100 bg-ink-50/40 hover:border-primary-200')} data-testid={'invoice-' + invoice.id}>
                <div className="flex items-center justify-between gap-2"><span className="text-xs font-black">{invoice.invoice_number}</span><Badge variant={balance <= 0 ? 'success' : 'warning'}>{statusLabel(invoice.status)}</Badge></div>
                <div className="mt-1 text-[10px] text-ink-500">{invoice.customer?.name ?? 'عميل غير متاح'} · متبقّي {money(balance, invoice.currency)}</div>
              </button>;
            })}
            {!invoices.length && <div className="rounded-xl border border-dashed border-ink-200 p-4 text-center text-xs text-ink-500">لا توجد فواتير متاحة.</div>}
          </div>}
          {selectedInvoice && <form onSubmit={submitPayment} data-testid={'payment-form-' + selectedInvoice.id} className="mt-4 space-y-3 rounded-xl border border-primary-100 bg-primary-50/50 p-4">
            <div className="text-xs font-black text-primary-900">تسجيل دفعة · {selectedInvoice.invoice_number}</div>
            <label className="block text-[10px] font-bold text-ink-600">المبلغ<input value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} type="number" min="0.01" step="0.01" required data-testid="payment-amount" className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm"/></label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-[10px] font-bold text-ink-600">الطريقة<select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm"><option value="cash">نقد</option><option value="bank">تحويل بنكي</option><option value="card">بطاقة</option></select></label>
              <label className="block text-[10px] font-bold text-ink-600">التاريخ<input value={paymentDate} onChange={e => setPaymentDate(e.target.value)} type="date" required className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm"/></label>
            </div>
            <label className="block text-[10px] font-bold text-ink-600">المرجع<input value={paymentReference} onChange={e => setPaymentReference(e.target.value)} placeholder="مرجع اختياري" className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm"/></label>
            <button type="submit" disabled={busy !== null} className="btn-primary w-full justify-center text-xs">{busy === 'payment' ? 'جارٍ التسجيل...' : 'تسجيل الدفعة وإعادة القراءة'} <CreditCard size={14}/></button>
          </form>}
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <article className="rounded-2xl border border-ink-200 bg-white p-4 shadow-card" data-testid="operations-audit-trace">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="section-kicker">AUDIT / TRACE</div>
              <h2 className="mt-1 text-lg font-black text-ink-950">الأثر التشغيلي</h2>
              <p className="mt-1 text-[11px] leading-5 text-ink-500">قراءة مباشرة لسجل التدقيق المرتبط بهذا المسار من tenant الحالي.</p>
            </div>
            <Badge variant="neutral">{auditTrace.length} سجل</Badge>
          </div>
          {errors.audit && <div className="mt-4"><ErrorNote message={errors.audit} /></div>}
          {!errors.audit && !auditTrace.length && <div className="mt-4 rounded-xl border border-dashed border-ink-200 p-5 text-center text-xs text-ink-500">لا يوجد أثر تشغيلي بعد. نفّذ إجراءً فعليًا لترى trace محفوظًا.</div>}
          {!errors.audit && auditTrace.length > 0 && (
            <div className="mt-4 divide-y divide-ink-100">
              {auditTrace.slice(0, 8).map((entry) => (
                <div key={entry.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={entry.action.endsWith(':insert') ? 'success' : entry.action.endsWith(':update') ? 'warning' : 'danger'}>{entry.action.endsWith(':insert') ? 'إنشاء' : entry.action.endsWith(':update') ? 'تحديث' : 'إجراء'}</Badge>
                    {entry.entityType && <span className="text-[10px] font-black text-ink-700">{entry.entityType.includes('order') ? 'طلب' : entry.entityType.includes('invoice') ? 'فاتورة' : entry.entityType.includes('payment') ? 'تحصيل' : 'عملية'}</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-ink-400">
                    <span>{new Date(entry.createdAt).toLocaleString('ar-YE')}</span>
                    {entry.userLabel && <span>{entry.userLabel}</span>}
                    {entry.correlationId && <span className="font-mono">corr:{entry.correlationId.slice(0, 8)}…</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="rounded-2xl border border-primary-200 bg-primary-50/50 p-4">
          <div className="section-kicker">READBACK CONTRACT</div>
          <h2 className="mt-1 text-lg font-black text-primary-950">من الفعل إلى الإثبات</h2>
          <div className="mt-4 space-y-2 text-[11px]">
            {[
              ['REAL DATA', 'قراءة البيانات من tenant الحالي'],
              ['REAL ACTION', 'التغيير يمر عبر RPC محمي'],
              ['READBACK', 'إعادة القراءة بعد الحفظ'],
              ['AUDIT / TRACE', 'السجل محفوظ خارج الواجهة'],
            ].map(([label, detail]) => (
              <div key={label} className="rounded-xl border border-primary-100 bg-white/80 p-3">
                <div className="text-[9px] font-black text-primary-800">{label}</div>
                <div className="mt-1 font-semibold text-ink-700">{detail}</div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="rounded-2xl border border-ink-200 bg-white p-4 shadow-card">
          <div className="flex items-center justify-between gap-2"><div className="section-kicker">PRICING TRUTH</div><Badge variant="neutral">READ-ONLY</Badge></div><h2 className="mt-1 text-lg font-black">التسعير المرتبط بالعميل</h2>
          {errors.prices ? <div className="mt-3"><ErrorNote message={errors.prices}/></div> : <div className="mt-3 space-y-2">{prices.slice(0,8).map(price => <div key={price.id} className="rounded-xl bg-ink-50 p-3 text-[10px]"><div className="font-black">{price.product?.name ?? 'صنف غير متاح'} · {price.customer?.name ?? 'عميل غير متاح'}</div><div className="mt-1 text-ink-500">من {formatNumber(price.min_quantity)} وحدة · {money(price.unit_price, price.currency)}</div></div>)}{!prices.length&&<div className="text-xs text-ink-500">لا توجد شرائح سعر متاحة.</div>}</div>}
        </article>

        <article className="rounded-2xl border border-ink-200 bg-white p-4 shadow-card">
          <div className="flex items-center justify-between gap-2"><div className="section-kicker">SUPPLIER OPERATIONS</div><Badge variant="neutral">NOT IMPLEMENTED</Badge></div><h2 className="mt-1 text-lg font-black">سياق الموردين</h2>
          {errors.suppliers ? <div className="mt-3"><ErrorNote message={errors.suppliers}/></div> : <div className="mt-3 space-y-2"><div className="rounded-xl border border-warning-100 bg-warning-50 px-3 py-2 text-[10px] font-semibold text-warning-900">لا توجد mutation contract معتمدة للموردين في القلب الحالي؛ الشاشة قراءة فقط وليست زر CRUD مخفي.</div>{suppliers.slice(0,8).map(supplier => <div key={supplier.id} className="flex items-center justify-between gap-3 rounded-xl bg-ink-50 p-3"><div><div className="text-xs font-black">{supplier.name}</div><div className="mt-1 text-[10px] text-ink-500">{supplier.code ?? 'بدون كود'}</div></div><span className="text-[10px] font-bold text-ink-500">{supplier.payment_terms_days == null ? 'شروط الدفع غير متاحة' : formatNumber(supplier.payment_terms_days) + ' يوم'}</span></div>)}{!suppliers.length&&<div className="text-xs text-ink-500">لا يوجد موردون في tenant الحالي.</div>}</div>}
        </article>

        <article className="rounded-2xl border border-ink-200 bg-white p-4 shadow-card">
          <div className="flex items-center justify-between gap-2"><div className="section-kicker">FULFILLMENT / WAREHOUSE</div><Badge variant="neutral">READ-ONLY</Badge></div><h2 className="mt-1 text-lg font-black">المستودعات</h2>
          {errors.warehouses ? <div className="mt-3"><ErrorNote message={errors.warehouses}/></div> : <div className="mt-3 space-y-2">{warehouses.map(warehouse => <div key={warehouse.id} className="flex items-center justify-between gap-3 rounded-xl bg-ink-50 p-3"><div><div className="text-xs font-black">{warehouse.name}</div><div className="mt-1 text-[10px] text-ink-500">{warehouse.code ?? 'بدون كود'}</div></div><Badge variant={warehouse.is_active ? 'success' : 'neutral'}>{warehouse.is_active ? 'نشط' : 'متوقف'}</Badge></div>)}{!warehouses.length&&<div className="text-xs text-ink-500">لا توجد مستودعات متاحة.</div>}</div>}
        </article>
      </section>
    </div>
  );
}
