import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth-server';
import { relyingParty, verifyRegistration } from '@/lib/passkeys-server';
import { recordSecurityEvent } from '@/lib/security-server';
import { sendSecurityAlert } from '@/lib/security-alerts';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if ('response' in auth) return auth.response;
    const rp = relyingParty(request);
    if (!rp) return NextResponse.json({ error: 'Open the app from its own address to add a passkey.' }, { status: 400 });
    const body = await request.json().catch(() => ({}));
    const result = await verifyRegistration(auth.admin, auth.uid, rp, body.response, String(body.deviceName ?? ''));
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    const ws = await recordSecurityEvent(auth.admin, auth.uid, 'passkey_added', `Passkey added: ${result.name}`);
    await sendSecurityAlert(auth.admin, ws, `🔑 A new passkey was added to StackTrack: ${result.name}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
