export interface DeadLetterRecord<T> {
  id: string;
  payload: T;
  reason: string;
  attempts: number;
  sourceHash: string;
  createdAt: number;
}

export function toDeadLetter<T>(input: Omit<DeadLetterRecord<T>, 'createdAt'> & { createdAt?: number }): DeadLetterRecord<T> {
  if (!input.id.trim()) throw new Error('Dead-letter id is required');
  if (!input.reason.trim()) throw new Error('Dead-letter reason is required');
  if (!Number.isInteger(input.attempts) || input.attempts < 1) throw new Error('Dead-letter attempts must be a positive integer');
  if (!input.sourceHash.trim()) throw new Error('Dead-letter source hash is required');
  const createdAt = input.createdAt ?? Date.now();
  if (!Number.isFinite(createdAt)) throw new Error('Dead-letter timestamp is invalid');
  return Object.freeze({ ...input, createdAt });
}

export class DeadLetterQueue<T> {
  private readonly records: DeadLetterRecord<T>[] = [];

  enqueue(record: DeadLetterRecord<T>): void {
    if (this.records.some((item) => item.id === record.id)) throw new Error(`Duplicate dead-letter id: ${record.id}`);
    this.records.push(record);
  }

  list(): readonly DeadLetterRecord<T>[] {
    return this.records.map((record) => ({ ...record }));
  }

  size(): number {
    return this.records.length;
  }
}
