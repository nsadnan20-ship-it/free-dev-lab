export interface AIDataPolicyInput {
  capability: 'chat' | 'embedding' | 'document' | 'ocr';
  tenantId: string;
  text?: string;
  includeRawBusinessRows?: boolean;
  trustedProvider?: boolean;
}

export interface AIDataPolicyDecision {
  allowed: boolean;
  reason: string;
  payloadMode: 'none' | 'redacted-context' | 'approved-context';
}

/**
 * Hosted AI is not allowed to receive arbitrary database rows. Callers must
 * first construct a minimal, approved context or use deterministic tools.
 */
export function evaluateAIDataPolicy(input: AIDataPolicyInput): AIDataPolicyDecision {
  if (!input.tenantId) return { allowed: false, reason: 'Tenant scope is required', payloadMode: 'none' };
  if (input.includeRawBusinessRows) return { allowed: false, reason: 'Raw business rows are not allowed in hosted AI context', payloadMode: 'none' };
  if (input.trustedProvider !== true) return { allowed: false, reason: 'Provider is not approved for company data', payloadMode: 'none' };
  if (!input.text?.trim()) return { allowed: false, reason: 'Approved context is empty', payloadMode: 'none' };
  return { allowed: true, reason: 'Approved minimum context', payloadMode: 'approved-context' };
}

/**
 * Session-bound entry point. A caller-controlled tenant id must never be
 * sufficient to authorize AI access; the authenticated session tenant is the
 * authority and must match the requested tenant before the existing policy
 * is evaluated.
 */
export function evaluateAIDataPolicyForSession(input: AIDataPolicyInput, authenticatedTenantId: string | null | undefined): AIDataPolicyDecision {
  if (!authenticatedTenantId) return { allowed: false, reason: 'Authenticated tenant scope is required', payloadMode: 'none' };
  if (input.tenantId !== authenticatedTenantId) return { allowed: false, reason: 'Requested tenant does not match authenticated tenant', payloadMode: 'none' };
  return evaluateAIDataPolicy(input);
}
