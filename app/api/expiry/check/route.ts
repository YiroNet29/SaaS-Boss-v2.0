import { NextResponse, type NextRequest } from 'next/server';
import { fromRow } from '@/lib/db';
import { requireUser } from '@/lib/auth-server';
import { checkCertificate, checkDate, checkDomain, saveCheck } from '@/lib/expiry-checks-server';
import type { ImportantDate, Workspace } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Expiry checks from the app:
 *  - { dateId }            "Check now" on a saved date: checks it and saves the result.
 *  - { type, target }      "Look up now" in the form: checks without saving anything.
 * Signed-in members only.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;
  const { uid, admin } = auth;
  const body = await request.json().catch(() => ({}));

  if (typeof body.dateId === 'string' && body.dateId) {
    const { data: row } = await admin.from('important_dates').select('*').eq('id', body.dateId).maybeSingle();
    const date = row ? fromRow<ImportantDate>(row) : null;
    const { data: wsRow } = date ? await admin.from('workspaces').select('*').eq('id', date.workspaceId).maybeSingle() : { data: null };
    const ws = wsRow ? fromRow<Workspace>(wsRow) : null;
    if (!date || !ws || (ws.ownerId !== uid && !(ws.memberUids ?? []).includes(uid))) {
      return NextResponse.json({ error: 'Date not found.' }, { status: 404 });
    }
    if (date.type !== 'domain expiry' && date.type !== 'SSL expiry') {
      return NextResponse.json({ error: 'Only domain and SSL dates can be checked.' }, { status: 400 });
    }
    try {
      const check = await checkDate(date);
      const saved = await saveCheck(admin, date, check, 'check-now');
      return NextResponse.json({ date: saved.date, check, notices: saved.notices });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  const target = typeof body.target === 'string' ? body.target.slice(0, 300) : '';
  if (!target) return NextResponse.json({ error: 'Enter a domain or website.' }, { status: 400 });
  if (body.type === 'domain expiry') return NextResponse.json({ check: await checkDomain(target) });
  if (body.type === 'SSL expiry') return NextResponse.json({ check: await checkCertificate(target) });
  return NextResponse.json({ error: 'Only domain and SSL dates can be checked.' }, { status: 400 });
}
