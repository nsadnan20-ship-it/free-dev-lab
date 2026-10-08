export interface Company {
  id: string;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  currency: string;
  industry: string;
  phone: string | null;
  email: string | null;
  address: string | null;
}

export interface Branch {
  id: string;
  company_id: string;
  name: string;
  code: string | null;
  is_active: boolean;
}

export interface Warehouse {
  id: string;
  company_id: string;
  branch_id: string | null;
  name: string;
  code: string | null;
}

export interface Category {
  id: string;
  company_id: string;
  name: string;
  parent_id: string | null;
}

export interface Customer {
  id: string;
  company_id: string;
  name: string;
  code: string | null;
  phone: string | null;
  email: string | null;
  segment: string;
  credit_limit: number;
  payment_terms_days: number;
  created_at: string;
}

export interface Supplier {
  id: string;
  company_id: string;
  name: string;
  code: string | null;
  phone: string | null;
  payment_terms_days: number;
}

export interface Product {
  id: string;
  company_id: string;
  category_id: string | null;
  sku: string;
  name: string;
  barcode: string | null;
  unit: string;
  cost_price: number;
  selling_price: number;
  min_stock: number;
  reorder_point: number;
  is_active: boolean;
}

export interface SalesInvoice {
  id: string;
  company_id: string;
  branch_id: string | null;
  customer_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  status: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total: number;
  paid_amount: number;
  sales_rep: string | null;
  customer?: Customer;
  branch?: Branch;
}

export interface SaleItem {
  id: string;
  invoice_id: string;
  product_id: string | null;
  description: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  cost_price: number;
  product?: Product;
}

export interface PurchaseInvoice {
  id: string;
  company_id: string;
  supplier_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  status: string;
  subtotal: number;
  tax_amount: number;
  total: number;
  paid_amount: number;
  supplier?: Supplier;
}

export interface PurchaseItem {
  id: string;
  invoice_id: string;
  product_id: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface Payment {
  id: string;
  company_id: string;
  direction: string;
  customer_id: string | null;
  supplier_id: string | null;
  invoice_id: string | null;
  amount: number;
  payment_date: string;
  method: string;
  reference: string | null;
}

export interface InventoryMovement {
  id: string;
  company_id: string;
  warehouse_id: string | null;
  product_id: string;
  movement_type: string;
  quantity: number;
  unit_cost: number;
  reference_type: string | null;
  movement_date: string;
}

export interface InventoryBalance {
  id: string;
  company_id: string;
  warehouse_id: string | null;
  product_id: string;
  quantity: number;
  unit_cost: number;
  last_movement_date: string | null;
  product?: Product;
  warehouse?: Warehouse;
}

export interface ImportRecord {
  id: string;
  company_id: string;
  file_name: string;
  file_size: number;
  source_type: string;
  status: string;
  total_rows: number | null;
  valid_rows: number | null;
  invalid_rows: number | null;
  quarantined_rows: number | null;
  entity_type: string | null;
  progress: number | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface Recommendation {
  id: string;
  company_id: string;
  category: string;
  priority: string;
  title: string;
  description: string | null;
  expected_impact: number | null;
  confidence: string;
  status: string;
  owner: string | null;
  deadline: string | null;
  impact_result: string | null;
  created_at: string;
}

export interface Alert {
  id: string;
  company_id: string;
  severity: string;
  category: string;
  title: string;
  description: string | null;
  metric_value: number | null;
  threshold: number | null;
  is_read: boolean;
  created_at: string;
}

export interface Forecast {
  id: string;
  company_id: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string;
  metric: string;
  period: string;
  forecast_value: number;
  lower_bound: number;
  upper_bound: number;
  model_name: string;
  quality_score: number | null;
  confidence: string;
  data_points: number;
}

export interface AuditLog {
  id: string;
  company_id: string | null;
  action: string;
  entity_type: string | null;
  source: string | null;
  user_label: string | null;
  created_at: string;
}

export type DataStatus = 'CONFIRMED' | 'CALCULATED' | 'ESTIMATED' | 'FORECAST' | 'INSUFFICIENT_DATA' | 'UNAVAILABLE';

export interface KPI {
  label: string;
  value: number;
  format: 'currency' | 'number' | 'percent' | 'compact';
  status?: DataStatus;
  change?: number;
  changeLabel?: string;
  icon?: string;
  hint?: string;
}
