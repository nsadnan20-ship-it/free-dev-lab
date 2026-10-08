import { resolveCurrentCompanyId, supabase } from '@/lib/supabase';

export interface DemandPoint { date: string; quantity: number; sales: number }
export interface ProductDemandSeries { productId: string; sku: string; name: string; points: DemandPoint[]; totalQuantity: number; averageDaily: number; peakDaily: number; trend: number }

type DemandRow = {
  invoice_id: string;
  product_id: string | null;
  quantity: number | string | null;
  line_total: number | string | null;
  product: { sku: string | null; name: string | null } | { sku: string | null; name: string | null }[] | null;
};

const dayKey = (value: string) => {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) throw new Error('Invalid invoice observation date');
  return new Date(time).toISOString().slice(0, 10);
};

function productDetails(product: DemandRow['product']): { sku: string; name: string } | null {
  const value = Array.isArray(product) ? product[0] : product;
  if (!value?.sku?.trim() || !value.name?.trim()) return null;
  return { sku: value.sku.trim(), name: value.name.trim() };
}

export async function fetchProductDemandSeries(days = 180): Promise<ProductDemandSeries[]> {
  if (!Number.isFinite(days) || days <= 0) throw new Error('Invalid demand analysis window');
  const companyId = await resolveCurrentCompanyId();
  if (!companyId) throw new Error('Tenant context is unavailable');

  const since = new Date();
  since.setDate(since.getDate() - Math.floor(days));
  const { data: invoices, error: invoiceError } = await supabase
    .from('sales_invoices')
    .select('id,invoice_date')
    .eq('company_id', companyId)
    .gte('invoice_date', since.toISOString())
    .order('invoice_date', { ascending: true });
  if (invoiceError) throw invoiceError;
  if (!invoices?.length) return [];

  const ids = invoices.map((invoice) => invoice.id);
  const dateByInvoice = new Map(invoices.map((invoice) => [invoice.id, dayKey(invoice.invoice_date)]));
  const { data: items, error: itemError } = await supabase
    .from('sale_items')
    .select('invoice_id,product_id,quantity,line_total,product:products(sku,name)')
    .in('invoice_id', ids);
  if (itemError) throw itemError;

  const map = new Map<string, ProductDemandSeries>();
  for (const row of (items ?? []) as DemandRow[]) {
    if (!row.product_id) continue;
    const date = dateByInvoice.get(row.invoice_id);
    const product = productDetails(row.product);
    const quantity = Number(row.quantity);
    const sales = Number(row.line_total);
    if (!date || !product || !Number.isFinite(quantity) || !Number.isFinite(sales)) continue;

    let entry = map.get(row.product_id);
    if (!entry) {
      entry = { productId: row.product_id, sku: product.sku, name: product.name, points: [], totalQuantity: 0, averageDaily: 0, peakDaily: 0, trend: 0 };
      map.set(row.product_id, entry);
    }

    const point = entry.points.find((item) => item.date === date);
    if (point) {
      point.quantity += quantity;
      point.sales += sales;
    } else {
      entry.points.push({ date, quantity, sales });
    }
    entry.totalQuantity += quantity;
  }

  for (const entry of map.values()) {
    entry.points.sort((a, b) => a.date.localeCompare(b.date));
    entry.averageDaily = entry.totalQuantity / days;
    entry.peakDaily = Math.max(...entry.points.map((point) => point.quantity), 0);
    const half = Math.max(1, Math.floor(entry.points.length / 2));
    const first = entry.points.slice(0, half).reduce((sum, point) => sum + point.quantity, 0) / half;
    const last = entry.points.slice(-half).reduce((sum, point) => sum + point.quantity, 0) / half;
    entry.trend = first > 0 ? (last - first) / first : last > 0 ? 1 : 0;
  }

  return [...map.values()].sort((a, b) => b.totalQuantity - a.totalQuantity);
}
