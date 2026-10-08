import { preferredBackends, type AICapabilityBackend } from './aiCapabilityRegistry.ts';
import { chooseDocumentRoute, type DocumentPlan, type DocumentProfile } from './free-toolbox/document-route.ts';
import type { Evidence } from './free-toolbox/evidence-ledger.ts';
import type { EvidenceRef, LineageGraph } from './free-toolbox/data-lineage.ts';

export type DocumentCapability = 'document-parsing' | 'ocr' | 'table-extraction';
export type DocumentBackendStatus = 'AVAILABLE' | 'OPTIONAL' | 'UNAVAILABLE';
export interface DocumentBackendChoice { capability: DocumentCapability; backend: AICapabilityBackend['backend']; status: DocumentBackendStatus; requiresInstall: boolean; mayCostMoney: boolean; reason: string }
export interface DocumentExtractionFact { field: string; value: string | number | null; confidence: number; source: string; page?: number; location?: string; sourceDocumentId?: string; sourceHash?: string }
export interface DocumentExtractionEnvelope { plan: DocumentPlan; choices: DocumentBackendChoice[]; stage: 'PLANNED' | 'READY_FOR_EXTRACTION' | 'INSUFFICIENT_BACKEND'; warnings: string[]; facts: DocumentExtractionFact[] }

function choose(capability: DocumentCapability): DocumentBackendChoice {
  const candidates = preferredBackends(capability);
  const deterministic = candidates.find(item => item.backend === 'deterministic' && !item.requiresUserDeviceInstall);
  const optional = candidates.find(item => item.optional && !item.requiresUserDeviceInstall);
  const selected = deterministic ?? optional ?? candidates[0];
  if (!selected) return { capability, backend: 'deterministic', status: 'UNAVAILABLE', requiresInstall: false, mayCostMoney: false, reason: 'لا يوجد backend مسجل لهذه القدرة.' };
  return { capability, backend: selected.backend, status: selected.optional ? 'OPTIONAL' : 'AVAILABLE', requiresInstall: Boolean(selected.requiresUserDeviceInstall), mayCostMoney: Boolean(selected.mayCostMoney), reason: selected.optional ? 'Backend اختياري؛ لا يغيّر المسار المجاني الأساسي.' : 'Backend أساسي مجاني ومتاح ضمن سياسة النظام.' };
}

export function planDocumentIntelligence(profile: DocumentProfile): DocumentExtractionEnvelope {
  const plan = chooseDocumentRoute(profile);
  const choices = [choose('document-parsing'), choose('table-extraction'), choose('ocr')];
  const requiredForPlan: DocumentCapability[] = plan.route === 'ocr' ? ['ocr'] : plan.route === 'table-extract' ? ['table-extraction'] : plan.route === 'hybrid' ? ['document-parsing', 'table-extraction'] : ['document-parsing'];
  const blocked = requiredForPlan.some(capability => choices.find(choice => choice.capability === capability)?.status === 'UNAVAILABLE');
  const installWarnings = choices.filter(choice => choice.requiresInstall).map(choice => `${choice.backend}: لا يُفرض على العميل.`);
  return { plan, choices, stage: blocked ? 'INSUFFICIENT_BACKEND' : 'READY_FOR_EXTRACTION', warnings: [...installWarnings, ...choices.filter(choice => choice.mayCostMoney).map(choice => `${choice.backend}: محظور في المسار المجاني.`)], facts: [] };
}

export function acceptExtractedFacts(envelope: DocumentExtractionEnvelope, facts: DocumentExtractionFact[]): DocumentExtractionEnvelope {
  const valid = facts.filter(f => Number.isFinite(f.confidence) && f.confidence >= 0 && f.confidence <= 1 && Boolean(f.source));
  return { ...envelope, stage: envelope.stage === 'INSUFFICIENT_BACKEND' ? envelope.stage : 'READY_FOR_EXTRACTION', facts: valid, warnings: [...envelope.warnings, ...(valid.length < facts.length ? ['تم رفض حقول مستخرجة تفتقد source أو confidence صالح.'] : [])] };
}

function stableEvidenceId(f: DocumentExtractionFact) {
  const identity = [f.source, f.sourceDocumentId, f.sourceHash, f.page, f.location, f.field, f.value === null ? 'NULL' : JSON.stringify(f.value)];
  return identity.filter(v => v !== undefined && v !== '').join(':');
}

export function extractedFactsToEvidence(facts: DocumentExtractionFact[]): Evidence[] {
  return facts.filter(f => Boolean(f.source) && Number.isFinite(f.confidence) && f.confidence >= 0 && f.confidence <= 1).map(f => ({ id: stableEvidenceId(f), sourceId: f.source, sourceDocumentId: f.sourceDocumentId, sourceHash: f.sourceHash, page: f.page, location: f.location, method: 'derived', field: f.field, raw: f.value === null ? undefined : String(f.value), normalized: f.value, confidence: f.confidence }));
}

function toLineageEvidence(e: Evidence): EvidenceRef { return { sourceId: e.sourceId, sourceDocumentId: e.sourceDocumentId, sourceHash: e.sourceHash, label: e.field ?? 'document fact', location: e.location ?? (e.page !== undefined ? `page:${e.page}` : undefined), value: typeof e.normalized === 'string' || typeof e.normalized === 'number' ? e.normalized : undefined }; }
function provenanceKey(e: Evidence) { return [e.sourceId, e.sourceDocumentId, e.sourceHash].filter(v => v !== undefined && v !== '').join(':'); }

export function attachExtractedFactsToLineage(graph: LineageGraph, facts: DocumentExtractionFact[], targetId: string): LineageGraph {
  const evidence = extractedFactsToEvidence(facts);
  if (!graph.nodes.some(n => n.id === targetId) || evidence.length === 0) return graph;
  const additions = evidence.flatMap(item => {
    const key = provenanceKey(item), sourceNodeId = `document-source:${key}`, factNodeId = `document-fact:${key}:${item.field}`, ev = toLineageEvidence(item);
    return [
      { id: sourceNodeId, type: 'source' as const, label: item.sourceDocumentId ? `${item.sourceId} (${item.sourceDocumentId})` : item.sourceId, evidence: [ev] },
      { id: factNodeId, type: 'metric' as const, label: item.field ?? 'document fact', evidence: [ev] },
    ];
  });
  const nodes = [...graph.nodes];
  for (const n of additions) if (!nodes.some(x => x.id === n.id)) nodes.push(n);
  const edges = [...graph.edges];
  for (const item of evidence) {
    const key = provenanceKey(item), sourceNodeId = `document-source:${key}`, factNodeId = `document-fact:${key}:${item.field}`;
    if (!edges.some(e => e.from === sourceNodeId && e.to === factNodeId)) edges.push({ from: sourceNodeId, to: factNodeId, label: 'extracted-from' });
    if (!edges.some(e => e.from === factNodeId && e.to === targetId)) edges.push({ from: factNodeId, to: targetId, label: 'supports' });
  }
  return { nodes, edges };
}