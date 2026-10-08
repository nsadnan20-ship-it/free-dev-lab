import { type ReactNode } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatCurrency, formatNumber, formatPercent, formatCompact } from '@/lib/format';
import type { DataStatus } from '@/lib/types';
import { TrustBadge } from './TrustBadge';
import { trustStateFromDataStatus } from '@/lib/trust-state';

interface KPICardProps {
  label: string;
  value: number | null;
  format: 'currency' | 'number' | 'percent' | 'compact';
  change?: number;
  changeLabel?: string;
  icon?: ReactNode;
  status?: DataStatus;
  hint?: string;
  evidenceCount?: number;
}

export function KPICard({
  label,
  value,
  format,
  change,
  changeLabel,
  icon,
  status = 'CALCULATED',
  hint,
  evidenceCount,
}: KPICardProps) {
  const formatted = value === null
    ? '—'
    : format === 'currency'
      ? formatCurrency(value)
      : format === 'percent'
        ? formatPercent(value)
        : format === 'compact'
          ? formatCompact(value)
          : formatNumber(value);
  const positive = change !== undefined && change > 0;
  const negative = change !== undefined && change < 0;
  const trustState = trustStateFromDataStatus(status);

  return (
    <div className="ag-kpi-card ag-card ag-card-kpi group relative overflow-hidden p-4">
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] border border-ink-200 bg-white text-ink-500 transition group-hover:border-primary-200 group-hover:bg-primary-50 group-hover:text-primary-700" aria-hidden="true">
            {icon}
          </span>
          <span className="truncate text-[11px] font-bold text-ink-600">{label}</span>
        </div>
        <TrustBadge state={trustState} evidenceCount={evidenceCount} compact />
      </div>
      <div className="relative mt-4 ag-kpi-number" aria-label={label + ': ' + formatted}>{formatted}</div>
      <div className="relative mt-2 flex min-h-4 flex-wrap items-center gap-2">
        {change !== undefined && (
          <span className={'flex items-center gap-1 text-xs font-bold ' + (positive ? 'text-success-600' : negative ? 'text-danger-600' : 'text-ink-500')}>
            {positive ? <TrendingUp size={13}/> : negative ? <TrendingDown size={13}/> : <Minus size={13}/>}
            {formatPercent(change)}
          </span>
        )}
        {changeLabel && <span className="text-[10px] text-ink-500">{changeLabel}</span>}
      </div>
      {hint && <p className="relative mt-2 text-[10px] leading-4 text-ink-500">{hint}</p>}
    </div>
  );
}
