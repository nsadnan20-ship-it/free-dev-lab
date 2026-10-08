export type UsageEvent = { tenantId: string; capability: string; quantity: number; period: string; idempotencyKey: string; occurredAt: string };
export type UsageSummary = { tenantId: string; capability: string; period: string; used: number; eventCount: number };

export class UsageLedger {
  private readonly events = new Map<string, UsageEvent>();

  record(event: UsageEvent): UsageEvent {
    if (!event.tenantId || !event.capability || !event.period || !event.idempotencyKey) throw new Error('Usage event identity is incomplete');
    if (!Number.isFinite(event.quantity) || event.quantity <= 0) throw new Error('Usage quantity must be positive');
    const key = `${event.tenantId}:${event.period}:${event.idempotencyKey}`;
    const existing = this.events.get(key);
    if (existing) {
      if (existing.capability !== event.capability || existing.quantity !== event.quantity) throw new Error('Usage idempotency key reused with different usage');
      return { ...existing };
    }
    this.events.set(key, { ...event });
    return { ...event };
  }

  summarize(tenantId: string, capability: string, period: string): UsageSummary {
    const events = [...this.events.values()].filter(e => e.tenantId === tenantId && e.capability === capability && e.period === period);
    return { tenantId, capability, period, used: events.reduce((sum, e) => sum + e.quantity, 0), eventCount: events.length };
  }
}
