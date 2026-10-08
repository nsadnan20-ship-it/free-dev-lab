export type ReviewReason = 'LOW_CONFIDENCE' | 'AMBIGUOUS_MAPPING' | 'DUPLICATE_KEY' | 'RECONCILIATION_MISMATCH' | 'UNMAPPED_FIELD' | 'MISSING_CRITICAL_FIELD';
export type ReviewRecord = { id: string; tenantId: string; sourceId: string; rowIndex: number; reason: ReviewReason; status: 'OPEN' | 'APPROVED' | 'REJECTED'; evidence: string[]; createdAt: string };

export function createReviewRecord(input: Omit<ReviewRecord, 'id' | 'status'>): ReviewRecord {
  if (!input.tenantId || !input.sourceId) throw new Error('REVIEW_SCOPE_REQUIRED');
  if (!Number.isInteger(input.rowIndex) || input.rowIndex < 0) throw new Error('REVIEW_ROW_INVALID');
  const seed = `${input.tenantId}|${input.sourceId}|${input.rowIndex}|${input.reason}|${input.createdAt}`;
  let hash = 2166136261; for (let i = 0; i < seed.length; i++) { hash ^= seed.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return { ...input, id: `review_${(hash >>> 0).toString(16).padStart(8, '0')}`, status: 'OPEN' };
}

export function canPromoteReview(record: ReviewRecord, decision: 'APPROVE' | 'REJECT'): ReviewRecord {
  if (record.status !== 'OPEN') throw new Error('REVIEW_ALREADY_RESOLVED');
  return { ...record, status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED' };
}
