import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as cloudClient } from '@/integrations/supabase/client';

/**
 * Canonical browser client: the single Lovable Cloud client (one auth session).
 * Exposed untyped because the imported screens were written against the
 * original untyped client. RLS and current_company_id() remain the security boundary.
 */
export const isSupabaseConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
export const supabase = cloudClient as unknown as SupabaseClient;

/**
 * Resolve the authenticated user's tenant exclusively through the database
 * authority. No mutable module-level tenant id, demo id, browser fallback, or
 * client-selected tenant is retained here.
 */
export async function resolveCurrentCompanyId(signal?: AbortSignal): Promise<string | null> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) return null;

  const effectiveSignal = signal ?? AbortSignal.timeout(12000);
  const tenantQuery = supabase.rpc('current_company_id');
  const { data, error } = await tenantQuery.abortSignal(effectiveSignal);
  if (error || !data) return null;

  return String(data);
}
