/**
 * Automatic expiry checks (Phase 5): cleaning up domain / host input, finding a domain's registry
 * lookup (RDAP), reading its answer, and deciding what a check result changes. Pure, unit-tested.
 */
import type { ExpiryCheck, ImportantDate } from '../types';

/** Domains without a public lookup (e.g. .et): reminders start earlier. */
export const EARLY_DOMAIN_LEAD_DAYS = [60, 30, 14, 7, 3, 1];
/** Certificates renew themselves ~30 days before expiry, so a reminder at 14 days means renewal is stuck. */
export const SSL_LEAD_DAYS = [14, 7, 3, 1];
/** A date is checked again after this many hours (the reminder job runs hourly). */
export const CHECK_EVERY_HOURS = 20;

export const isCheckable = (d: Pick<ImportantDate, 'type'>) => d.type === 'domain expiry' || d.type === 'SSL expiry';

const TWO_LEVEL_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk',
  'com.et', 'org.et', 'net.et', 'edu.et', 'gov.et', 'biz.et', 'info.et', 'name.et',
  'com.au', 'net.au', 'org.au', 'co.za', 'co.ke', 'or.ke', 'com.ng', 'co.nz', 'com.br', 'co.jp', 'co.in', 'com.tr',
]);

function validHostname(raw: string): string | null {
  const h = raw.toLowerCase().replace(/\.$/, '');
  if (h.length > 253 || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h)) return null;
  if (h.split('.').some((l) => !l || l.length > 63 || l.startsWith('-') || l.endsWith('-'))) return null;
  const tld = h.split('.').pop()!;
  if (!/^([a-z]{2,63}|xn--[a-z0-9-]+)$/.test(tld)) return null; // also rules out IP addresses
  return h;
}

function parseUrlish(input: string): URL | null {
  const raw = input.trim();
  if (!raw || /\s/.test(raw)) return null;
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
}

/** "https://app.SaaSBoss.io/x" → "app.saasboss.io". Keeps a port other than 443: "x.io:8443". */
export function normalizeHost(input: string): string | null {
  const url = parseUrlish(input);
  const host = url && validHostname(url.hostname); // URL turns international names into xn-- form
  if (!url || !host) return null;
  return url.port && url.port !== '443' ? `${host}:${url.port}` : host;
}

/** "https://www.SaaSBoss.io/pricing" → "saasboss.io"; "shop.example.com.et" → "example.com.et". */
export function normalizeDomain(input: string): string | null {
  const host = normalizeHost(input)?.split(':')[0];
  if (!host) return null;
  const labels = host.split('.');
  const keep = TWO_LEVEL_SUFFIXES.has(labels.slice(-2).join('.')) ? 3 : 2;
  return labels.length >= keep ? labels.slice(-keep).join('.') : null;
}

export function splitHostPort(target: string): { host: string; port: number } {
  const [host, port] = target.split(':');
  return { host, port: port ? Number(port) : 443 };
}

export const tldOf = (domain: string) => domain.split('.').pop() ?? '';

// ---------------------------------------------------------------------------
// RDAP
// ---------------------------------------------------------------------------

/** IANA's RDAP directory (https://data.iana.org/rdap/dns.json): [[tlds], [server urls]] pairs. */
export interface RdapBootstrap {
  services?: [string[], string[]][];
}

/** The registry's RDAP server for a domain, or null when its TLD has none (e.g. .et). */
export function rdapBaseFor(domain: string, bootstrap: RdapBootstrap): string | null {
  let best: { len: number; url: string } | null = null;
  for (const [suffixes, urls] of bootstrap.services ?? []) {
    for (const raw of suffixes ?? []) {
      const s = String(raw).toLowerCase();
      if (domain !== s && !domain.endsWith('.' + s)) continue;
      const url = urls?.find((u) => u.startsWith('https://')) ?? urls?.[0];
      if (url && (!best || s.length > best.len)) best = { len: s.length, url };
    }
  }
  return best ? best.url.replace(/\/?$/, '/') : null;
}

const isoDay = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
};

/** Expiry date and registrar from an RDAP domain answer. */
export function parseRdapDomain(json: unknown): { expiresOn?: string; registrar?: string } {
  const j = (json && typeof json === 'object' ? json : {}) as Record<string, any>;
  const events: any[] = Array.isArray(j.events) ? j.events : [];
  const expiry = events.find((e) => /^(registration )?expiration$/i.test(String(e?.eventAction ?? '')));
  let registrar: string | undefined;
  for (const ent of Array.isArray(j.entities) ? j.entities : []) {
    if (!Array.isArray(ent?.roles) || !ent.roles.includes('registrar')) continue;
    const fn = Array.isArray(ent.vcardArray?.[1]) ? ent.vcardArray[1].find((x: any) => Array.isArray(x) && x[0] === 'fn') : null;
    registrar = String(fn?.[3] || ent.handle || '').slice(0, 80) || undefined;
  }
  return { expiresOn: isoDay(expiry?.eventDate), registrar };
}

