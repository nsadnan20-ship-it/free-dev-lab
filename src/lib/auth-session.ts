import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * Canonical frontend authentication helpers.
 *
 * Security boundary: database RLS/current_company_id() remains authoritative.
 * These helpers prevent UI code from treating a demo company or hard-coded
 * identity as an authenticated tenant context.
 */
export async function getAuthenticatedUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session?.user ?? null;
}

/**
 * Operations that need server-validated identity keep using getUser().
 * Client-side UI/session gating must not repeatedly revalidate the same
 * persisted session across hard navigations; the database tenant/RLS boundary
 * remains authoritative for protected data access.
 */
export async function requireAuthenticatedUser(): Promise<User> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('AUTHENTICATION_REQUIRED');
  return data.user;
}

export async function hasAuthenticatedSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return Boolean(data.session?.user);
}

export function onAuthStateChange(
  callback: (user: User | null) => void,
): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    // Supabase invokes this callback while its auth state transition is being
    // processed. Defer application work so tenant RPC/session reads cannot
    // contend with the auth lock and stall post-login UI convergence.
    queueMicrotask(() => callback(session?.user ?? null));
  });

  return () => data.subscription.unsubscribe();
}
