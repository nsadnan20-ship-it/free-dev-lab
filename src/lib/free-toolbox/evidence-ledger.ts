export interface Evidence {
  id?: string;
  sourceId: string;
  sourceDocumentId?: string;
  sourceHash?: string;
  page?: number;
  location?: string;
  method: 'native' | 'table' | 'ocr' | 'derived';
  field?: string;
  raw?: string;
  normalized?: unknown;
  confidence?: number;
  note?: string;
}
export type EvidenceEntry = Evidence;
export interface EvidenceLedger { items: Evidence[] }
export interface DecisionEvidence { decisionId: string; claim: string; refs: Evidence[]; confidence: number; status: 'verified' | 'partial' | 'insufficient' }

/** Canonical evidence identity binds a claim to a concrete source and immutable source content. */
export function hasEvidenceIdentity(evidence: Evidence): boolean {
  return Boolean(evidence.sourceId.trim() && evidence.sourceHash?.trim());
}

/** Provenance additionally binds the evidence to its source document identity. */
export function hasEvidenceProvenance(evidence: Evidence): boolean {
  return hasEvidenceIdentity(evidence) && Boolean(evidence.sourceDocumentId?.trim());
}

export function addEvidence(ledger: EvidenceLedger, evidence: Evidence): EvidenceLedger { return { items: [...ledger.items, evidence] }; }
export function evidenceFor(ledger: EvidenceLedger, field: string) { return ledger.items.filter(x => x.field === field); }
export function bestEvidence(ledger: EvidenceLedger, field: string) { return evidenceFor(ledger, field).filter(hasEvidenceIdentity).sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0] ?? null; }
export function explainDecision(decisionId: string, claim: string, refs: Evidence[]): DecisionEvidence {
  const usable = refs.filter(hasEvidenceProvenance);
  const confidence = usable.length ? usable.reduce((s, r) => s + (r.confidence ?? 1), 0) / usable.length : 0;
  return { decisionId, claim, refs: usable, confidence, status: confidence >= .8 ? 'verified' : confidence > 0 ? 'partial' : 'insufficient' };
}
