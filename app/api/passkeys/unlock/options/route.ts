import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth-server';
import { relyingParty, unlockOptions } from '@/lib/passkeys-server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if ('response' in auth) return auth.response;
    const rp = relyingParty(request);
    if (!rp) return NextResponse.json({ error: 'Open the app from its own address to use a passkey.' }, { status: 400 });
    const options = await unlockOptions(auth.admin, auth.uid, rp.rpID);
    if (!options) return NextResponse.json({ error: 'No passkey is set up yet.' }, { status: 404 });
    return NextResponse.json(options);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
