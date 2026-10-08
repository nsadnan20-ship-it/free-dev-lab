import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Public/demo routes must be renderable without database credentials.
 * Protected data access still requires the real environment variables; the
 * placeholder client only prevents module evaluation from blanking the whole
 * application before a protected route can establish its auth boundary.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
const browserSupabaseUrl = supabaseUrl || 'https://placeholder.invalid';
const browserSupabaseAnonKey = supabaseAnonKey || 'placeholder-anon-key';

/**
 * Canonical browser client.
 * Session persistence is enabled so authenticated tenant membership can be
 * resolved consistently across navigation/reloads. RLS and the database
 * current_company_id() resolver remain the authoritative security boundary.
 */
export const supabase = createClient(browserSupabaseUrl, browserSupabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

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
