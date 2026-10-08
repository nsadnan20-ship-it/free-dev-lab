export type BatchEntityType = 'sales_invoices' | 'products' | 'customers';

function requiredFields(entityType: BatchEntityType): string[] {
  return entityType === 'products'
    ? ['sku', 'name', 'cost_price', 'selling_price', 'unit', 'min_stock', 'reorder_point', 'is_active']
    : entityType === 'customers'
      ? ['name', 'code', 'segment', 'credit_limit', 'payment_terms_days']
      : ['invoice_number', 'invoice_date', 'total', 'subtotal', 'tax_amount', 'paid_amount', 'status'];
}

export function missingRequiredFields(entityType: BatchEntityType, data: Record<string, unknown>): string[] {
  const missing = requiredFields(entityType).filter((field) => {
    const value = data[field];
    return value == null || String(value).trim() === '';
  });

  if (entityType === 'sales_invoices') {
    const hasCustomerId = data.customer_id != null && String(data.customer_id).trim() !== '';
    const hasCustomerName = data.customer_name != null && String(data.customer_name).trim() !== '';
    if (!hasCustomerId && !hasCustomerName) missing.push('customer_id_or_customer_name');
  }

  return missing;
}
