import 'server-only';
import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';

const CHALLENGE_TTL_MS = 5 * 60_000;

export interface PasskeyRow {
  id: string;
  user_id: string;
  public_key: string;
  counter: number;
  transports: string[];
  device_name: string;
  created_at: string;
  last_used_at: string | null;
}

/**
 * Passkeys are bound to the site's address. We use the browser's Origin header and require it to
 * match the host the request came to, so a request from another site can't borrow it.
 */
export function relyingParty(request: NextRequest): { rpID: string; origin: string } | null {
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (!origin || !host) return null;
  try {
    const u = new URL(origin);
    if (u.host !== host) return null;
    return { rpID: u.hostname, origin: u.origin };
  } catch {
    return null;
  }
}

async function saveChallenge(admin: SupabaseClient, uid: string, challenge: string, purpose: 'register' | 'unlock') {
  const { error } = await admin.from('webauthn_challenges').upsert(
    { user_id: uid, challenge, purpose, expires_at: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString() },
    { onConflict: 'user_id' }
  );
  if (error) throw new Error(error.message);
}

/** Single use: the challenge is deleted as it is read. */
async function takeChallenge(admin: SupabaseClient, uid: string, purpose: 'register' | 'unlock'): Promise<string | null> {
  const { data } = await admin.from('webauthn_challenges').select('*').eq('user_id', uid).maybeSingle();
  await admin.from('webauthn_challenges').delete().eq('user_id', uid);
  const row = data as { challenge: string; purpose: string; expires_at: string } | null;
  if (!row || row.purpose !== purpose || new Date(row.expires_at).getTime() < Date.now()) return null;
  return row.challenge;
}

export async function listPasskeys(admin: SupabaseClient, uid: string): Promise<PasskeyRow[]> {
  const { data } = await admin.from('user_passkeys').select('*').eq('user_id', uid).order('created_at', { ascending: true });
  return (data ?? []) as PasskeyRow[];
}

export async function registrationOptions(admin: SupabaseClient, uid: string, email: string, rpID: string) {
  const existing = await listPasskeys(admin, uid);
  const options = await generateRegistrationOptions({
    rpName: 'StackTrack',
    rpID,
    userName: email || uid,
    userID: new TextEncoder().encode(uid),
    attestationType: 'none',
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
  });
  await saveChallenge(admin, uid, options.challenge, 'register');
  return options;
}

export async function verifyRegistration(
  admin: SupabaseClient,
  uid: string,
  rp: { rpID: string; origin: string },
  response: RegistrationResponseJSON,
  deviceName: string
): Promise<{ ok: boolean; name?: string; error?: string }> {
  const expectedChallenge = await takeChallenge(admin, uid, 'register');
  if (!expectedChallenge) return { ok: false, error: 'This request expired. Try again.' };
  let result;
  try {
    result = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Verification failed.' };
  }
  if (!result.verified) return { ok: false, error: 'Verification failed.' };

  const { credential } = result.registrationInfo;
  const name = (deviceName || 'Passkey').trim().slice(0, 60) || 'Passkey';
  const { error } = await admin.from('user_passkeys').insert({
    id: credential.id,
    user_id: uid,
    public_key: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: credential.transports ?? [],
    device_name: name,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, name };
}

export async function unlockOptions(admin: SupabaseClient, uid: string, rpID: string) {
  const passkeys = await listPasskeys(admin, uid);
  if (!passkeys.length) return null;
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: passkeys.map((p) => ({ id: p.id, transports: p.transports })),
    userVerification: 'required',
  });
  await saveChallenge(admin, uid, options.challenge, 'unlock');
  return options;
}

export async function verifyUnlock(
  admin: SupabaseClient,
  uid: string,
  rp: { rpID: string; origin: string },
  response: AuthenticationResponseJSON
): Promise<{ ok: boolean; name?: string; error?: string }> {
  const expectedChallenge = await takeChallenge(admin, uid, 'unlock');
  if (!expectedChallenge) return { ok: false, error: 'This request expired. Try again.' };
  const passkey = (await listPasskeys(admin, uid)).find((p) => p.id === response?.id);
  if (!passkey) return { ok: false, error: 'This passkey is not registered for your account.' };

  let result;
  try {
    result = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
      credential: {
        id: passkey.id,
        publicKey: new Uint8Array(Buffer.from(passkey.public_key, 'base64url')),
        counter: Number(passkey.counter),
        transports: passkey.transports,
      },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Verification failed.' };
  }
  if (!result.verified) return { ok: false, error: 'Verification failed.' };

  await admin
    .from('user_passkeys')
    .update({ counter: result.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
    .eq('id', passkey.id)
    .eq('user_id', uid);
  return { ok: true, name: passkey.device_name };
}
