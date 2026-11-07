import 'server-only';
import tls from 'node:tls';
import dns from 'node:dns/promises';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fromRow, toRow } from './db';
import { deliverLines, type SettingsRow } from './reminders-server';
import {
  CHECK_EVERY_HOURS,
  applyExpiryCheck,
  describeTlsProblem,
  isPublicAddress,
  normalizeDomain,
  normalizeHost,
  parseRdapDomain,
  rdapBaseFor,
  splitHostPort,
  tldOf,
  type CheckNotice,
  type RdapBootstrap,
} from '../utils/expiryChecks';
import type { ExpiryCheck, ImportantDate, Workspace } from '../types';

/**
 * Automatic expiry checks: a domain's registry record (RDAP) and a site's TLS certificate.
 * Run daily per date from the reminder job, or on demand from the app ("Check now" / "Look up now").
 */

const bootstrapUrl = () => process.env.RDAP_BOOTSTRAP_URL || 'https://data.iana.org/rdap/dns.json';
// Kept for a day and shared by checks running at the same time (one download, not one per check).
let bootstrapCache: { at: number; url: string; data: Promise<RdapBootstrap> } | null = null;

function loadBootstrap(): Promise<RdapBootstrap> {
  const url = bootstrapUrl();
  if (bootstrapCache && bootstrapCache.url === url && Date.now() - bootstrapCache.at < 24 * 3_600_000) return bootstrapCache.data;
  const data = (async () => {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`the registry directory didn't answer (HTTP ${res.status})`);
    return (await res.json()) as RdapBootstrap;
  })();
  bootstrapCache = { at: Date.now(), url, data };
  data.catch(() => (bootstrapCache = null)); // a failed download is retried next time
  return data;
}

const errorMessage = (err: unknown) => {
  const e = err as { name?: string; code?: string; message?: string; cause?: { code?: string } };
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return 'it did not answer in time.';
  const code = e?.code ?? e?.cause?.code;
  if (code === 'ENOTFOUND' || code === 'ENODATA') return "the name doesn't resolve (no DNS record).";
  if (code === 'ECONNREFUSED') return 'nothing answered on that port.';
  if (code === 'ECONNRESET') return 'the connection was cut off.';
  return e?.message ?? String(err);
};

