import type { ArchetypeProfile } from './archetype-registry.js';

export type ArchetypeRuleFamily =
  | 'trend'
  | 'invoice'
  | 'party-concentration'
  | 'continuity'
  | 'mix'
  | 'location'
  | 'representative'
  | 'returns'
  | 'discount'
  | 'payment'
  | 'target-gap'
  | 'price'
  | 'lead-time'
  | 'inventory-position'
  | 'inventory-movement'
  | 'aging'
  | 'inventory-aging'
  | 'inventory-velocity'
  | 'coverage'
  | 'stockout-reorder'
  | 'inventory-valuation'
  | 'inventory-adjustment'
  | 'transfer'
  | 'activity'
  | 'rfm'
  | 'customer-product'
  | 'supplier-performance'
  | 'cashflow'
  | 'profitability'
  | 'account'
  | 'balance-sheet'
  | 'demand';

export const ARCHETYPE_RULE_FAMILY: Record<string, ArchetypeRuleFamily> = {
  'sales.over-time': 'trend',
  'sales.invoice-detail': 'invoice',
  'sales.by-customer': 'party-concentration',
  'sales.by-customer-month': 'continuity',
  'sales.by-product': 'mix',
  'sales.by-category-brand': 'mix',
  'sales.by-branch-warehouse': 'location',
  'sales.by-representative': 'representative',
  'sales.returns': 'returns',
  'sales.discounts': 'discount',
  'sales.payment-terms': 'payment',
  'sales.target-vs-actual': 'target-gap',
  'purchases.over-time': 'trend',
  'purchases.invoice-detail': 'invoice',
  'purchases.by-supplier': 'party-concentration',
  'purchases.by-supplier-month': 'continuity',
  'purchases.by-product-category': 'mix',
  'purchases.price-change': 'price',
  'purchases.returns': 'returns',
  'purchases.by-branch-warehouse': 'location',
  'purchases.supplier-concentration': 'party-concentration',
  'purchases.supply-cycle': 'lead-time',
  'inventory.balances': 'inventory-position',
  'inventory.movement-card': 'inventory-movement',
  'inventory.aging': 'inventory-aging',
  'inventory.velocity': 'inventory-velocity',
  'inventory.coverage': 'coverage',
  'inventory.stockout-reorder': 'stockout-reorder',
  'inventory.valuation': 'inventory-valuation',
  'inventory.location-comparison': 'location',
  'inventory.abnormal-adjustments': 'inventory-adjustment',
  'inventory.transfers': 'transfer',
  'customers.activity': 'activity',
  'customers.statement': 'aging',
  'customers.continuity': 'continuity',
  'customers.rfm-abc-xyz': 'rfm',
  'customers.product-intelligence': 'customer-product',
  'suppliers.activity': 'activity',
  'suppliers.statement': 'aging',
  'suppliers.performance': 'supplier-performance',
  'finance.cash-bank': 'cashflow',
  'finance.receivables-aging': 'aging',
  'finance.payables-aging': 'aging',
  'finance.cashflow-liquidity': 'cashflow',
  'finance.profitability': 'profitability',
  'finance.general-ledger': 'account',
  'finance.balance-sheet': 'balance-sheet',
  'demand.forecast': 'demand',
};

export function attachArchetypeRuleFamily<T extends ArchetypeProfile>(profile: T): T & { ruleFamily: ArchetypeRuleFamily } {
  const ruleFamily = ARCHETYPE_RULE_FAMILY[profile.id];
  if (!ruleFamily) throw new Error('ARCHETYPE_RULE_FAMILY_MISSING:' + profile.id);
  return { ...profile, ruleFamily };
}
