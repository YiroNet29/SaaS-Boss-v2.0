import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth-server';
import { relyingParty, verifyUnlock } from '@/lib/passkeys-server';
import { recentFailedUnlocks, recordSecurityEvent } from '@/lib/security-server';

export const dynamic = 'force-dynamic';

const MAX_FAILURES = 5;

/** Checks a passkey signature. 5 failures within 15 minutes → the app signs you out. */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if ('response' in auth) return auth.response;
    const rp = relyingParty(request);
    if (!rp) return NextResponse.json({ error: 'Open the app from its own address to use a passkey.' }, { status: 400 });

    if ((await recentFailedUnlocks(auth.admin, auth.uid)) >= MAX_FAILURES) {
      return NextResponse.json({ error: 'Too many failed attempts.', signOut: true }, { status: 429 });
    }
    const body = await request.json().catch(() => ({}));
    const result = await verifyUnlock(auth.admin, auth.uid, rp, body.response);
    if (!result.ok) {
      await recordSecurityEvent(auth.admin, auth.uid, 'unlock_failed', `Passkey unlock failed: ${result.error}`);
      const failures = await recentFailedUnlocks(auth.admin, auth.uid);
      return NextResponse.json(
        { error: result.error, signOut: failures >= MAX_FAILURES, attemptsLeft: Math.max(0, MAX_FAILURES - failures) },
        { status: 401 }
      );
    }
    await recordSecurityEvent(auth.admin, auth.uid, 'unlock', `Unlocked with passkey: ${result.name}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
