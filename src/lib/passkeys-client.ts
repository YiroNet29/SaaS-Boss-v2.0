import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { authedFetch, describeDevice } from './api-client';

export interface PasskeyInfo {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export const supportsPasskeys = () => typeof window !== 'undefined' && browserSupportsWebAuthn();

export async function listPasskeys(): Promise<PasskeyInfo[]> {
  const res = await authedFetch<{ passkeys?: PasskeyInfo[] }>("/api/passkeys");
  return Array.isArray(res?.passkeys) ? res.passkeys : [];
}

/** Fingerprint / Face ID / Windows Hello on this device. The server verifies and stores the public key. */
export async function addPasskey(name = describeDevice()): Promise<void> {
  const optionsJSON = await authedFetch('/api/passkeys/register/options', { method: 'POST' });
  const response = await startRegistration({ optionsJSON });
  await authedFetch('/api/passkeys/register/verify', {
    method: 'POST',
    body: JSON.stringify({ response, deviceName: name }),
  });
}

export async function removePasskey(id: string): Promise<void> {
  await authedFetch(`/api/passkeys?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/**
 * Unlock: the device signs a one-time challenge and the server checks the signature.
 * Cancelling the prompt is a failure, never an unlock.
 */
export async function unlockWithPasskey(): Promise<{ ok: boolean; error?: string; signOut?: boolean }> {
  let optionsJSON;
  try {
    optionsJSON = await authedFetch('/api/passkeys/unlock/options', { method: 'POST' });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  let response;
  try {
    response = await startAuthentication({ optionsJSON });
  } catch (err) {
    const name = (err as { name?: string }).name;
    return { ok: false, error: name === 'NotAllowedError' ? 'Cancelled.' : err instanceof Error ? err.message : String(err) };
  }
  try {
    await authedFetch('/api/passkeys/unlock/verify', { method: 'POST', body: JSON.stringify({ response }) });
    return { ok: true };
  } catch (err) {
    const body = (err as { body?: any }).body ?? {};
    return { ok: false, error: body.error || (err instanceof Error ? err.message : String(err)), signOut: !!body.signOut };
  }
}
