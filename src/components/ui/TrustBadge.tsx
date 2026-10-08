import { ShieldCheck, ShieldAlert, TriangleAlert, Ban, CircleHelp, Calculator, type LucideIcon } from 'lucide-react';
import type { TrustState } from '@/lib/trust-state';

const META: Record<TrustState, { label: string; className: string; icon: LucideIcon; description: string }> = {
  VERIFIED: { label: 'VERIFIED', className: 'ag-trust-verified', icon: ShieldCheck, description: 'بيانات مؤكدة من مصدر متحقق.' },
  TRUSTED: { label: 'TRUSTED', className: 'ag-trust-trusted', icon: Calculator, description: 'قيمة محسوبة من بيانات موثوقة ومنهجية معروفة.' },
  PARTIAL: { label: 'PARTIAL', className: 'ag-trust-partial', icon: CircleHelp, description: 'الصورة جزئية وتحتوي على بيانات غير مكتملة.' },
  REVIEW: { label: 'REVIEW', className: 'ag-trust-review', icon: TriangleAlert, description: 'تحتاج الحالة إلى مراجعة بشرية قبل الإجراء.' },
  BLOCKED: { label: 'BLOCKED', className: 'ag-trust-blocked', icon: Ban, description: 'لا يمكن استخدام النتيجة قبل إزالة سبب الحجب.' },
  INSUFFICIENT_DATA: { label: 'INSUFFICIENT DATA', className: 'ag-trust-insufficient', icon: ShieldAlert, description: 'البيانات الحالية لا تكفي لاستخراج نتيجة مسؤولة.' },
};

export function TrustBadge({ state, evidenceCount, compact = false }: { state: TrustState; evidenceCount?: number; compact?: boolean }) {
  const meta = META[state];
  const Icon = meta.icon;
  return (
    <span className={'ag-trust ' + meta.className} title={meta.description} aria-label={meta.label + ' — ' + meta.description}>
      <Icon size={compact ? 11 : 12} aria-hidden="true" />
      <span>{meta.label}</span>
      {evidenceCount !== undefined && <span className="ag-evidence-count" aria-label={'عدد الأدلة: ' + evidenceCount}>{evidenceCount} دليل</span>}
    </span>
  );
}
