import { type ReactNode } from 'react';

export type CardVariant =
  | 'standard'
  | 'kpi'
  | 'insight'
  | 'decision'
  | 'evidence'
  | 'action'
  | 'activity'
  | 'benchmark'
  | 'quality'
  | 'alert';

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
  variant?: CardVariant;
}

export function Card({ children, className = '', hover = false, onClick, variant = 'standard' }: CardProps) {
  const interactive = Boolean(onClick || hover);
  return (
    <section
      onClick={onClick}
      className={'card ag-card ag-card-' + variant + (interactive ? ' ag-card-interactive' : '') + (hover ? ' card-hover cursor-pointer ' : ' ') + className}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  kicker,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  kicker?: string;
}) {
  return (
    <header className="card-header flex items-start justify-between gap-4 border-b border-ink-100 px-4 py-3.5">
      <div className="min-w-0">
        {kicker && <div className="ag-card-kicker">{kicker}</div>}
        <h3 className="text-[13px] font-bold text-ink-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[10px] leading-5 text-ink-400">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

export function CardBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={'p-4 ' + className}>{children}</div>;
}
