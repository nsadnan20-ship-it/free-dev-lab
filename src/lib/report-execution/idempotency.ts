export interface IdempotencyRecord { key: string; tenantId: string; runId: string; fingerprint: string; createdAt: string; }

export class IdempotencyRegistry {
  private readonly records = new Map<string, IdempotencyRecord>();

  claim(key: string, tenantId: string, fingerprint: string, runId: string): IdempotencyRecord {
    const scopedKey = `${tenantId}:${key}`;
    const existing = this.records.get(scopedKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new Error('Idempotency key reused with a different request');
      return existing;
    }
    const record = { key, tenantId, runId, fingerprint, createdAt: new Date().toISOString() };
    this.records.set(scopedKey, record);
    return record;
  }

  get(key: string, tenantId: string): IdempotencyRecord | undefined { return this.records.get(`${tenantId}:${key}`); }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}

export function fingerprintRequest(request: unknown): string {
  const stable = JSON.stringify(canonicalize(request));
  let hash = 2166136261;
  for (let i = 0; i < stable.length; i++) { hash ^= stable.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
