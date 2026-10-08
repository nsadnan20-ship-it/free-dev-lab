import { type ReactNode } from 'react';

type BadgeVariant = 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | 'accent' | 'info' | 'disabled';

const variants: Record<BadgeVariant, string> = {
  primary: 'bg-primary-50 text-primary-700',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
  neutral: 'bg-ink-100 text-ink-600',
  accent: 'bg-accent-50 text-accent-700',
  info: 'bg-info-50 text-info-700 ring-1 ring-inset ring-info-100',
  disabled: 'bg-ink-100 text-ink-400 ring-1 ring-inset ring-ink-200',
};

export function Badge({ children, variant = 'neutral', className = '' }: { children: ReactNode; variant?: BadgeVariant; className?: string }) {
  return <span className={`badge ${variants[variant]} ${className}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: BadgeVariant; label: string }> = {
    paid: { variant: 'success', label: 'مدفوعة' },
    confirmed: { variant: 'primary', label: 'مؤكدة' },
    draft: { variant: 'neutral', label: 'مسودة' },
    posted: { variant: 'accent', label: 'مرحّلة' },
    new: { variant: 'primary', label: 'جديدة' },
    accepted: { variant: 'success', label: 'مقبولة' },
    in_progress: { variant: 'warning', label: 'قيد التنفيذ' },
    done: { variant: 'success', label: 'تم التنفيذ' },
    rejected: { variant: 'danger', label: 'مرفوضة' },
    deferred: { variant: 'neutral', label: 'مؤجلة' },
    pending: { variant: 'warning', label: 'قيد المعالجة' },
    completed: { variant: 'success', label: 'مكتمل' },
    failed: { variant: 'danger', label: 'فشل' },
    partial: { variant: 'warning', label: 'جزئي' },
    unavailable: { variant: 'disabled', label: 'غير متاح' },
    readonly: { variant: 'disabled', label: 'قراءة فقط' },
    queued: { variant: 'info', label: 'بالانتظار' },
  };
  const config = map[status] || { variant: 'neutral' as BadgeVariant, label: status };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, { variant: BadgeVariant; label: string }> = {
    critical: { variant: 'danger', label: 'حرج' },
    warning: { variant: 'warning', label: 'تحذير' },
    info: { variant: 'primary', label: 'معلومة' },
    opportunity: { variant: 'success', label: 'فرصة' },
  };
  const config = map[severity] || { variant: 'neutral' as BadgeVariant, label: severity };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, { variant: BadgeVariant; label: string }> = {
    high: { variant: 'danger', label: 'عالية' },
    medium: { variant: 'warning', label: 'متوسطة' },
    low: { variant: 'neutral', label: 'منخفضة' },
  };
  const config = map[priority] || { variant: 'neutral' as BadgeVariant, label: priority };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function ConfidenceBadge({ confidence }: { confidence: string }) {
  const map: Record<string, { variant: BadgeVariant; label: string }> = {
    CONFIRMED: { variant: 'success', label: 'مؤكد' },
    CALCULATED: { variant: 'primary', label: 'محسوب' },
    ESTIMATED: { variant: 'warning', label: 'تقديري' },
    FORECAST: { variant: 'accent', label: 'تنبؤ' },
    INSUFFICIENT_DATA: { variant: 'neutral', label: 'بيانات غير كافية' },
    UNAVAILABLE: { variant: 'neutral', label: 'غير متاح' },
  };
  const config = map[confidence] || { variant: 'neutral' as BadgeVariant, label: confidence };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
