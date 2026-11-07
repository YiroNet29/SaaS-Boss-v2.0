import { NextResponse, type NextRequest } from 'next/server';
import { fromRow } from '@/lib/db';
import { requireUser } from '@/lib/auth-server';
import { downloadReceiptFile, isOwnReceiptPath, loadReceipt, markReceiptFailed, processReceipt } from '@/lib/receipts-server';
import { isReceiptReaderConfigured } from '@/lib/receipt-reader';
import { localDateAndHour } from '@/utils/reminderDigest';
import type { Workspace } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Reads a receipt the app just added (file already uploaded to private storage, or pasted text)
 * and suggests the service and card it belongs to. The caller must belong to the workspace.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;
  const { uid, admin } = auth;

  const body = await request.json().catch(() => ({}));
  const receiptId = typeof body.receiptId === 'string' ? body.receiptId : '';
  if (!receiptId) return NextResponse.json({ error: 'receiptId is required.' }, { status: 400 });

  const receipt = await loadReceipt(admin, receiptId);
  const { data: wsRow } = receipt
    ? await admin.from('workspaces').select('*').eq('id', receipt.workspaceId).maybeSingle()
    : { data: null };
  const ws = wsRow ? fromRow<Workspace>(wsRow) : null;
  if (!receipt || !ws || (ws.ownerId !== uid && !(ws.memberUids ?? []).includes(uid))) {
    return NextResponse.json({ error: 'Receipt not found.' }, { status: 404 });
  }
  if (receipt.status === 'confirmed' || receipt.status === 'ignored') {
    return NextResponse.json({ receipt });
  }
  // Only the file the app itself stored for this receipt: <workspace id>/<receipt id>.<ext>.
  if (receipt.storagePath && !isOwnReceiptPath(receipt.storagePath, receipt.workspaceId, receipt.id)) {
    return NextResponse.json({ error: 'Receipt not found.' }, { status: 404 });
  }

  try {
    const bytes = receipt.storagePath ? await downloadReceiptFile(admin, receipt.storagePath) : undefined;
    const today = localDateAndHour(new Date(), ws.timezone || 'UTC').date;
    const done = await processReceipt(admin, receipt, { bytes }, today);
    return NextResponse.json({ receipt: done.receipt, aiReader: isReceiptReaderConfigured() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markReceiptFailed(admin, receiptId, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Whether receipts are read automatically (ANTHROPIC_API_KEY is set). */
export function GET() {
  return NextResponse.json({ aiReader: isReceiptReaderConfigured() });
}
