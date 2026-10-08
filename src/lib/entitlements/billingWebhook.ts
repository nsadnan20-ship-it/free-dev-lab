export interface BillingWebhook { provider: string; eventId: string; tenantId: string; payload: string; signature: string; timestamp: number; }
export interface WebhookReplayGuard { has(eventId: string): boolean; remember(eventId: string): void; }

export function verifyWebhookTimestamp(timestamp: number, now = Date.now(), toleranceMs = 5 * 60_000): void {
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > toleranceMs) throw new Error('Billing webhook timestamp outside replay window');
}

export async function verifyWebhookSignature(webhook: BillingWebhook, secret: string): Promise<boolean> {
  if (!secret || !webhook.signature || !webhook.eventId || !webhook.tenantId) return false;
  const data = new TextEncoder().encode(`${webhook.timestamp}.${webhook.eventId}.${webhook.payload}`);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const signature = Uint8Array.from(webhook.signature.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) ?? []);
  return crypto.subtle.verify('HMAC', key, signature, data);
}

export function acceptWebhook(webhook: BillingWebhook, guard: WebhookReplayGuard, verified: boolean, now = Date.now()): void {
  verifyWebhookTimestamp(webhook.timestamp, now);
  if (!verified) throw new Error('Billing webhook signature verification failed');
  if (guard.has(webhook.eventId)) throw new Error('Billing webhook replay detected');
  guard.remember(webhook.eventId);
}
