import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth-server';
import { listPasskeys } from '@/lib/passkeys-server';
import { recordSecurityEvent } from '@/lib/security-server';

export const dynamic = 'force-dynamic';

/** Your passkeys (no key material is returned). */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if ('response' in auth) return auth.response;
    const passkeys = await listPasskeys(auth.admin, auth.uid);
    return NextResponse.json({
      passkeys: passkeys.map((p) => ({ id: p.id, name: p.device_name, createdAt: p.created_at, lastUsedAt: p.last_used_at })),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

/** Remove one of your passkeys: DELETE /api/passkeys?id=... */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if ('response' in auth) return auth.response;
    const id = request.nextUrl.searchParams.get('id') ?? '';
    const { data, error } = await auth.admin.from('user_passkeys').delete().eq('id', id).eq('user_id', auth.uid).select('device_name');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data?.length) return NextResponse.json({ error: 'Passkey not found.' }, { status: 404 });
    await recordSecurityEvent(auth.admin, auth.uid, 'passkey_removed', `Passkey removed: ${data[0].device_name}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
