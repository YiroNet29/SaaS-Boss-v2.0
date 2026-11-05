import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth-server';
import { recentFailedUnlocks, recordSecurityEvent, type SecurityAction } from '@/lib/security-server';
import { sendSecurityAlert } from '@/lib/security-alerts';

export const dynamic = 'force-dynamic';

const CLIENT_ACTIONS: SecurityAction[] = [
  'sign_in',
  'unlock',
  'unlock_failed',
  'export',
  'mfa_enabled',
  'mfa_disabled',
  'mfa_device_added',
  'mfa_device_removed',
];
const MAX_FAILURES = 5;

/** Security events reported by the app (sign-ins, unlocks, exports, 2FA changes) + Telegram alerts. */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if ('response' in auth) return auth.response;
    const body = await request.json().catch(() => ({}));
    const action = body.action as SecurityAction;
    if (!CLIENT_ACTIONS.includes(action)) return NextResponse.json({ error: 'Unknown event.' }, { status: 400 });
    const details = String(body.details ?? '').slice(0, 200);

    const ws = await recordSecurityEvent(auth.admin, auth.uid, action, details);

    if (action === 'sign_in') await sendSecurityAlert(auth.admin, ws, `🔐 New sign-in to StackTrack: ${details}`);
    if (action === 'mfa_disabled') await sendSecurityAlert(auth.admin, ws, '⚠️ Two-factor login was turned OFF for StackTrack.');
    if (action === 'mfa_enabled') await sendSecurityAlert(auth.admin, ws, '✅ Two-factor login was turned on for StackTrack.');

    if (action === 'unlock_failed') {
      const failures = await recentFailedUnlocks(auth.admin, auth.uid);
      const signOut = failures >= MAX_FAILURES;
      if (signOut) await sendSecurityAlert(auth.admin, ws, `🚫 ${failures} failed unlock attempts on StackTrack. That session was signed out.`);
      return NextResponse.json({ ok: true, signOut, attemptsLeft: Math.max(0, MAX_FAILURES - failures) });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
