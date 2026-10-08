import type { DashboardKPIs } from './queries';

export type CompleteDashboardKPIs = DashboardKPIs & {
  totalSales: number;
  totalCost: number;
  grossProfit: number;
  grossMargin: number;
  totalReceivables: number;
  overdueReceivables: number;
  totalPayables: number;
  inventoryValue: number;
  avgInvoiceValue: number;
  collectionRate: number;
};

export function isCompleteDashboardKPIs(value: DashboardKPIs | null): value is CompleteDashboardKPIs {
  if (!value || value.status === 'INSUFFICIENT_DATA') return false;
  return [
    value.totalSales,
    value.totalCost,
    value.grossProfit,
    value.grossMargin,
    value.totalReceivables,
    value.overdueReceivables,
    value.totalPayables,
    value.inventoryValue,
    value.avgInvoiceValue,
    value.collectionRate,
  ].every((item) => typeof item === 'number' && Number.isFinite(item));
}
