export type AIRuntimeMode = 'free' | 'browser' | 'local' | 'hosted' | 'auto';

export interface AIRuntimePolicy {
  mode: AIRuntimeMode;
  allowHosted: boolean;
  allowBrowserModels: boolean;
  allowLocalOllama: boolean;
  allowPaidInference: boolean;
  requireConsentForExternalData: boolean;
  neverSendBusinessDataToUntrustedProvider: boolean;
}

/**
 * Product policy: no paid inference and no local model installation are required.
 * Hosted inference may only be enabled explicitly when a project-owned free quota
 * is configured; the normal path is deterministic + browser-capable AI.
 *
 * Local Ollama is an opt-in capability: it is permitted by policy but is never
 * required by the default free runtime. It becomes active only when the runtime
 * mode is explicitly `local` or `auto` and Ollama is available on the device.
 */
export const DEFAULT_AI_RUNTIME_POLICY: AIRuntimePolicy = {
  mode: 'free',
  allowHosted: false,
  allowBrowserModels: true,
  allowLocalOllama: true,
  allowPaidInference: false,
  requireConsentForExternalData: true,
  neverSendBusinessDataToUntrustedProvider: true,
};

export function shouldUseLocalAI(policy: AIRuntimePolicy): boolean {
  return policy.allowLocalOllama && (policy.mode === 'local' || policy.mode === 'auto');
}

export function shouldUseHostedAI(policy: AIRuntimePolicy): boolean {
  return policy.allowHosted && policy.allowPaidInference === false && (policy.mode === 'hosted' || policy.mode === 'auto');
}

export function canUseInferenceProvider(policy: AIRuntimePolicy, provider: 'free-hosted' | 'paid-hosted'): boolean {
  if (provider === 'paid-hosted') return false;
  return policy.allowHosted;
}
