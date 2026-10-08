import { supabase, resolveCurrentCompanyId } from './supabase';

export interface TenantMembership {
  company_id: string;
  role: string;
  status: 'active' | 'inactive';
  is_default: boolean;
  company?: { id: string; name: string } | null;
}

/**
 * Resolve tenant UI context from the canonical company_memberships table and
 * the database current_company_id() resolver. The browser never chooses a
 * tenant by array order or by a client-supplied company id.
 */
export async function resolveTenantContext(preferredCompanyId?: string | null) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { user: null, memberships: [] as TenantMembership[], active: null as TenantMembership | null };
  }

  const { data, error } = await supabase
    .from('company_memberships')
    .select('company_id, role, is_active, is_default, created_at, company:companies(id,name)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) throw error;

  const memberships: TenantMembership[] = (data ?? []).map((row) => {
    const raw = row.company as unknown as { id: string; name: string } | { id: string; name: string }[] | null | undefined;
    const company = Array.isArray(raw) ? raw[0] ?? null : raw ?? null;
    return {
      company_id: row.company_id,
      role: row.role,
      status: row.is_active ? 'active' : 'inactive',
      is_default: Boolean(row.is_default),
      company,
    };
  });

  const authoritativeCompanyId = await resolveCurrentCompanyId();
  if (!authoritativeCompanyId) {
    return { user, memberships, active: null as TenantMembership | null };
  }

  // A preferred/client-selected tenant is only accepted when it is exactly the
  // authoritative server-resolved tenant. Never fall back to the first row.
  if (preferredCompanyId && preferredCompanyId !== authoritativeCompanyId) {
    return { user, memberships, active: null as TenantMembership | null };
  }

  const active = memberships.find((m) => m.company_id === authoritativeCompanyId) ?? null;
  if (!active) {
    return { user, memberships, active: null as TenantMembership | null };
  }

  return { user, memberships, active };
}