// ---------------------------------------------------------------------------
// SSL
// ---------------------------------------------------------------------------

/** Node's TLS verification codes in plain words. */
export function describeTlsProblem(code: string): string {
  const map: Record<string, string> = {
    CERT_HAS_EXPIRED: 'it has expired',
    ERR_TLS_CERT_ALTNAME_INVALID: "it's issued for a different name",
    DEPTH_ZERO_SELF_SIGNED_CERT: "it's self-signed",
    SELF_SIGNED_CERT_IN_CHAIN: "it's self-signed",
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: "its issuer isn't trusted (missing intermediate certificate?)",
    UNABLE_TO_GET_ISSUER_CERT_LOCALLY: "its issuer isn't trusted (missing intermediate certificate?)",
    CERT_NOT_YET_VALID: "it isn't valid yet",
    CERT_REVOKED: 'it has been revoked',
  };
  return map[code] ?? code;
}

/** True for addresses on the public internet (the checker never connects to private networks). */
export function isPublicAddress(ip: string): boolean {
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip.replace(/^::ffff:/i, ''));
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
    return true;
  }
  const v6 = ip.toLowerCase();
  if (v6 === '::' || v6 === '::1') return false;
  if (/^f[cd]/.test(v6) || /^fe[89ab]/.test(v6)) return false; // unique-local, link-local
  return v6.includes(':');
}

// ---------------------------------------------------------------------------
// What a result changes
// ---------------------------------------------------------------------------

export interface CheckNotice {
  tone: 'good' | 'warn' | 'bad';
  text: string;
}

/**
 * Applies a check result to a date: the fields to save, and what to tell you (only when something
 * changed or newly went wrong, so a broken lookup doesn't message you every day).
 */
export function applyExpiryCheck(date: ImportantDate, check: ExpiryCheck): { patch: Partial<ImportantDate>; notices: CheckNotice[] } {
  const name = date.checkTarget || date.title;
  const prev = date.lastCheck;
  const patch: Partial<ImportantDate> = { lastCheck: check, lastCheckedAt: check.checkedAt };
  const notices: CheckNotice[] = [];

  if (check.status === 'error') {
    if (prev?.status !== 'error') notices.push({ tone: 'bad', text: `⚠️ Couldn't check ${name}: ${check.message ?? 'unknown error'}` });
    return { patch, notices };
  }

  if (check.status === 'manual') {
    // First time we learn there's no public lookup: start reminders earlier.
    if (check.kind === 'domain' && prev?.status !== 'manual') {
      patch.leadDays = [...new Set([...(date.leadDays ?? []), ...EARLY_DOMAIN_LEAD_DAYS])].sort((a, b) => b - a);
    }
    return { patch, notices };
  }

  const icon = check.kind === 'domain' ? '🌐' : '🔒';
  if (check.expiresOn && check.expiresOn !== date.dueDate) {
    patch.dueDate = check.expiresOn;
    if (date.status === 'snoozed' || date.snoozedUntil) {
      patch.status = 'open';
      patch.snoozedUntil = undefined;
    }
    if (!prev) {
      notices.push({ tone: 'good', text: `${icon} ${name}: expiry found, ${check.expiresOn}. The date is updated.` });
    } else if (check.expiresOn > date.dueDate) {
      // Certificates renew themselves every few months: only domain renewals are worth a message.
      if (check.kind === 'domain') notices.push({ tone: 'good', text: `✅ ${name} was renewed: it now expires ${check.expiresOn} (was ${date.dueDate}).` });
    } else {
      notices.push({ tone: 'warn', text: `${icon} ${name} expires ${check.expiresOn}, earlier than the ${date.dueDate} you had. The date is corrected.` });
    }
  }
  if (check.kind === 'ssl' && check.problem && prev?.problem !== check.problem) {
    notices.push({ tone: 'bad', text: `🔒 ${name}: browsers won't trust this certificate (${check.problem}).` });
  }
  return { patch, notices };
}

/** "Checked 3 h ago · registry: 2027-11-12 (Namecheap)" style summary for the dates list. */
export function describeCheck(check: ExpiryCheck | undefined, now = new Date()): string {
  if (!check) return 'Not checked yet';
  const hours = Math.max(0, Math.round((now.getTime() - Date.parse(check.checkedAt)) / 3_600_000));
  const when = hours < 1 ? 'just now' : hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
  if (check.status === 'error') return `Check failed ${when}: ${check.message ?? 'unknown error'}`;
  if (check.status === 'manual') return `No automatic lookup (${check.message ?? 'set the date by hand'})`;
  const what = check.kind === 'domain' ? 'registry' : 'certificate';
  return `Checked ${when} · ${what}: ${check.expiresOn}${check.by ? ` (${check.by})` : ''}${check.problem ? ` · not trusted: ${check.problem}` : ''}`;
}
