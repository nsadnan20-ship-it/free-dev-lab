import { supabase, resolveCurrentCompanyId } from './supabase';

export type OperationalOrder = {
  id: string;
  order_number: number;
  status: string;
  total: number;
  currency: string;
  customer_id: string;
  warehouse_id: string;
  created_at: string;
  updated_at: string;
  customer?: { id: string; name: string | null } | null;
  warehouse?: { id: string; name: string | null } | null;
};

export type OperationalInvoice = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  status: string;
  total: number;
  paid_amount: number;
  currency: string;
  order_id: string | null;
  customer?: { id: string; name: string | null } | null;
};

export type OperationalPriceTier = {
  id: string;
  customer_id: string;
  product_id: string;
  min_quantity: number;
  unit_price: number;
  currency: string;
  customer?: { id: string; name: string | null } | null;
  product?: { id: string; name: string | null; sku: string | null } | null;
};

export type OperationalSupplier = {
  id: string;
  name: string;
  code: string | null;
  payment_terms_days: number | null;
};

export type OperationalWarehouse = {
  id: string;
  name: string;
  code: string | null;
  is_active: boolean;
};

export type OperationalAuditEntry = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  source: string | null;
  userLabel: string | null;
  correlationId: string | null;
  createdAt: string;
};

type RelationEntity = { id: string; name: string | null };

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

async function tenantId(): Promise<string> {
  const companyId = await resolveCurrentCompanyId();
  if (!companyId) throw new Error('TENANT_REQUIRED');
  return companyId;
}

export async function fetchOperationalOrders(limit = 100): Promise<OperationalOrder[]> {
  const companyId = await tenantId();
  const { data, error } = await supabase
    .from('orders')
    .select('id,order_number,status,total,currency,customer_id,warehouse_id,created_at,updated_at,customer:customers(id,name),warehouse:warehouses(id,name)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<Omit<OperationalOrder, 'customer' | 'warehouse'> & {
    customer: RelationEntity | RelationEntity[] | null;
    warehouse: RelationEntity | RelationEntity[] | null;
  }>;
  return rows.map((row) => ({
    ...row,
    customer: normalizeRelation(row.customer),
    warehouse: normalizeRelation(row.warehouse),
  }));
}

export type OperationalOrderStatusHistoryEntry = {
  id: string;
  order_id: string;
  from_status: string;
  to_status: string;
  actor_id: string | null;
  created_at: string;
};

export async function fetchOperationalOrderStatusHistory(orderId: string, limit = 30): Promise<OperationalOrderStatusHistoryEntry[]> {
  const companyId = await tenantId();
  const { data, error } = await supabase
    .from('order_status_history')
    .select('id,order_id,from_status,to_status,actor_id,created_at')
    .eq('company_id', companyId)
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as OperationalOrderStatusHistoryEntry[];
}

export async function transitionOperationalOrder(orderId: string, toStatus: string): Promise<OperationalOrder> {
  await tenantId();
  const { data, error } = await supabase.rpc('transition_order', {
    p_order_id: orderId,
    p_to_status: toStatus,
  });
  if (error) throw error;
  return data as OperationalOrder;
}

export async function createInvoiceFromOperationalOrder(orderId: string): Promise<OperationalInvoice> {
  await tenantId();
  const { data, error } = await supabase.rpc('create_invoice_from_order', { p_order_id: orderId });
  if (error) throw error;
  return data as OperationalInvoice;
}

export async function fetchOperationalInvoices(limit = 100): Promise<OperationalInvoice[]> {
  const companyId = await tenantId();
  const { data, error } = await supabase
    .from('sales_invoices')
    .select('id,invoice_number,invoice_date,due_date,status,total,paid_amount,currency,order_id,customer:customers(id,name)')
    .eq('company_id', companyId)
    .order('invoice_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<Omit<OperationalInvoice, 'customer'> & {
    customer: RelationEntity | RelationEntity[] | null;
  }>;
  return rows.map((row) => ({
    ...row,
    customer: normalizeRelation(row.customer),
  }));
}

export async function recordOperationalSalesPayment(input: {
  invoiceId: string;
  amount: number;
  method: string;
  reference?: string;
  paymentDate: string;
}): Promise<Record<string, unknown>> {
  await tenantId();
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('INVALID_PAYMENT_AMOUNT');
  const { data, error } = await supabase.rpc('record_sales_payment', {
    p_invoice_id: input.invoiceId,
    p_amount: input.amount,
    p_method: input.method.trim() || null,
    p_reference: input.reference?.trim() || null,
    p_payment_date: input.paymentDate,
  });
  if (error) throw error;
  return (data ?? {}) as Record<string, unknown>;
}

export async function fetchOperationalPriceTruth(limit = 50): Promise<OperationalPriceTier[]> {
  const companyId = await tenantId();
  const { data, error } = await supabase
    .from('customer_price_tiers')
    .select('id,customer_id,product_id,min_quantity,unit_price,currency,customer:customers(id,name),product:products(id,name,sku)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<Omit<OperationalPriceTier, 'customer' | 'product'> & {
    customer: RelationEntity | RelationEntity[] | null;
    product: { id: string; name: string | null; sku: string | null } | Array<{ id: string; name: string | null; sku: string | null }> | null;
  }>;
  return rows.map((row) => ({
    ...row,
    customer: normalizeRelation(row.customer),
    product: normalizeRelation(row.product),
  }));
}

export async function fetchOperationalSuppliers(limit = 100): Promise<OperationalSupplier[]> {
  const companyId = await tenantId();
  const { data, error } = await supabase
    .from('suppliers')
    .select('id,name,code,payment_terms_days')
    .eq('company_id', companyId)
    .order('name', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as OperationalSupplier[];
}


export async function fetchOperationalAuditTrace(limit = 40): Promise<OperationalAuditEntry[]> {
  const companyId = await tenantId();
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id,action,entity_type,entity_id,source,user_label,correlation_id,created_at')
    .eq('company_id', companyId)
    .eq('source', 'operations-runtime')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as Array<{
    id: string;
    action: string;
    entity_type: string | null;
    entity_id: string | null;
    source: string | null;
    user_label: string | null;
    correlation_id: string | null;
    created_at: string;
  }>).map(row => ({
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    source: row.source,
    userLabel: row.user_label,
    correlationId: row.correlation_id,
    createdAt: row.created_at,
  }));
}

export async function fetchOperationalWarehouses(limit = 100): Promise<OperationalWarehouse[]> {
  const companyId = await tenantId();
  const { data, error } = await supabase
    .from('warehouses')
    .select('id,name,code,is_active')
    .eq('company_id', companyId)
    .order('name', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as OperationalWarehouse[];
}
