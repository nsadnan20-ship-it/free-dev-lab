import type { InventoryBalance } from '@/lib/types';

export interface AggregatedInventory {
  productId: string;
  stock: number;
  inventoryValue: number;
  warehouseCount: number;
  balances: InventoryBalance[];
}

/** Company-level inventory must be additive across warehouses. */
export function aggregateInventoryBalances(balances: InventoryBalance[]): AggregatedInventory[] {
  const map = new Map<string, AggregatedInventory>();
  for (const balance of balances) {
    if (!balance.product_id) continue;
    const quantity = Number(balance.quantity);
    const unitCost = Number(balance.unit_cost);
    const stock = Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
    const cost = Number.isFinite(unitCost) ? Math.max(0, unitCost) : 0;
    const current = map.get(balance.product_id);
    if (!current) {
      map.set(balance.product_id, {
        productId: balance.product_id,
        stock,
        inventoryValue: stock * cost,
        warehouseCount: 1,
        balances: [balance],
      });
    } else {
      current.stock += stock;
      current.inventoryValue += stock * cost;
      current.warehouseCount += 1;
      current.balances.push(balance);
    }
  }
  return [...map.values()];
}
