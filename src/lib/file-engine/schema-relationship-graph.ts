import type { SchemaField } from './schema-intelligence';
export type SchemaRelation = { from: SchemaField; to: SchemaField; kind: 'identifies' | 'describes' | 'measures' | 'groups'; confidence: number; evidence: string };
const RELATIONS: SchemaRelation[] = [
  { from: 'sku', to: 'product_name', kind: 'describes', confidence: 100, evidence: 'SKU identifies the product described by product name' },
  { from: 'sku', to: 'barcode', kind: 'identifies', confidence: 92, evidence: 'barcode is an alternate product identifier' },
  { from: 'customer_id', to: 'customer_name', kind: 'describes', confidence: 100, evidence: 'customer id identifies customer name' },
  { from: 'invoice_number', to: 'customer_id', kind: 'identifies', confidence: 95, evidence: 'invoice belongs to a customer identifier' },
  { from: 'invoice_number', to: 'date', kind: 'groups', confidence: 90, evidence: 'invoice number groups transaction date' },
  { from: 'sku', to: 'quantity', kind: 'measures', confidence: 95, evidence: 'quantity is measured for a product key' },
  { from: 'sku', to: 'price', kind: 'measures', confidence: 95, evidence: 'price is measured for a product key' },
  { from: 'warehouse', to: 'sku', kind: 'groups', confidence: 88, evidence: 'warehouse groups inventory records by product' },
];
export function buildSchemaRelationshipGraph(fields: SchemaField[]): SchemaRelation[] { const present = new Set(fields); return RELATIONS.filter(relation => present.has(relation.from) && present.has(relation.to)); }
