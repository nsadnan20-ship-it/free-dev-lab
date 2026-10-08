import { FormEvent, useState } from 'react';
import { X } from 'lucide-react';
import { resolveCurrentCompanyId, supabase } from '@/lib/supabase';

export interface CustomerCreateDialogProps { onClose: () => void; onCreated: () => void; }

export function CustomerCreateDialog({ onClose, onCreated }: CustomerCreateDialogProps) {
  const [code, setCode] = useState(''); const [name, setName] = useState(''); const [phone, setPhone] = useState('');
  const [segment, setSegment] = useState('regular'); const [creditLimit, setCreditLimit] = useState('0'); const [paymentTermsDays, setPaymentTermsDays] = useState('30');
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const trimmedName = name.trim(); const credit = Number(creditLimit); const terms = Number(paymentTermsDays);
    if (!trimmedName) { setError('اسم العميل مطلوب'); return; }
    if (!Number.isFinite(credit) || credit < 0) { setError('حد الائتمان غير صالح'); return; }
    if (!Number.isInteger(terms) || terms < 0 || terms > 3650) { setError('شروط الدفع غير صالحة'); return; }
    setSaving(true); setError(null);
    try {
      const companyId = await resolveCurrentCompanyId(); if (!companyId) throw new Error('TENANT_REQUIRED');
      const { error: insertError } = await supabase.from('customers').insert({ company_id: companyId, name: trimmedName, code: code.trim() || null, phone: phone.trim() || null, email: null, segment, credit_limit: credit, payment_terms_days: terms });
      if (insertError) throw insertError; onCreated(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر إنشاء العميل'); } finally { setSaving(false); }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="customer-create-title">
    <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4"><h2 id="customer-create-title" className="text-lg font-bold text-ink-900">عميل جديد</h2><button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-lg p-2 text-ink-500 hover:bg-ink-50"><X size={18} /></button></div>
      <form onSubmit={submit} className="space-y-4 p-5">
        <div><label htmlFor="customer-create-name" className="mb-1 block text-xs font-medium text-ink-700">الاسم *</label><input id="customer-create-name" autoFocus value={name} onChange={e => setName(e.target.value)} className="input w-full" required /></div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div><label htmlFor="customer-create-code" className="mb-1 block text-xs font-medium text-ink-700">الكود</label><input id="customer-create-code" value={code} onChange={e => setCode(e.target.value)} className="input w-full" /></div>
          <div><label htmlFor="customer-create-phone" className="mb-1 block text-xs font-medium text-ink-700">الهاتف</label><input id="customer-create-phone" value={phone} onChange={e => setPhone(e.target.value)} className="input w-full" inputMode="tel" /></div>
          <div><label htmlFor="customer-create-segment" className="mb-1 block text-xs font-medium text-ink-700">الشريحة</label><select id="customer-create-segment" value={segment} onChange={e => setSegment(e.target.value)} className="input w-full"><option value="regular">عادي</option><option value="vip">VIP</option><option value="occasional">عرضي</option></select></div>
          <div><label htmlFor="customer-create-credit-limit" className="mb-1 block text-xs font-medium text-ink-700">حد الائتمان</label><input id="customer-create-credit-limit" value={creditLimit} onChange={e => setCreditLimit(e.target.value)} className="input w-full" type="number" min="0" step="0.01" /></div>
          <div><label htmlFor="customer-create-payment-terms" className="mb-1 block text-xs font-medium text-ink-700">شروط الدفع (يوم)</label><input id="customer-create-payment-terms" value={paymentTermsDays} onChange={e => setPaymentTermsDays(e.target.value)} className="input w-full" type="number" min="0" max="3650" step="1" /></div>
        </div>
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onClose} className="rounded-lg border border-ink-200 px-4 py-2 text-sm">إلغاء</button><button type="submit" disabled={saving} className="btn-primary text-sm disabled:opacity-50">{saving ? 'جارٍ الحفظ...' : 'حفظ العميل'}</button></div>
      </form>
    </div>
  </div>;
}