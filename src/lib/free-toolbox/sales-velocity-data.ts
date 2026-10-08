import { resolveCurrentCompanyId, supabase } from '@/lib/supabase';
import type { SaleEvent } from './sales-velocity-engine';

export async function fetchSalesVelocityEvents(days = 365): Promise<SaleEvent[]> {
  if (!Number.isFinite(days) || days <= 0) throw new Error('Invalid sales velocity analysis window');
  const companyId = await resolveCurrentCompanyId();
  if (!companyId) throw new Error('Tenant context is unavailable');

  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { data: invoices, error: invoiceError } = await supabase
    .from('sales_invoices')
    .select('id,invoice_date')
    .eq('company_id', companyId)
    .gte('invoice_date', since);
  if (invoiceError) throw invoiceError;
  if (!invoices?.length) return [];

  const ids = invoices.map((invoice) => invoice.id);
  const dates = new Map(invoices.map((invoice) => [invoice.id, invoice.invoice_date]));
  const { data: items, error: itemError } = await supabase
    .from('sale_items')
    .select('invoice_id,product_id,quantity,line_total')
    .in('invoice_id', ids);
  if (itemError) throw itemError;

  return (items ?? [])
    .filter((item) => {
      const quantity = Number(item.quantity);
      const netValue = Number(item.line_total);
      return Boolean(item.product_id) && Number.isFinite(quantity) && Number.isFinite(netValue) && dates.has(item.invoice_id);
    })
    .map((item) => ({
      productId: String(item.product_id),
      date: String(dates.get(item.invoice_id)),
      quantity: Number(item.quantity),
      netValue: Number(item.line_total),
    }));
}
