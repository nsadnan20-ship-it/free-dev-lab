export type DemandEvent = { customerId: string; sku: string; groupId?: string; requestedQty: number; fulfilledQty: number; unitWeightKg?: number; occurredAt: string };
export type DemandAttribution = { customerId: string; sku: string; groupId?: string; requestedQty: number; fulfilledQty: number; unfulfilledQty: number; unfulfilledKg: number; eventCount: number; lastOccurredAt: string };

export function attributeDemand(events: DemandEvent[]): DemandAttribution[] {
  const map = new Map<string, DemandAttribution>();
  for (const event of events) {
    if (!event.customerId || !event.sku) throw new Error('DEMAND_ATTRIBUTION_SCOPE_REQUIRED');
    if (event.requestedQty < 0 || event.fulfilledQty < 0 || event.fulfilledQty > event.requestedQty) throw new Error('DEMAND_ATTRIBUTION_QUANTITY_INVALID');
    const key = `${event.customerId}::${event.sku}`;
    const current = map.get(key);
    const unfulfilled = event.requestedQty - event.fulfilledQty;
    const weight = event.unitWeightKg ?? 0;
    if (!current) {
      map.set(key, { customerId: event.customerId, sku: event.sku, groupId: event.groupId, requestedQty: event.requestedQty, fulfilledQty: event.fulfilledQty, unfulfilledQty: unfulfilled, unfulfilledKg: unfulfilled * weight, eventCount: 1, lastOccurredAt: event.occurredAt });
    } else {
      current.requestedQty += event.requestedQty;
      current.fulfilledQty += event.fulfilledQty;
      current.unfulfilledQty += unfulfilled;
      current.unfulfilledKg += unfulfilled * weight;
      current.eventCount += 1;
      if (event.occurredAt > current.lastOccurredAt) current.lastOccurredAt = event.occurredAt;
    }
  }
  return [...map.values()];
}
