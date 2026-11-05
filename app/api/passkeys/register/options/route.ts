import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth-server';
import { registrationOptions, relyingParty } from '@/lib/passkeys-server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if ('response' in auth) return auth.response;
    const rp = relyingParty(request);
    if (!rp) return NextResponse.json({ error: 'Open the app from its own address to add a passkey.' }, { status: 400 });
    return NextResponse.json(await registrationOptions(auth.admin, auth.uid, auth.email, rp.rpID));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
