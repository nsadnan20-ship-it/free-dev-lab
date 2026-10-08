import { X, RotateCcw, SlidersHorizontal } from 'lucide-react';

export interface DashboardFilterContext {
  periodMonths: number;
  customerId?: string;
  categoryId?: string;
  productId?: string;
}

interface FilterContextBarProps {
  context: DashboardFilterContext;
  onChange: (next: DashboardFilterContext) => void;
  onReset: () => void;
  className?: string;
}

function FilterChip({ label, value, onRemove }: { label: string; value: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-100 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">
      <span className="text-primary-500">{label}:</span>
      <span>{value}</span>
      <button type="button" onClick={onRemove} className="rounded-full p-0.5 hover:bg-primary-100" aria-label={`إزالة فلتر ${label}`}>
        <X size={12} />
      </button>
    </span>
  );
}

export function FilterContextBar({ context, onChange, onReset, className = '' }: FilterContextBarProps) {
  const hasOptionalFilters = Boolean(context.customerId || context.categoryId || context.productId);

  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-xl border border-ink-100 bg-white p-2.5 ${className}`} dir="rtl">
      <span className="inline-flex items-center gap-1.5 px-1.5 text-xs font-semibold text-ink-600">
        <SlidersHorizontal size={15} className="text-ink-400" />
        سياق التحليل
      </span>
      <FilterChip label="الفترة" value={`${context.periodMonths} أشهر`} onRemove={() => onChange({ ...context, periodMonths: 6 })} />
      {context.customerId && <FilterChip label="العميل" value={context.customerId} onRemove={() => onChange({ ...context, customerId: undefined })} />}
      {context.categoryId && <FilterChip label="الفئة" value={context.categoryId} onRemove={() => onChange({ ...context, categoryId: undefined })} />}
      {context.productId && <FilterChip label="المنتج" value={context.productId} onRemove={() => onChange({ ...context, productId: undefined })} />}
      {hasOptionalFilters && (
        <button type="button" onClick={onReset} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-500 hover:bg-ink-50 hover:text-ink-700">
          <RotateCcw size={13} /> مسح الكل
        </button>
      )}
    </div>
  );
}
