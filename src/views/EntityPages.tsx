import { useEffect, useState, useCallback } from 'react';
import { ArrowUpLeft, Plus, Search, X } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { Link } from '@/lib/router-compat';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, PageHeader, LoadingState, ErrorState, DataUnavailableState } from '@/components/ui/States';
import { DataTable } from '@/components/ui/DataTable';
import { CustomerCreateDialog } from '@/components/CustomerCreateDialog';
import { ProductCreateDialog } from '@/components/ProductCreateDialog';
import { fetchCustomersPage, fetchProductsPage } from '@/lib/queries';
import { fetchInventoryReportSnapshot, type InventoryReportRow } from '@/lib/dashboard-canonical';
import { formatCurrency, formatNumber } from '@/lib/format';
import type { Customer, Product } from '@/lib/types';


function EntityContextDrawer({ title, subtitle, fields, links, onClose }: {
  title: string;
  subtitle: string;
  fields: Array<{ label: string; value: string }>;
  links: Array<{ label: string; path: string; hint: string }>;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-ink-950/35 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="absolute inset-0 cursor-default" aria-label="إغلاق" onClick={onClose} />
      <aside className="ag-entity-drawer relative max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-t-[1.75rem] border border-ink-200 bg-white p-5 shadow-2xl sm:rounded-[1.75rem] sm:p-6" dir="rtl">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-primary-700">سياق الكيان</div>
            <h2 className="mt-1 text-xl font-black text-ink-950">{title}</h2>
            <p className="mt-1 text-xs leading-6 text-ink-500">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-ink-200 p-2 text-ink-400 hover:bg-ink-50 hover:text-ink-700" aria-label="إغلاق"><X size={17}/></button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          {fields.map(field => <div key={field.label} className="rounded-2xl border border-ink-100 bg-ink-50/60 p-4"><div className="text-[10px] font-bold text-ink-400">{field.label}</div><div className="mt-1.5 break-words text-sm font-black text-ink-900">{field.value}</div></div>)}
        </div>
        <div className="mt-6 rounded-2xl border border-primary-100 bg-primary-50/60 p-4">
          <div className="text-xs font-black text-primary-900">المسارات المرتبطة</div>
          <div className="mt-3 space-y-2">
            {links.map(link => <Link key={link.path} to={link.path} onClick={onClose} className="flex items-center gap-3 rounded-xl border border-white bg-white px-3 py-3 transition hover:border-primary-200 hover:bg-primary-50"><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-ink-800">{link.label}</span><span className="mt-0.5 block text-[11px] text-ink-400">{link.hint}</span></span><ArrowUpLeft size={15} className="shrink-0 text-primary-600"/></Link>)}
          </div>
        </div>
        <div className="mt-5 border-t border-ink-100 pt-4 text-[11px] leading-5 text-ink-400">هذا السياق يعرض فقط الحقول الموجودة في السجل الحالي؛ لا يتم اشتقاق نشاط أو رصيد غير متاح من المصدر.</div>
      </aside>
    </div>
  );
}


export function CustomersPage() {
  const PAGE_SIZE = 50;
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchCustomersPage(page, PAGE_SIZE, search);
      setCustomers(result.data);
      setTotal(result.count ?? 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل العملاء');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { void load(); }, [load]);

  const segmentMap: Record<string, { variant: 'success' | 'primary' | 'neutral'; label: string }> = {
    vip: { variant: 'success', label: 'VIP' },
    regular: { variant: 'primary', label: 'عادي' },
    occasional: { variant: 'neutral', label: 'عرضي' },
  };
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <PageHeader title="العملاء" subtitle={`${formatNumber(total)} عميل`} actions={<button type="button" onClick={() => setCreateOpen(true)} className="btn-primary text-xs"><Plus size={14} /> عميل جديد</button>} />
      {createOpen && <CustomerCreateDialog onClose={() => setCreateOpen(false)} onCreated={() => { void load(); }} />}
      <div className="ag-entity-toolbar grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <label className="mb-1.5 block text-[11px] font-bold text-ink-500">ابحث ثم افتح السجل لفهم السياق</label>
          <div className="relative max-w-xl"><Search className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" size={18} /><input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="بحث عن اسم أو كود العميل..." className="input pr-10" /></div>
        </div>
        <div className="ag-entity-note rounded-xl border border-ink-200 bg-white px-3 py-2 text-[11px] text-ink-500">سجل العميل = هوية + شروط التعامل + مسارات التحصيل والقرار</div>
      </div>
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <Card>
        <DataTable columns={[
          { key: 'code', label: 'الكود', render: (r: Customer) => <span className="font-mono text-xs text-ink-500">{r.code || '—'}</span> },
          { key: 'name', label: 'الاسم', render: (r: Customer) => <button type="button" onClick={() => setSelectedCustomer(r)} className="text-right font-black text-primary-800 hover:underline">{r.name}</button> },
          { key: 'phone', label: 'الهاتف', render: (r: Customer) => r.phone || '—' },
          { key: 'segment', label: 'الشريحة', align: 'center', render: (r: Customer) => { const s = segmentMap[r.segment] || { variant: 'neutral' as const, label: r.segment }; return <Badge variant={s.variant}>{s.label}</Badge>; } },
          { key: 'credit_limit', label: 'حد الائتمان', align: 'right', render: (r: Customer) => formatCurrency(r.credit_limit) },
          { key: 'payment_terms_days', label: 'شروط الدفع', align: 'center', render: (r: Customer) => `${r.payment_terms_days} يوم` },
        ]} data={customers} loading={loading} emptyMessage="لا يوجد عملاء" />
      </Card>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-ink-500">عرض {customers.length} من {formatNumber(total)} عميل</span>
        <div className="flex items-center gap-2"><button type="button" disabled={page===0} onClick={()=>setPage(p=>Math.max(0,p-1))} className="px-3 py-1.5 rounded-lg border border-ink-200 text-xs disabled:opacity-40">السابق</button><span className="text-xs text-ink-600">صفحة {page+1} / {totalPages}</span><button type="button" disabled={page+1>=totalPages} onClick={()=>setPage(p=>p+1)} className="px-3 py-1.5 rounded-lg border border-ink-200 text-xs disabled:opacity-40">التالي</button></div>
      </div>
      {selectedCustomer && <EntityContextDrawer
        title={selectedCustomer.name}
        subtitle="ملخص سياقي مبني على السجل الحالي، مع طرق الوصول إلى مساحات التحصيل والتحليل المتاحة."
        fields={[
          { label: 'الكود', value: selectedCustomer.code || '—' },
          { label: 'الهاتف', value: selectedCustomer.phone || '—' },
          { label: 'الشريحة', value: segmentMap[selectedCustomer.segment]?.label || selectedCustomer.segment || '—' },
          { label: 'حد الائتمان', value: formatCurrency(selectedCustomer.credit_limit) },
          { label: 'شروط الدفع', value: `${selectedCustomer.payment_terms_days} يوم` },
        ]}
        links={[
          { label: 'الذمم والتحصيل', path: '/reports/receivables', hint: 'راجع مساحة التحصيل الحالية' },
          { label: 'RFM', path: '/analytics/rfm', hint: 'استكشف تقسيم العملاء عندما تتوفر البيانات' },
          { label: 'التقرير التنفيذي', path: '/reports/executive', hint: 'ضع العميل داخل الصورة التنفيذية العامة' },
        ]}
        onClose={() => setSelectedCustomer(null)}
      />}
    </div>
  );
}


export function ProductsPage() {
  const PAGE_SIZE = 50;
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchProductsPage(page, PAGE_SIZE, search);
      setProducts(result.data);
      setTotal(result.count ?? 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل المنتجات');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { void load(); }, [load]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="ag-entity-page-surface space-y-6 animate-fade-in" dir="rtl">
      <PageHeader title="المنتجات" subtitle={`${formatNumber(total)} منتج`} actions={<button type="button" onClick={() => setCreateOpen(true)} className="btn-primary text-xs"><Plus size={14} /> منتج جديد</button>} />
      {createOpen && <ProductCreateDialog onClose={() => setCreateOpen(false)} onCreated={() => { void load(); }} />}
      <div className="ag-entity-toolbar grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <label className="mb-1.5 block text-[11px] font-bold text-ink-500">ابحث ثم افتح السجل لفهم ما يهم هذا الصنف</label>
          <div className="relative max-w-xl"><Search className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" size={18} /><input aria-label="بحث عن منتج" type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="بحث عن اسم أو SKU..." className="input pr-10" /></div>
        </div>
        <div className="ag-entity-note rounded-xl border border-ink-200 bg-white px-3 py-2 text-[11px] text-ink-500">سجل المنتج = السعر + التكلفة + الهامش + نقطة الطلب + مسارات المخزون والربحية</div>
      </div>
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <Card>
        <DataTable columns={[
          { key: 'sku', label: 'SKU', render: (r: Product) => <span className="font-mono text-xs text-ink-500">{r.sku}</span> },
          { key: 'name', label: 'الاسم', render: (r: Product) => <button type="button" onClick={() => setSelectedProduct(r)} className="text-right font-black text-primary-800 hover:underline">{r.name}</button> },
          { key: 'unit', label: 'الوحدة', align: 'center' },
          { key: 'cost_price', label: 'التكلفة', align: 'right', render: (r: Product) => formatCurrency(r.cost_price) },
          { key: 'selling_price', label: 'السعر', align: 'right', render: (r: Product) => formatCurrency(r.selling_price) },
          { key: 'margin', label: 'الهامش', align: 'right', render: (r: Product) => { const m = r.selling_price > 0 ? ((r.selling_price - r.cost_price) / r.selling_price) * 100 : null; return m === null ? <Badge variant="neutral">غير متاح</Badge> : <span className={m >= 20 ? 'text-success-600 font-medium' : m >= 10 ? 'text-warning-600' : 'text-danger-600'}>{m.toFixed(1)}%</span>; } },
          { key: 'reorder_point', label: 'نقطة الطلب', align: 'center', render: (r: Product) => formatNumber(r.reorder_point) },
        ]} data={products} loading={loading} emptyMessage="لا توجد منتجات" />
      </Card>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-ink-500">عرض {products.length} من {formatNumber(total)} منتج</span>
        <div className="flex items-center gap-2"><button type="button" disabled={page===0} onClick={()=>setPage(p=>Math.max(0,p-1))} className="px-3 py-1.5 rounded-lg border border-ink-200 text-xs disabled:opacity-40">السابق</button><span className="text-xs text-ink-600">صفحة {page+1} / {totalPages}</span><button type="button" disabled={page+1>=totalPages} onClick={()=>setPage(p=>p+1)} className="px-3 py-1.5 rounded-lg border border-ink-200 text-xs disabled:opacity-40">التالي</button></div>
      </div>
      {selectedProduct && <EntityContextDrawer
        title={selectedProduct.name}
        subtitle="ملخص سياقي مبني على السجل الحالي، مع طرق الوصول إلى المخزون والربحية والتحليل."
        fields={[
          { label: 'SKU', value: selectedProduct.sku || '—' },
          { label: 'الوحدة', value: selectedProduct.unit || '—' },
          { label: 'التكلفة', value: formatCurrency(selectedProduct.cost_price) },
          { label: 'سعر البيع', value: formatCurrency(selectedProduct.selling_price) },
          { label: 'الهامش', value: selectedProduct.selling_price > 0 ? `${(((selectedProduct.selling_price - selectedProduct.cost_price) / selectedProduct.selling_price) * 100).toFixed(1)}%` : 'غير متاح' },
          { label: 'نقطة الطلب', value: formatNumber(selectedProduct.reorder_point) },
        ]}
        links={[
          { label: 'المخزون', path: '/inventory', hint: 'افحص الرصيد والحالة التشغيلية' },
          { label: 'الربحية', path: '/reports/profitability', hint: 'راجع قراءة الهامش على مستوى التقرير' },
          { label: 'ذكاء المخزون', path: '/reports/inventory-intelligence', hint: 'استكشف الطلب والتغطية عندما تتوفر' },
        ]}
        onClose={() => setSelectedProduct(null)}
      />}
    </div>
  );
}

export function InventoryPage() {
  const [snapshot, setSnapshot] = useState<Awaited<ReturnType<typeof fetchInventoryReportSnapshot>> | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all'); const [page, setPage] = useState(0); const pageSize = 25;
  const load = useCallback(async () => { try { setLoading(true); setError(null); setSnapshot(await fetchInventoryReportSnapshot(page, pageSize, filter)); } catch (e: unknown) { setError(e instanceof Error ? e.message : 'فشل تحميل المخزون'); } finally { setLoading(false); } }, [page, filter]);
  useEffect(() => { void load(); }, [load]); useEffect(() => { setPage(0); }, [filter]); if (loading && !snapshot) return <LoadingState />; if (error && !snapshot) return <ErrorState message={error} onRetry={load} />; if (!snapshot) return <DataUnavailableState title="صورة المخزون غير متاحة" message="لم تصل صورة موثوقة للمخزون من المصدر الحالي؛ لا يتم عرض شاشة فارغة أو افتراض أرصدة." action={<Link to="/import" className="btn-primary text-[11px]">إضافة مصدر</Link>} />;
  const filteredRows = snapshot.filteredRows; const totalPages = filteredRows == null ? null : Math.max(1, Math.ceil(filteredRows / pageSize));
  const inventoryQueueEmpty = snapshot.totalRows === 0;
  const inventoryFilterEmpty = filter !== 'all' && snapshot.filteredRows === 0;
  return <div className="ag-entity-page-surface space-y-6 animate-fade-in"><PageHeader title="المخزون" subtitle="حالة المخزون من مصدر المخزون المعتمد، مع فصل إجماليات الأعمال عن صفحات العرض." />
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4"><Card><CardBody><div className="text-xs text-ink-500 mb-1">قيمة المخزون</div><div className="text-xl font-bold text-ink-900">{snapshot.totalValue == null ? 'غير متاح' : formatCurrency(snapshot.totalValue)}</div>{snapshot.dataStatus==='INSUFFICIENT_DATA'&&<div className="text-xs text-warning-600 mt-1">بيانات التكلفة غير مكتملة</div>}</CardBody></Card><Card><CardBody><div className="text-xs text-ink-500 mb-1">إجمالي الأصناف</div><div className="text-xl font-bold text-ink-900">{formatNumber(snapshot.totalRows)}</div></CardBody></Card><Card><CardBody><div className="text-xs text-ink-500 mb-1">مخزون منخفض</div><div className="text-xl font-bold text-warning-600">{formatNumber(snapshot.lowStock)}</div></CardBody></Card><Card><CardBody><div className="text-xs text-ink-500 mb-1">نفد المخزون</div><div className="text-xl font-bold text-danger-600">{formatNumber(snapshot.outOfStock)}</div></CardBody></Card></div>
    <div className="flex flex-wrap gap-2">{[{ v: 'all' as const, l: 'الكل' },{ v: 'low' as const, l: 'منخفض' },{ v: 'out' as const, l: 'نفد' }].map(f => <button key={f.v} onClick={() => setFilter(f.v)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filter === f.v ? 'bg-primary-600 text-white' : 'bg-white text-ink-600 border border-ink-200'}`}>{f.l}</button>)}</div>{error&&<div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <Card>
      {inventoryQueueEmpty || inventoryFilterEmpty ? (
        <CardBody>
          <EmptyState
            title={inventoryQueueEmpty ? 'لا توجد بيانات مخزون مثبتة' : 'لا توجد نتائج لهذا الفلتر'}
            message={inventoryQueueEmpty ? 'ابدأ بالمصدر الموحد لبناء قاعدة مخزون قابلة للتحقق.' : 'الفلتر الحالي لا يطابق أي صف؛ اعرض كل المخزون للعودة إلى الصورة الكاملة.'}
            action={inventoryQueueEmpty
              ? <Link to="/import" className="btn-primary text-[11px]">إضافة مصدر</Link>
              : <button type="button" onClick={() => setFilter('all')} className="btn-secondary text-[11px]">عرض كل المخزون</button>}
          />
        </CardBody>
      ) : (
        <DataTable columns={[{ key: 'product', label: 'المنتج', render: (r: InventoryReportRow) => r.product?.name || '—' },{ key: 'sku', label: 'SKU', render: (r: InventoryReportRow) => <span className="font-mono text-xs text-ink-500">{r.product?.sku || '—'}</span> },{ key: 'warehouse', label: 'المستودع', render: (r: InventoryReportRow) => r.warehouse?.name || '—' },{ key: 'quantity', label: 'الكمية', align: 'right', render: (r: InventoryReportRow) => r.quantity == null ? 'غير متاح' : formatNumber(r.quantity) },{ key: 'unit_cost', label: 'التكلفة', align: 'right', render: (r: InventoryReportRow) => r.unit_cost == null ? 'غير متاح' : formatCurrency(r.unit_cost) },{ key: 'value', label: 'القيمة', align: 'right', render: (r: InventoryReportRow) => r.value == null ? 'غير متاح' : formatCurrency(r.value) },{ key: 'status', label: 'الحالة', align: 'center', render: (r: InventoryReportRow) => { if (r.quantity == null) return <Badge variant="neutral">غير معروف</Badge>; if (r.quantity <= 0) return <Badge variant="danger">نفد</Badge>; if (r.product?.reorder_point != null && r.quantity <= r.product.reorder_point) return <Badge variant="warning">منخفض</Badge>; return <Badge variant="success">متاح</Badge>; }}]} data={snapshot.rows} emptyMessage="لا توجد بيانات مخزون" />
      )}
    </Card>
    <div className="flex items-center justify-between gap-3"><span className="text-xs text-ink-500">عرض {snapshot.rows.length} من {filteredRows == null ? 'غير متاح' : formatNumber(filteredRows)} نتيجة مطابقة للفلتر</span><div className="flex items-center gap-2"><button disabled={page===0} onClick={()=>setPage(p=>Math.max(0,p-1))} className="px-3 py-1.5 rounded-lg border border-ink-200 text-xs disabled:opacity-40">السابق</button><span className="text-xs text-ink-600">صفحة {page+1} / {totalPages == null ? 'غير متاح' : totalPages}</span><button disabled={totalPages == null || page+1>=totalPages} onClick={()=>setPage(p=>p+1)} className="px-3 py-1.5 rounded-lg border border-ink-200 text-xs disabled:opacity-40">التالي</button></div></div>
  </div>;
}
