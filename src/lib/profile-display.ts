import type { User } from '@supabase/supabase-js';

/**
 * Presentation-only identity resolution. The authenticated Supabase account is
 * authoritative; the Arabic title is only a safe display fallback until the
 * profile/settings surface allows the owner to choose a preferred display name.
 */
export function getDisplayName(user: User | null): string {
  const metadataName = typeof user?.user_metadata?.full_name === 'string'
    ? user.user_metadata.full_name.trim()
    : '';
  return metadataName || 'المدير العام';
}

export function getDisplayEmail(user: User | null): string {
  return user?.email?.trim() || 'لم يتم تحديد البريد الإلكتروني';
}
