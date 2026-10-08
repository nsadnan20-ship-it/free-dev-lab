export type DashboardFilterPeriod = 3 | 6 | 12;
export type DashboardFilterKey = 'period' | 'customer' | 'category' | 'product';

export interface DashboardFilterContext {
  period: DashboardFilterPeriod;
  customerId: string | null;
  categoryId: string | null;
  productId: string | null;
}

export const DEFAULT_DASHBOARD_FILTER_CONTEXT: DashboardFilterContext = {
  period: 12,
  customerId: null,
  categoryId: null,
  productId: null,
};

export function resetDashboardFilterContext(): DashboardFilterContext {
  return { ...DEFAULT_DASHBOARD_FILTER_CONTEXT };
}

export function setDashboardFilter(
  context: DashboardFilterContext,
  key: 'period',
  value: DashboardFilterPeriod,
): DashboardFilterContext;
export function setDashboardFilter(
  context: DashboardFilterContext,
  key: 'customer' | 'category' | 'product',
  value: string | null,
): DashboardFilterContext;
export function setDashboardFilter(
  context: DashboardFilterContext,
  key: DashboardFilterKey,
  value: DashboardFilterPeriod | string | null,
): DashboardFilterContext {
  switch (key) {
    case 'period':
      return { ...context, period: value as DashboardFilterPeriod };
    case 'customer':
      return { ...context, customerId: value as string | null };
    case 'category':
      return { ...context, categoryId: value as string | null };
    case 'product':
      return { ...context, productId: value as string | null };
  }
}

export function hasActiveDashboardFilters(context: DashboardFilterContext): boolean {
  return context.period !== DEFAULT_DASHBOARD_FILTER_CONTEXT.period
    || context.customerId !== null
    || context.categoryId !== null
    || context.productId !== null;
}

export function serializeDashboardFilterContext(context: DashboardFilterContext): string {
  return JSON.stringify({
    period: context.period,
    customerId: context.customerId,
    categoryId: context.categoryId,
    productId: context.productId,
  });
}

export function parseDashboardFilterContext(value: string): DashboardFilterContext | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    const period = record.period;
    if (typeof period !== 'number' || !Number.isFinite(period) || ![3, 6, 12].includes(period)) return null;
    const optionalString = (candidate: unknown): string | null => candidate === null || typeof candidate === 'string' ? candidate : null;
    return {
      period: period as DashboardFilterPeriod,
      customerId: optionalString(record.customerId),
      categoryId: optionalString(record.categoryId),
      productId: optionalString(record.productId),
    };
  } catch {
    return null;
  }
}
