export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'cancelled' | 'expired';
export type SubscriptionEvent = 'TRIAL_STARTED' | 'ACTIVATED' | 'PAYMENT_FAILED' | 'PAUSED' | 'RESUMED' | 'CANCELLED' | 'EXPIRED';

const transitions: Record<SubscriptionStatus, Partial<Record<SubscriptionEvent, SubscriptionStatus>>> = {
  trialing: { ACTIVATED: 'active', PAYMENT_FAILED: 'past_due', CANCELLED: 'cancelled', EXPIRED: 'expired' },
  active: { PAYMENT_FAILED: 'past_due', PAUSED: 'paused', CANCELLED: 'cancelled' },
  past_due: { ACTIVATED: 'active', PAUSED: 'paused', CANCELLED: 'cancelled', EXPIRED: 'expired' },
  paused: { RESUMED: 'active', CANCELLED: 'cancelled', EXPIRED: 'expired' },
  cancelled: { ACTIVATED: 'active' },
  expired: { ACTIVATED: 'active' },
};

export function transitionSubscription(status: SubscriptionStatus, event: SubscriptionEvent): SubscriptionStatus {
  const next = transitions[status][event];
  if (!next) throw new Error(`Invalid subscription transition: ${status} -> ${event}`);
  return next;
}

export function canRetainCustomerData(status: SubscriptionStatus): boolean {
  return status !== 'expired';
}
