export type AICapability = 'chat' | 'embedding' | 'document-parsing' | 'ocr' | 'table-extraction' | 'forecasting' | 'anomaly-detection';

export type AIBackendKind = 'deterministic' | 'browser-open-model' | 'free-hosted' | 'ollama' | 'docling' | 'paddleocr' | 'tesseract' | 'supabase' | 'python';

export interface AICapabilityBackend {
  capability: AICapability;
  backend: AIBackendKind;
  priority: number;
  local: boolean;
  optional: boolean;
  requiresUserDeviceInstall?: boolean;
  mayCostMoney?: boolean;
}

export const AI_CAPABILITY_REGISTRY: readonly AICapabilityBackend[] = [
  { capability: 'chat', backend: 'deterministic', priority: 130, local: true, optional: false, mayCostMoney: false },
  { capability: 'chat', backend: 'browser-open-model', priority: 120, local: true, optional: true, mayCostMoney: false },
  { capability: 'chat', backend: 'free-hosted', priority: 100, local: false, optional: true, mayCostMoney: false },
  { capability: 'chat', backend: 'ollama', priority: 20, local: true, optional: true, requiresUserDeviceInstall: true, mayCostMoney: false },
  { capability: 'embedding', backend: 'deterministic', priority: 130, local: true, optional: false, mayCostMoney: false },
  { capability: 'embedding', backend: 'browser-open-model', priority: 120, local: true, optional: true, mayCostMoney: false },
  { capability: 'embedding', backend: 'free-hosted', priority: 100, local: false, optional: true, mayCostMoney: false },
  { capability: 'embedding', backend: 'ollama', priority: 20, local: true, optional: true, requiresUserDeviceInstall: true, mayCostMoney: false },
  { capability: 'document-parsing', backend: 'docling', priority: 120, local: false, optional: true, mayCostMoney: false },
  { capability: 'document-parsing', backend: 'deterministic', priority: 110, local: true, optional: false, mayCostMoney: false },
  { capability: 'ocr', backend: 'paddleocr', priority: 120, local: false, optional: true, mayCostMoney: false },
  { capability: 'ocr', backend: 'tesseract', priority: 110, local: true, optional: false, mayCostMoney: false },
  { capability: 'table-extraction', backend: 'docling', priority: 120, local: false, optional: true, mayCostMoney: false },
  { capability: 'table-extraction', backend: 'deterministic', priority: 110, local: true, optional: false, mayCostMoney: false },
  { capability: 'forecasting', backend: 'deterministic', priority: 130, local: true, optional: false, mayCostMoney: false },
  { capability: 'anomaly-detection', backend: 'deterministic', priority: 130, local: true, optional: false, mayCostMoney: false },
];

export function preferredBackends(capability: AICapability): AICapabilityBackend[] {
  return AI_CAPABILITY_REGISTRY.filter(item => item.capability === capability).sort((a, b) => b.priority - a.priority);
}

export function hasOptionalBackend(capability: AICapability, backend: AIBackendKind): boolean {
  return AI_CAPABILITY_REGISTRY.some(item => item.capability === capability && item.backend === backend && item.optional);
}

export function hasPaidBackend(capability: AICapability): boolean {
  return AI_CAPABILITY_REGISTRY.some(item => item.capability === capability && item.mayCostMoney === true);
}
