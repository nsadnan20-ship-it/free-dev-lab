export type TrustState = 'VERIFIED' | 'TRUSTED' | 'PARTIAL' | 'REVIEW' | 'BLOCKED' | 'INSUFFICIENT_DATA';

export function trustStateFromDataStatus(status?: string): TrustState {
  switch (status) {
    case 'CONFIRMED': return 'VERIFIED';
    case 'CALCULATED': return 'TRUSTED';
    case 'ESTIMATED': return 'PARTIAL';
    case 'FORECAST': return 'REVIEW';
    case 'INSUFFICIENT_DATA': return 'INSUFFICIENT_DATA';
    case 'UNAVAILABLE': return 'BLOCKED';
    default: return 'REVIEW';
  }
}