/** Reads a domain's expiry date from its registry. Domains without a public lookup come back "manual". */
export async function checkDomain(input: string, now = new Date()): Promise<ExpiryCheck> {
  const checkedAt = now.toISOString();
  const domain = normalizeDomain(input);
  if (!domain) return { kind: 'domain', status: 'error', message: `"${input}" isn't a domain name.`, checkedAt };
  try {
    const base = rdapBaseFor(domain, await loadBootstrap());
    if (!base) {
      return { kind: 'domain', status: 'manual', message: `.${tldOf(domain)} has no public expiry lookup; keep the date up to date by hand`, checkedAt };
    }
    const res = await fetch(`${base}domain/${encodeURIComponent(domain)}`, {
      headers: { accept: 'application/rdap+json, application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) return { kind: 'domain', status: 'error', message: `the registry has no record of ${domain}.`, checkedAt };
    if (!res.ok) return { kind: 'domain', status: 'error', message: `the registry lookup failed (HTTP ${res.status}).`, checkedAt };
    const { expiresOn, registrar } = parseRdapDomain(await res.json());
    if (!expiresOn) {
      return { kind: 'domain', status: 'manual', by: registrar, message: "the registry doesn't publish the expiry date; keep it up to date by hand", checkedAt };
    }
    return { kind: 'domain', status: 'ok', expiresOn, by: registrar, checkedAt };
  } catch (err) {
    // A network failure here is about reaching the registry, not about your domain.
    const e = err as { name?: string; code?: string; message?: string; cause?: { code?: string } };
    const network = ['TimeoutError', 'AbortError'].includes(e?.name ?? '') || /^E[A-Z_]+$/.test(e?.code ?? e?.cause?.code ?? '') || e?.message === 'fetch failed';
    const message = network ? "the registry lookup couldn't be reached; it is tried again on the next check." : errorMessage(err);
    return { kind: 'domain', status: 'error', message, checkedAt };
  }
}

/**
 * Connects to a site and reads its certificate. Never connects to private or local addresses
 * (allowPrivate exists for tests only).
 */
export async function checkCertificate(
  input: string,
  opts: {
    now?: Date;
    allowPrivate?: boolean;
    timeoutMs?: number;
    /** DNS lookup (tests replace it). */
    lookup?: (host: string) => Promise<{ address: string }[]>;
  } = {}
): Promise<ExpiryCheck> {
  const checkedAt = (opts.now ?? new Date()).toISOString();
  const target = normalizeHost(input);
  if (!target) return { kind: 'ssl', status: 'error', message: `"${input}" isn't a website address.`, checkedAt };
  const { host, port } = splitHostPort(target);

  let address: string;
  try {
    const found = await (opts.lookup ?? ((h: string) => dns.lookup(h, { all: true })))(host);
    const usable = found.find((a) => opts.allowPrivate || isPublicAddress(a.address));
    if (!usable) return { kind: 'ssl', status: 'error', message: `${host} points to a private network address.`, checkedAt };
    address = usable.address;
  } catch (err) {
    return { kind: 'ssl', status: 'error', message: errorMessage(err), checkedAt };
  }

  return new Promise<ExpiryCheck>((resolve) => {
    let settled = false;
    const finish = (r: ExpiryCheck) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(r);
    };
    // Connect to the address we checked (not the name again), and present the name for SNI.
    const socket = tls.connect({ host: address, port, servername: host, rejectUnauthorized: false }, () => {
      const cert = socket.getPeerCertificate();
      if (!cert?.valid_to) return finish({ kind: 'ssl', status: 'error', message: 'the site sent no certificate.', checkedAt });
      const expires = new Date(cert.valid_to);
      const issuer = cert.issuer as Record<string, string | string[]> | undefined;
      const by = [issuer?.O, issuer?.CN].flat().find((x) => typeof x === 'string' && x) as string | undefined;
      finish({
        kind: 'ssl',
        status: 'ok',
        expiresOn: expires.toISOString().slice(0, 10),
        by: by?.slice(0, 80),
        problem: socket.authorized ? undefined : describeTlsProblem(String(socket.authorizationError ?? 'not trusted')),
        checkedAt,
      });
    });
    socket.setTimeout(opts.timeoutMs ?? 10_000, () => finish({ kind: 'ssl', status: 'error', message: 'the site did not answer in time.', checkedAt }));
    socket.on('error', (err) => finish({ kind: 'ssl', status: 'error', message: errorMessage(err), checkedAt }));
  });
}

export type Checkers = {
  domain: (target: string, now: Date) => Promise<ExpiryCheck>;
  ssl: (target: string, now: Date) => Promise<ExpiryCheck>;
};
const realCheckers: Checkers = {
  domain: (t, now) => checkDomain(t, now),
  ssl: (t, now) => checkCertificate(t, { now }),
};

/** Runs the right check for a date. */
export function checkDate(date: ImportantDate, now = new Date(), checkers: Checkers = realCheckers): Promise<ExpiryCheck> {
  const kind = date.type === 'SSL expiry' ? 'ssl' : 'domain';
  if (!date.checkTarget) {
    return Promise.resolve({ kind, status: 'error', message: 'no domain or website is set for this date.', checkedAt: now.toISOString() });
  }
  return checkers[kind](date.checkTarget, now);
}

/** Saves a check result on its date (and an audit entry when the date moved). Returns the updated date. */
export async function saveCheck(
  admin: SupabaseClient,
  date: ImportantDate,
  check: ExpiryCheck,
  changedBy: string
): Promise<{ date: ImportantDate; notices: CheckNotice[] }> {
  const { patch, notices } = applyExpiryCheck(date, check);
  const row = toRow(patch as Record<string, unknown>, 'update');
  const { error } = await admin.from('important_dates').update(row).eq('id', date.id);
  if (error) throw new Error(error.message);
  if (patch.dueDate && patch.dueDate !== date.dueDate) {
    await admin.from('audit_logs').insert({
      id: 'audit-' + crypto.randomUUID().slice(0, 12),
      workspace_id: date.workspaceId,
      item_type: 'importantDate',
      item_id: date.id,
      action: 'update',
      changed_by: changedBy,
      details: `Expiry check moved "${date.title}" from ${date.dueDate} to ${patch.dueDate}`,
    });
  }
  return { date: { ...date, ...patch }, notices };
}

/**
 * The daily part of the reminder job: checks the dates not checked in the last day (a few per run,
 * oldest first) and sends what changed to Telegram (email as backup).
 */
export async function runExpiryChecks(
  admin: SupabaseClient,
  opts: {
    now?: Date;
    limit?: number;
    appUrl?: string;
    checkers?: Checkers;
    /** No new check starts after this many ms, so slow sites can't stall the job. */
    budgetMs?: number;
  } = {}
): Promise<{ checked: number; moved: number; notices: number; errors: string[]; skipped?: string }> {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - CHECK_EVERY_HOURS * 3_600_000).toISOString();
  const { data, error } = await admin
    .from('important_dates')
    .select('*')
    .eq('auto_check', true)
    .in('status', ['open', 'snoozed'])
    .in('type', ['domain expiry', 'SSL expiry'])
    .or(`last_checked_at.is.null,last_checked_at.lt."${cutoff}"`)
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(opts.limit ?? 25);
  // Before 0004_expiry_checks.sql is run the columns don't exist: skip quietly.
  if (error) return { checked: 0, moved: 0, notices: 0, errors: [], skipped: error.message };

  const byWorkspace = new Map<string, string[]>();
  const errors: string[] = [];
  let moved = 0;
  let checked = 0;
  const rows = data ?? [];
  const deadline = Date.now() + (opts.budgetMs ?? 20_000);
  let next = 0;
  // A few at a time; anything not reached is checked on the next hourly run.
  const worker = async () => {
    while (next < rows.length && Date.now() < deadline) {
      const date = fromRow<ImportantDate>(rows[next++] as Record<string, unknown>);
      await checkOne(date);
    }
  };
  const checkOne = async (date: ImportantDate) => {
    try {
      const check = await checkDate(date, now, opts.checkers);
      const saved = await saveCheck(admin, date, check, 'expiry-check');
      checked++;
      if (saved.date.dueDate !== date.dueDate) moved++;
      if (saved.notices.length) {
        const list = byWorkspace.get(date.workspaceId) ?? [];
        list.push(...saved.notices.map((n) => n.text));
        byWorkspace.set(date.workspaceId, list);
      }
    } catch (err) {
      errors.push(`${date.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, rows.length) }, worker));

  let sent = 0;
  for (const [workspaceId, lines] of byWorkspace) {
    const [{ data: settingsRow }, { data: wsRow }] = await Promise.all([
      admin.from('notification_settings').select('*').eq('workspace_id', workspaceId).maybeSingle(),
      admin.from('workspaces').select('*').eq('id', workspaceId).maybeSingle(),
    ]);
    if (!settingsRow) continue;
    const ws = wsRow ? fromRow<Workspace>(wsRow as Record<string, unknown>) : null;
    const result = await deliverLines({
      settings: fromRow<SettingsRow>(settingsRow as Record<string, unknown>),
      icon: '🔎',
      heading: `Expiry checks · ${ws?.name ?? 'StackTrack'}`,
      lines,
      subject: 'StackTrack: domain and SSL expiry checks',
      appUrl: opts.appUrl,
      linkLabel: 'Open Due Dates',
    });
    if (result.attempts.some((a) => a.ok)) sent += lines.length;
    else errors.push(`${workspaceId}: could not deliver expiry notices`);
  }
  return { checked, moved, notices: sent, errors };
}
