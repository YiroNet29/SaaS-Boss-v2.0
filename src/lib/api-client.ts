import { getSupabase } from './supabase/client';

/** Calls one of this app's API routes as the signed-in user. Throws with the server's message. */
export async function authedFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await getSupabase().auth.getSession();
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `Request failed (HTTP ${res.status})`) as Error & { body?: any; status?: number };
    err.body = body;
    err.status = res.status;
    throw err;
  }
  return body as T;
}

/** "Chrome on Windows" style label for security events and passkey names. */
export function describeDevice(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): string {
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Browser';
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad|iPod/.test(ua)
      ? 'iPhone/iPad'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X/.test(ua)
          ? 'Mac'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'device';
  return `${browser} on ${os}`;
}

/** Fired after a security event is recorded, so the activity list can refresh. */
export const SECURITY_EVENT = 'stacktrack:security-event';

export type ClientSecurityAction =
  | 'sign_in'
  | 'unlock'
  | 'unlock_failed'
  | 'export'
  | 'mfa_enabled'
  | 'mfa_disabled'
  | 'mfa_device_added'
  | 'mfa_device_removed';

/** Records a security event (and lets the server send a Telegram alert where needed). */
export async function reportSecurityEvent(
  action: ClientSecurityAction,
  details: string
): Promise<{ signOut?: boolean; attemptsLeft?: number }> {
  try {
    return await authedFetch('/api/security/event', { method: 'POST', body: JSON.stringify({ action, details }) });
  } catch (err) {
    return (err as { body?: any }).body ?? {};
  } finally {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(SECURITY_EVENT));
  }
}
