import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '@/lib/router-compat';
import { CircleCheck, Mail, MapPin, Phone, Search, ShieldCheck, Truck } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PageHeader, LoadingState, ErrorState, EmptyState } from '@/components/ui/States';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { fetchSuppliersPage, type SupplierRow } from '@/lib/queries-compat';

const PAGE_SIZE = 50;

export function SuppliersPage() {
  const [rows, setRows] = useState<SupplierRow[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchSuppliersPage(page, PAGE_SIZE, appliedSearch);
      setRows(result.data);
      setCount(result.count);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل الموردين');
    } finally {
      setLoading(false);
    }
  }, [page, appliedSearch]);

  useEffect(() => { void load(); }, [load]);

  const completeness = useMemo(() => {
    const total = rows.length;
    if (!total) return { contact: 0, payment: 0, address: 0 };
    return {
      contact: rows.filter(row => Boolean(row.phone || row.email)).length,
      payment: rows.filter(row => row.payment_terms_days != null).length,
      address: rows.filter(row => Boolean(row.address)).length,
    };
  }, [rows]);

  const columns: Column<SupplierRow>[] = [
    {
      key: 'name',
      label: 'المورد',
      render: row => (
        <div className="min-w-0">
          <div className="truncate text-[12px] font-black text-ink-900">{row.name || 'غير مسمى'}</div>
          <div className="mt-0.5 text-[10px] text-ink-400">{row.code || 'بدون رمز مرجعي'}</div>
        </div>
      ),
    },
    {
      key: 'contact',
      label: 'التواصل',
      render: row => (
        <div className="space-y-1 text-[10px] text-ink-500">
          {row.phone ? <div className="flex items-center gap-1.5"><Phone size={12} />{row.phone}</div> : null}
          {row.email ? <div className="flex items-center gap-1.5"><Mail size={12} />{row.email}</div> : null}
          {!row.phone && !row.email ? 'غير متاح' : null}
        </div>
      ),
    },
    {
      key: 'terms',
      label: 'شروط السداد',
      align: 'center',
      render: row => row.payment_terms_days == null
        ? <Badge variant="neutral">غير متاح</Badge>
        : <Badge variant="primary">{row.payment_terms_days} يوم</Badge>,
    },
    {
      key: 'address',
      label: 'العنوان',
      render: row => row.address
        ? <div className="flex max-w-[260px] items-start gap-1.5 text-[10px] leading-5 text-ink-500"><MapPin size={12} className="mt-0.5 shrink-0" />{row.address}</div>
        : <span className="text-[10px] text-ink-400">غير متاح</span>,
    },
  ];

  if (loading) return <LoadingState message="جارٍ قراءة الموردين من السجل المرجعي..." />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div dir="rtl" className="ag-suppliers-surface space-y-6 pb-10 animate-fade-in">
      <PageHeader
        title="الموردون"
        subtitle="واجهة مرجعية خفيفة تربط المورد بالسياق الشرائي دون تحويل المنصة إلى نظام إدارة موردين مستقل."
        actions={<span className="rounded-full bg-primary-50 px-2.5 py-1 text-[9px] font-black text-primary-800">{count == null ? 'غير متاح' : String(count) + ' سجل'}</span>}
      />

      <section className="ag-operational-hero overflow-hidden rounded-[1.75rem] border border-primary-100 p-6 lg:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.25fr_.75fr] lg:items-end">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black tracking-[.14em] text-primary-700"><Truck size={14} /> MASTER DATA / SUPPLIERS</div>
            <h2 className="mt-2 text-2xl font-black text-ink-950 lg:text-3xl">المورد في مكانه الصحيح: مرجع يخدم القرار الشرائي.</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-ink-500">الواجهة تعرض الهوية والاتصال وشروط السداد من السجل الحقيقي. التحليل المالي والتقييم التشغيلي يبقيان داخل تقارير المشتريات والتحليل التجاري.</p>
          </div>
          <div className="rounded-2xl border border-primary-100 bg-white/80 p-4">
            <div className="text-[10px] font-black text-ink-400">قاعدة الثقة</div>
            <div className="mt-1 text-sm font-black text-ink-900">بيانات مرجعية فقط</div>
            <div className="mt-1 text-[11px] leading-5 text-ink-500">لا يتم استنتاج حجم شراء أو رصيد مستحق غير موجود في المصدر.</div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'بيانات التواصل', value: completeness.contact, icon: Mail },
          { label: 'شروط السداد', value: completeness.payment, icon: ShieldCheck },
          { label: 'العنوان', value: completeness.address, icon: MapPin },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label} variant="quality">
            <CardBody>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[10px] font-black text-ink-500"><Icon size={15} className="text-primary-700" />{label}</div>
                <CircleCheck size={16} className="text-primary-700" />
              </div>
              <div className="mt-2 text-xl font-black tabular-nums text-ink-950">{value}<span className="mr-1 text-[10px] font-bold text-ink-400">/{rows.length}</span></div>
              <div className="mt-1 text-[9px] leading-5 text-ink-400">موجود في الصفحة الحالية من السجل المرجعي.</div>
            </CardBody>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader
          title="دليل الموردين"
          subtitle="بحث مباشر ضمن الموردين المرتبطين بمساحة الشركة الحالية."
          action={
            <form
              className="flex w-full max-w-md items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                setPage(0);
                setAppliedSearch(search.trim());
              }}
            >
              <div className="relative flex-1">
                <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-300" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} className="input pr-9 text-[11px]" placeholder="ابحث بالاسم أو الرمز" aria-label="البحث عن مورد" />
              </div>
              <button type="submit" className="btn-primary shrink-0 text-[11px]">بحث</button>
            </form>
          }
        />
        <CardBody className="p-0">
          {rows.length
            ? <DataTable columns={columns} data={rows} />
            : <EmptyState title="لا يوجد موردون مطابقون" message={appliedSearch ? 'جرّب كلمة بحث أخرى.' : 'لا توجد سجلات موردين مثبتة في المسار الحالي.'} />}
        </CardBody>
      </Card>

      <div className="flex flex-col gap-3 rounded-2xl border border-ink-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-700"><ShieldCheck size={15} /></div>
          <div>
            <div className="text-[11px] font-black text-ink-900">السياق الشرائي</div>
            <p className="mt-1 text-[10px] leading-5 text-ink-400">لرؤية الفواتير والإنفاق وشروط السداد، انتقل إلى مسار المشتريات الكانوني بدل تكرار بياناتها هنا.</p>
          </div>
        </div>
        <Link to="/reports/purchases" className="btn-secondary text-[11px]">فتح المشتريات</Link>
      </div>
    </div>
  );
}
