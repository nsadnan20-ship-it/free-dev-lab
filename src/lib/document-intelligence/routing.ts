import type { Criticality } from './validation';
import { classifyConfidence } from './validation';

export type CanonicalRoute = {
  canonicalField: string;
  entity: string;
  destination: string;
  criticality: Criticality;
};

export type RoutingDecision = CanonicalRoute & {
  confidence: number;
  action: 'AUTO_APPROVE' | 'REVIEW' | 'QUARANTINE' | 'UNMAPPED';
};

const ROUTES: Record<string, CanonicalRoute> = {
  product_code: { canonicalField: 'product_code', entity: 'product', destination: 'products', criticality: 'CRITICAL' },
  product_name: { canonicalField: 'product_name', entity: 'product', destination: 'products', criticality: 'HIGH' },
  barcode: { canonicalField: 'barcode', entity: 'product', destination: 'products', criticality: 'MEDIUM' },
  quantity: { canonicalField: 'quantity', entity: 'inventory', destination: 'inventory', criticality: 'HIGH' },
  unit: { canonicalField: 'unit', entity: 'product', destination: 'products', criticality: 'MEDIUM' },
  unit_price: { canonicalField: 'unit_price', entity: 'pricing', destination: 'pricing', criticality: 'HIGH' },
  customer_id: { canonicalField: 'customer_id', entity: 'customer', destination: 'customers', criticality: 'HIGH' },
  supplier_id: { canonicalField: 'supplier_id', entity: 'supplier', destination: 'suppliers', criticality: 'HIGH' },
  invoice_number: { canonicalField: 'invoice_number', entity: 'invoice', destination: 'invoices', criticality: 'CRITICAL' },
  invoice_date: { canonicalField: 'invoice_date', entity: 'invoice', destination: 'invoices', criticality: 'CRITICAL' },
  total_amount: { canonicalField: 'total_amount', entity: 'invoice', destination: 'invoices', criticality: 'CRITICAL' }
};

function safeConfidence(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

export function routeCanonicalField(field: string, confidence: number): RoutingDecision {
  const route = ROUTES[field];
  const safe = safeConfidence(confidence);
  if (!route) return {
    canonicalField: field,
    entity: 'unknown',
    destination: 'quarantine',
    criticality: 'OPTIONAL',
    confidence: safe,
    action: 'UNMAPPED'
  };
  return { ...route, confidence: safe, action: classifyConfidence(safe, route.criticality) };
}

export function routeMany(fields: Array<{ field: string; confidence: number }>): RoutingDecision[] {
  const decisions = fields.map(f => routeCanonicalField(f.field, f.confidence));
  const groups = new Map<string, RoutingDecision[]>();
  for (const decision of decisions) {
    if (decision.action === 'UNMAPPED') continue;
    const group = groups.get(decision.canonicalField) ?? [];
    group.push(decision);
    groups.set(decision.canonicalField, group);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const decision of group) {
      decision.action = 'QUARANTINE';
      decision.confidence = Math.min(decision.confidence, 0.69);
    }
  }
  return decisions;
}
