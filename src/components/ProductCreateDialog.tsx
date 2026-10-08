import { type FormEvent, useState } from 'react';
import { X } from 'lucide-react';
import { resolveCurrentCompanyId, supabase } from '@/lib/supabase';

const PRODUCT_SAVE_TIMEOUT_MS = 25000;

async function runBounded<T>(operation: (signal: AbortSignal) => PromiseLike<T> | T, timeoutMessage: string): Promise<T> {
  const controller = new AbortController();
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      controller.abort();
      reject(new Error(timeoutMessage));
    }, PRODUCT_SAVE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([Promise.resolve(operation(controller.signal)), timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

function productSaveErrorMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (message === 'PRODUCT_SAVE_TIMEOUT') return 'انتهت مهلة حفظ المنتج. لم نترك العملية معلّقة؛ تحقّق من الاتصال ثم حاول مرة أخرى.';
  if (message === 'PRODUCT_READBACK_TIMEOUT') return 'تم تجاوز مهلة التحقق من الحفظ. لم نعتبر المنتج مكتملًا دون قراءة راجعة مؤكدة.';
  if (message === 'PRODUCT_PERSISTENCE_READBACK_FAILED') return 'تم إرسال الحفظ لكن لم نتمكن من إثبات وجود المنتج في البيانات؛ أعد المحاولة.';
  if (message === 'PRODUCT_TENANT_READBACK_MISMATCH') return 'توقف التحقق لأن البيانات المقروءة لا تطابق شركة الجلسة الحالية.';
  if (message === 'TENANT_REQUIRED') return 'لا توجد شركة نشطة للجلسة الحالية؛ اختر الشركة ثم أعد المحاولة.';
  return message || 'تعذر إنشاء المنتج؛ أعد المحاولة.';
}

export interface ProductCreateDialogProps {
  onClose: () => void;
  onCreated: () => void;
}

export function ProductCreateDialog({ onClose, onCreated }: ProductCreateDialogProps) {
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('قطعة');
  const [costPrice, setCostPrice] = useState('0');
  const [sellingPrice, setSellingPrice] = useState('0');
  const [minStock, setMinStock] = useState('0');
  const [reorderPoint, setReorderPoint] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedSku = sku.trim();
    const normalizedName = name.trim();
    const normalizedUnit = unit.trim();
    const cost = Number(costPrice);
    const selling = Number(sellingPrice);
    const minimum = Number(minStock);
    const reorder = Number(reorderPoint);

    if (!normalizedSku) return setError('رمز SKU مطلوب');
    if (!normalizedName) return setError('اسم المنتج مطلوب');
    if (!normalizedUnit) return setError('الوحدة مطلوبة');
    if (![cost, selling, minimum, reorder].every(Number.isFinite) || cost < 0 || selling < 0 || minimum < 0 || reorder < 0) {
      return setError('قِيَم التكلفة والسعر والمخزون يجب أن تكون أرقامًا غير سالبة');
    }

    setSaving(true);
    setSuccess(null);
    setError(null);
    try {
      const authoritativeCompanyId = await resolveCurrentCompanyId();
      if (!authoritativeCompanyId) throw new Error('TENANT_REQUIRED');
      const rpcResult = await runBounded(
        (signal) => supabase.rpc('import_upsert_product', {
          p_company_id: authoritativeCompanyId,
          p_sku: normalizedSku,
          p_name: normalizedName,
          p_unit: normalizedUnit,
          p_cost_price: cost,
          p_selling_price: selling,
          p_min_stock: minimum,
          p_reorder_point: reorder,
          p_is_active: isActive,
          p_null_policy: 'preserve',
        }).abortSignal(signal),
        'PRODUCT_SAVE_TIMEOUT',
      ) as { error: { message?: string } | null };
      if (rpcResult.error) throw rpcResult.error;

      const readbackResult = await runBounded(
        (signal) => supabase
          .from('products')
          .select('id,sku,name,company_id')
          .eq('company_id', authoritativeCompanyId)
          .eq('sku', normalizedSku)
          .abortSignal(signal)
          .maybeSingle(),
        'PRODUCT_READBACK_TIMEOUT',
      ) as { data: { id: string; sku: string; name: string; company_id: string } | null; error: { message?: string } | null };
      if (readbackResult.error) throw readbackResult.error;
      const readback = readbackResult.data;
      if (!readback?.id) throw new Error('PRODUCT_PERSISTENCE_READBACK_FAILED');
      if (String(readback.company_id) !== String(authoritativeCompanyId)) throw new Error('PRODUCT_TENANT_READBACK_MISMATCH');

      setSuccess(`تم حفظ المنتج والتحقق منه: ${String(readback.name ?? normalizedName)} (${String(readback.sku ?? normalizedSku)})`);
      onCreated();
    } catch (cause) {
      setError(productSaveErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="product-create-title">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl" dir="rtl">
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <h2 id="product-create-title" className="text-lg font-bold text-ink-900">منتج جديد</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-lg p-2 text-ink-500 hover:bg-ink-50"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><label htmlFor="product-create-sku" className="mb-1 block text-xs font-medium text-ink-700">SKU *</label><input id="product-create-sku" value={sku} onChange={event => setSku(event.target.value)} className="input w-full" required /></div>
            <div><label htmlFor="product-create-name" className="mb-1 block text-xs font-medium text-ink-700">اسم المنتج *</label><input id="product-create-name" autoFocus value={name} onChange={event => setName(event.target.value)} className="input w-full" required /></div>
            <div><label htmlFor="product-create-unit" className="mb-1 block text-xs font-medium text-ink-700">الوحدة *</label><input id="product-create-unit" value={unit} onChange={event => setUnit(event.target.value)} className="input w-full" required /></div>
            <div><label htmlFor="product-create-cost" className="mb-1 block text-xs font-medium text-ink-700">سعر التكلفة *</label><input id="product-create-cost" value={costPrice} onChange={event => setCostPrice(event.target.value)} className="input w-full" type="number" min="0" step="0.01" required /></div>
            <div><label htmlFor="product-create-selling" className="mb-1 block text-xs font-medium text-ink-700">سعر البيع *</label><input id="product-create-selling" value={sellingPrice} onChange={event => setSellingPrice(event.target.value)} className="input w-full" type="number" min="0" step="0.01" required /></div>
            <div><label htmlFor="product-create-min-stock" className="mb-1 block text-xs font-medium text-ink-700">الحد الأدنى للمخزون *</label><input id="product-create-min-stock" value={minStock} onChange={event => setMinStock(event.target.value)} className="input w-full" type="number" min="0" step="0.01" required /></div>
            <div><label htmlFor="product-create-reorder" className="mb-1 block text-xs font-medium text-ink-700">نقطة إعادة الطلب *</label><input id="product-create-reorder" value={reorderPoint} onChange={event => setReorderPoint(event.target.value)} className="input w-full" type="number" min="0" step="0.01" required /></div>
            <label htmlFor="product-create-active" className="flex items-center gap-2 self-end rounded-lg border border-ink-100 px-3 py-2 text-sm text-ink-700"><input id="product-create-active" type="checkbox" checked={isActive} onChange={event => setIsActive(event.target.checked)} />المنتج نشط</label>
          </div>
          {success && <div data-testid="product-create-success" role="status" aria-live="polite" className="rounded-lg border border-success-200 bg-success-50 p-3 text-sm text-success-700"><div className="font-bold">تم الحفظ والتحقق</div><div className="mt-1 text-xs">{success}</div></div>}
          {error && <div data-testid="product-create-error" role="alert" aria-live="assertive" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><div className="font-bold">تعذر الحفظ</div><div className="mt-1 text-xs break-words">{error}</div></div>}
          <div className="flex flex-wrap justify-end gap-2 pt-2"><button type="button" onClick={onClose} className="rounded-lg border border-ink-200 px-4 py-2 text-sm">{success ? 'إغلاق' : 'إلغاء'}</button><button type="submit" disabled={saving || Boolean(success)} className="btn-primary text-sm disabled:opacity-50">{saving ? 'جارٍ الحفظ والتحقق...' : success ? 'تم التحقق' : 'حفظ المنتج'}</button></div>
        </form>
      </div>
    </div>
  );
}
