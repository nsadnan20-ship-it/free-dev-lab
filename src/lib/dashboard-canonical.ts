import { supabase } from './supabase';
import type { Recommendation, Alert } from './types';

export interface DashboardKPIs {
  totalSales:number|null; totalCost:number|null; grossProfit:number|null; grossMargin:number|null;
  totalReceivables:number|null; overdueReceivables:number|null; totalPayables:number|null; inventoryValue:number|null;
  totalCustomers:number|null; activeCustomers:number|null; totalProducts:number|null; invoiceCount:number|null;
  avgInvoiceValue:number|null; collectionRate:number|null; status:'CONFIRMED'|'CALCULATED'|'INSUFFICIENT_DATA';
}
export interface MonthlyTrend {month:string;label:string;sales:number|null;cost:number|null;profit:number|null;invoices:number;status:'CALCULATED'|'NO_DATA'|'INSUFFICIENT_DATA';}
export interface TopEntity {id:string;name:string;value:number;secondary?:number;}
export interface AgingBucket {bucket:string;amount:number|null;count:number;}
export interface AgingDashboard {rows:AgingBucket[];totalAmount:number|null;unknownRows:number;status:'NO_DATA'|'CALCULATED'|'INSUFFICIENT_DATA';}
export interface CategoryBreakdown {name:string|null;sales:number;profit:number;quantity:number;categoryStatus:'CALCULATED'|'UNKNOWN';}
export interface ProfitabilitySnapshot {status:'CALCULATED'|'INSUFFICIENT_DATA';currency:string|null;currency_status:'CONSISTENT'|'INSUFFICIENT_DATA';revenue:number|null;cost:number|null;gross_profit:number|null;gross_margin:number|null;invoice_count:number|null;bad_invoice_rows:number|null;bad_sale_item_rows:number|null;currency_mismatch_rows:number|null;reasons:string[];as_of:string;}
export interface InventoryReportRow {id:string;quantity:number|null;unit_cost:number|null;value:number|null;product?:{id:string;name:string|null;sku:string|null;reorder_point:number|null}|null;warehouse?:{id:string;name:string|null}|null;}
export interface InventoryReportSnapshot {rows:InventoryReportRow[];page:number;pageSize:number;filter:'all'|'low'|'out';totalRows:number|null;filteredRows:number|null;lowStock:number|null;outOfStock:number|null;unknownRows:number|null;totalValue:number|null;dataStatus:'NO_DATA'|'INSUFFICIENT_DATA'|'CALCULATED';}
export interface RFMSnapshotRow {customer_id:string;customer_name:string;recency:number;frequency:number;monetary:number;r_score:number;f_score:number;m_score:number;rfm_segment:string;}
export interface RFMSnapshot {rows:RFMSnapshotRow[];asOf:string;unknownRows:number|null;status:'INSUFFICIENT_DATA'|'CALCULATED';}
export interface ABCSnapshotRow {product_id:string;product_name:string;revenue:number;cumulative:number;cumulative_pct:number|null;class:'A'|'B'|'C'|null;}
export interface ABCSnapshot {rows:ABCSnapshotRow[];totalRevenue:number|null;unknownRows:number|null;status:'INSUFFICIENT_DATA'|'CALCULATED';}
export interface AgingSnapshotRow {name:string;amount:number;count:number;}
export interface AgingSnapshot {rows:AgingSnapshotRow[];asOf:string;unknownRows:number|null;status:'NO_DATA'|'INSUFFICIENT_DATA'|'CALCULATED';}
interface Snapshot { kpis:DashboardKPIs; trend:MonthlyTrend[]; topCustomers:TopEntity[]; topProducts:TopEntity[]; categories:CategoryBreakdown[]; aging:AgingDashboard; asOf:string; months:number; }
function finiteOrNull(value: unknown): number|null { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function requiredArray<T>(value: unknown): T[] { return Array.isArray(value) ? value as T[] : []; }
function asOfDate(): string { return new Date().toISOString().slice(0, 10); }

export async function fetchDashboardSnapshot(months = 6, signal?: AbortSignal): Promise<Snapshot> {
  if (!Number.isInteger(months) || months < 1 || months > 24) throw new Error('REPORT_QUERY_INVALID_MONTHS');
  const query = supabase.rpc('get_dashboard_snapshot', { p_months: months, p_as_of: asOfDate() });
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  if (error) throw error;
  if (!data || typeof data !== 'object') throw new Error('REPORT_DATA_UNAVAILABLE: dashboard snapshot missing');
  const row = data as Record<string, unknown>;

  const rawStatus = row.status;
  const evidence = row.evidence;
  const hasEvidence = evidence !== null && evidence !== undefined;
  const status: DashboardKPIs['status'] = rawStatus === 'CONFIRMED' && !hasEvidence
    ? 'INSUFFICIENT_DATA'
    : rawStatus === 'CONFIRMED'
      ? 'CONFIRMED'
      : rawStatus === 'CALCULATED'
        ? 'CALCULATED'
        : 'INSUFFICIENT_DATA';
  const valueOrNull = (value: unknown): number | null => status === 'INSUFFICIENT_DATA' ? null : finiteOrNull(value);

  const kpis: DashboardKPIs = {
    totalSales:valueOrNull(row.totalSales),
    totalCost:valueOrNull(row.totalCost),
    grossProfit:valueOrNull(row.grossProfit),
    grossMargin:valueOrNull(row.grossMargin),
    totalReceivables:valueOrNull(row.totalReceivables),
    overdueReceivables:valueOrNull(row.overdueReceivables),
    totalPayables:valueOrNull(row.totalPayables),
    inventoryValue:valueOrNull(row.inventoryValue),
    totalCustomers:valueOrNull(row.totalCustomers),
    activeCustomers:valueOrNull(row.activeCustomers),
    totalProducts:valueOrNull(row.totalProducts),
    invoiceCount:valueOrNull(row.invoiceCount),
    avgInvoiceValue:valueOrNull(row.avgInvoiceValue),
    collectionRate:valueOrNull(row.collectionRate),
    status,
  };

  const agingRow=(row.aging&&typeof row.aging==='object'?row.aging:{}) as Record<string,unknown>;
  return {
    kpis,
    trend: requiredArray<MonthlyTrend>(row.trend),
    topCustomers: requiredArray<TopEntity>(row.topCustomers).slice(0,10),
    topProducts: requiredArray<TopEntity>(row.topProducts).slice(0,10),
    categories: requiredArray<CategoryBreakdown>(row.categories),
    asOf: typeof row.asOf === 'string' ? row.asOf : asOfDate(),
    months: typeof row.months === 'number' && Number.isInteger(row.months) ? row.months : months,
    aging:{
      rows:requiredArray<AgingBucket>(agingRow.rows),
      totalAmount:finiteOrNull(agingRow.totalAmount),
      unknownRows:typeof agingRow.unknownRows==='number'?agingRow.unknownRows:0,
      status:agingRow.status==='CALCULATED'?'CALCULATED':agingRow.status==='NO_DATA'?'NO_DATA':'INSUFFICIENT_DATA'
    }
  };
}

export async function fetchInventoryReportSnapshot(page = 0, pageSize = 25, filter: 'all'|'low'|'out' = 'all'): Promise<InventoryReportSnapshot> {
  if (!Number.isInteger(page) || page < 0) throw new Error('REPORT_QUERY_INVALID_PAGE');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error('REPORT_QUERY_INVALID_PAGE_SIZE');
  if (!['all','low','out'].includes(filter)) throw new Error('REPORT_QUERY_INVALID_FILTER');
  const { data, error } = await supabase.rpc('get_inventory_report_snapshot', { p_page: page, p_page_size: pageSize, p_filter: filter });
  if (error) throw error;
  if (!data || typeof data !== 'object') throw new Error('REPORT_DATA_UNAVAILABLE: inventory snapshot missing');
  const row = data as Record<string, unknown>;
  return {
    rows: requiredArray<InventoryReportRow>(row.rows), page: typeof row.page === 'number' && Number.isInteger(row.page) ? row.page : page,
    pageSize: typeof row.pageSize === 'number' && Number.isInteger(row.pageSize) ? row.pageSize : pageSize,
    filter: row.filter === 'low' || row.filter === 'out' ? row.filter : 'all', totalRows: finiteOrNull(row.totalRows),
    filteredRows: finiteOrNull(row.filteredRows), lowStock: finiteOrNull(row.lowStock), outOfStock: finiteOrNull(row.outOfStock),
    unknownRows: finiteOrNull(row.unknownRows), totalValue: finiteOrNull(row.totalValue),
    dataStatus: row.dataStatus === 'CALCULATED' ? 'CALCULATED' : row.dataStatus === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT_DATA' : 'NO_DATA'
  };
}

export async function fetchProfitabilitySnapshot(): Promise<ProfitabilitySnapshot> {
  const { data, error } = await supabase.rpc('get_profitability_snapshot', { p_as_of: asOfDate() });
  if (error) throw error;
  if (!data || typeof data !== 'object') throw new Error('REPORT_DATA_UNAVAILABLE: profitability snapshot missing');
  const row=data as Record<string,unknown>;
  return { status: row.status==='CALCULATED'?'CALCULATED':'INSUFFICIENT_DATA', currency: typeof row.currency==='string'?row.currency:null, currency_status: row.currency_status==='CONSISTENT'?'CONSISTENT':'INSUFFICIENT_DATA', revenue:finiteOrNull(row.revenue), cost:finiteOrNull(row.cost), gross_profit:finiteOrNull(row.gross_profit), gross_margin:finiteOrNull(row.gross_margin), invoice_count:finiteOrNull(row.invoice_count), bad_invoice_rows:finiteOrNull(row.bad_invoice_rows), bad_sale_item_rows:finiteOrNull(row.bad_sale_item_rows), currency_mismatch_rows:finiteOrNull(row.currency_mismatch_rows), reasons:requiredArray<string>(row.reasons), as_of:typeof row.as_of==='string'?row.as_of:asOfDate() };
}

export async function fetchRFMSnapshot(limit = 500): Promise<RFMSnapshot> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('REPORT_QUERY_INVALID_LIMIT');
  const { data, error } = await supabase.rpc('get_rfm_snapshot', { p_as_of: asOfDate(), p_limit: limit });
  if (error) throw error; if (!data || typeof data !== 'object') throw new Error('REPORT_DATA_UNAVAILABLE: RFM snapshot missing');
  const row = data as Record<string, unknown>; return { rows: requiredArray<RFMSnapshotRow>(row.rows), asOf: typeof row.asOf==='string'?row.asOf:asOfDate(), unknownRows: finiteOrNull(row.unknownRows), status: row.status === 'CALCULATED' ? 'CALCULATED' : 'INSUFFICIENT_DATA' };
}
export async function fetchABCSnapshot(limit = 500): Promise<ABCSnapshot> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('REPORT_QUERY_INVALID_LIMIT');
  const { data, error } = await supabase.rpc('get_abc_snapshot', { p_limit: limit });
  if (error) throw error; if (!data || typeof data !== 'object') throw new Error('REPORT_DATA_UNAVAILABLE: ABC snapshot missing');
  const row = data as Record<string, unknown>; return { rows: requiredArray<ABCSnapshotRow>(row.rows), totalRevenue: finiteOrNull(row.totalRevenue), unknownRows: finiteOrNull(row.unknownRows), status: row.status === 'CALCULATED' ? 'CALCULATED' : 'INSUFFICIENT_DATA' };
}
export async function fetchAgingSnapshot(): Promise<AgingSnapshot> {
  const { data, error } = await supabase.rpc('get_aging_snapshot', { p_as_of: asOfDate() });
  if (error) throw error; if (!data || typeof data !== 'object') throw new Error('REPORT_DATA_UNAVAILABLE: aging snapshot missing');
  const row = data as Record<string, unknown>; return { rows: requiredArray<AgingSnapshotRow>(row.rows), asOf: typeof row.asOf==='string'?row.asOf:asOfDate(), unknownRows: finiteOrNull(row.unknownRows), status: row.status === 'CALCULATED' ? 'CALCULATED' : row.status === 'NO_DATA' ? 'NO_DATA' : 'INSUFFICIENT_DATA' };
}

export function normalizeRecommendationStatus(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized === 'open') return 'accepted';
  return status;
}

function normalizeRecommendations(value: unknown): Recommendation[] {
  return requiredArray<Recommendation>(value).map((item) => ({
    ...item,
    status: normalizeRecommendationStatus(item.status),
  }));
}

export async function fetchDashboardIntelligence(): Promise<{recommendations: Recommendation[]; alerts: Alert[]}> {
  const maxAttempts = 3;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { data, error } = await supabase.rpc('get_dashboard_intelligence', { p_limit: 100 });
      if (error) throw error;
      if (!data || typeof data !== 'object') throw new Error('REPORT_DATA_UNAVAILABLE: dashboard intelligence missing');
      const row = data as Record<string, unknown>;
      return { recommendations: normalizeRecommendations(row.recommendations), alerts: requiredArray<Alert>(row.alerts) };
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) await new Promise(resolve => setTimeout(resolve, 250 * attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('REPORT_DATA_UNAVAILABLE: dashboard intelligence fetch failed');
}
