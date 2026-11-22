#!/usr/bin/env node
/**
 * Checks the LIVE site from the outside, read-only, with no secrets:
 *   1. the site answers and sends its security headers;
 *   2. which database migrations have been run, by asking the live Supabase about the tables and columns
 *      each one adds. It uses the public key the site itself ships to every browser, so it can't read any
 *      data (row-level security returns nothing to it); it only learns whether a table exists.
 *
 *   node scripts/live-check.mjs [https://saas-boss-v20.vercel.app]
 *
 * Exits 1 when the site is down or a migration is missing, so the GitHub job goes red.
 */
const SITE = (process.argv[2] || process.env.LIVE_URL || 'https://saas-boss-v20.vercel.app').replace(/\/+$/, '');

// What each migration adds that can be seen from outside. 0005 only changes which tables send live
// updates, which isn't visible this way.
const MIGRATIONS = [
  { file: '0001_init.sql', what: 'the base tables', probes: [['workspaces', 'id'], ['service_links', 'id'], ['important_dates', 'id']] },
  { file: '0002_security.sql', what: 'passkeys for the app lock', probes: [['user_passkeys', 'id'], ['webauthn_challenges', 'user_id']] },
  { file: '0003_payments.sql', what: 'cards, payments and receipts', probes: [['payment_sources', 'id'], ['payments', 'id'], ['source_transactions', 'id'], ['receipts', 'id']] },
  { file: '0004_expiry_checks.sql', what: 'automatic domain and SSL checks', probes: [['important_dates', 'check_target'], ['important_dates', 'auto_check']] },
];

const EXPECTED_HEADERS = {
  'content-security-policy': (v) => /nonce-/.test(v) && /frame-ancestors 'none'|default-src/.test(v),
  'strict-transport-security': (v) => /max-age=\d{7,}/.test(v),
  'x-content-type-options': (v) => v === 'nosniff',
  'x-frame-options': (v) => v.toUpperCase() === 'DENY',
  'referrer-policy': (v) => v === 'strict-origin-when-cross-origin',
  'permissions-policy': (v) => /microphone=\(\)/.test(v),
  'cross-origin-opener-policy': (v) => v === 'same-origin',
};

const problems = [];
const lines = [];
const say = (s = '') => { lines.push(s); console.log(s); };

async function get(url, init = {}) {
  const res = await fetch(url, { redirect: 'follow', ...init, signal: AbortSignal.timeout(20000) });
  return { status: res.status, headers: res.headers, text: await res.text() };
}

/**
 * Finds the Supabase address and the public key in the site's JavaScript. The app itself is loaded on demand,
 * so this follows references from code file to code file (static/chunks/…js), up to a limit.
 */
async function findSupabase(html, csp) {
  // Any static/…js path, written with or without /_next/ in front (file names can contain [ ] % ( ) …).
  const refs = (text) =>
    [...text.matchAll(/(?:\/_next\/)?static\/[^"'\s<>\\]+?\.js\b/g)].map((m) => '/_next/' + m[0].replace(/^\/_next\//, ''));
  const queue = [...new Set(refs(html))];
  const first = queue.slice(0, 6);
  const seen = new Set();
  // The security policy lists the database address (connect-src), so start from there.
  let url = csp?.match(/https:\/\/[a-z0-9]{20}\.supabase\.co/)?.[0] ?? null;
  let key = null;
  while (queue.length && seen.size < 400 && !(url && key)) {
    const c = queue.shift();
    if (seen.has(c)) continue;
    seen.add(c);
    const js = (await get(SITE + c).catch(() => ({ text: '' }))).text;
    url ??= js.match(/https:\/\/[a-z0-9]{20}\.supabase\.co/)?.[0] ?? null;
    if (!key) {
      for (const m of js.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g)) {
        try {
          const payload = JSON.parse(Buffer.from(m[0].split('.')[1], 'base64url').toString());
          if (payload.role === 'anon') { key = m[0]; break; }
        } catch { /* not a token */ }
      }
      key ??= js.match(/sb_publishable_[A-Za-z0-9_-]{10,}/)?.[0] ?? null;
    }
    for (const r of refs(js)) if (!seen.has(r)) queue.push(r);
  }
  return { url, key, chunks: seen.size, first };
}

/** A short reason for a request that got no answer at all (DNS, refused, TLS, timeout…). */
const networkError = (e) => [e?.cause?.code, e?.cause?.message || e?.message].filter(Boolean).join(' ').slice(0, 120);

/** First contact with the database: can it be reached at all? */
async function reach(base, key) {
  try {
    const r = await get(`${base}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    return { ok: r.status < 500, detail: `HTTP ${r.status} ${r.text.replace(/\s+/g, ' ').slice(0, 120)}` };
  } catch (e) {
    return { ok: false, detail: `no answer: ${networkError(e)}` };
  }
}

/** 'yes' (exists), 'no' (missing) or 'unknown', from PostgREST's answer. */
async function exists(base, key, table, column) {
  const r = await get(`${base}/rest/v1/${table}?select=${column}&limit=0`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }).catch((e) => ({ status: 0, text: networkError(e) }));
  if (r.status === 200 || r.status === 206) return 'yes';
  let code = '';
  try { code = JSON.parse(r.text).code ?? ''; } catch { /* not JSON */ }
  if (['PGRST205', '42P01', '42703', 'PGRST204'].includes(code) || (r.status === 404 && /relation|table|schema cache/i.test(r.text))) return 'no';
  if (['42501'].includes(code)) return 'yes'; // exists, but this key may not read it
  return r.status === 0 ? `unknown (no answer: ${r.text})` : `unknown (HTTP ${r.status} ${code || r.text.slice(0, 80)})`;
}

say(`Live check of ${SITE} on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`);
say();

let html = '';
let csp = '';
try {
  const home = await get(SITE + '/');
  html = home.text;
  csp = home.headers.get('content-security-policy') ?? '';
  if (home.status !== 200) problems.push(`The home page answered HTTP ${home.status}.`);
  say(`Site: HTTP ${home.status}`);
  say();
  say('Security headers:');
  for (const [name, ok] of Object.entries(EXPECTED_HEADERS)) {
    const v = home.headers.get(name);
    const good = v != null && ok(v);
    say(`  ${good ? 'ok     ' : 'PROBLEM'} ${name}${v == null ? ': missing' : good ? '' : `: ${v.slice(0, 120)}`}`);
    if (!good) problems.push(`Security header ${name} is ${v == null ? 'missing' : 'not as expected'}.`);
  }
} catch (e) {
  problems.push(`The site didn't answer: ${e.message}`);
  say(`Site: no answer (${e.message})`);
}

if (html) {
  say();
  // LIVE_SUPABASE_URL / LIVE_SUPABASE_KEY: only for trying this script against the local stack.
  const sb = process.env.LIVE_SUPABASE_URL
    ? { url: process.env.LIVE_SUPABASE_URL, key: process.env.LIVE_SUPABASE_KEY, chunks: 0 }
    : await findSupabase(html, csp);
  if (!sb.url || !sb.key) {
    say(`Database: couldn't find the ${sb.url ? 'public key' : 'Supabase address and public key'} in the site's code (${sb.chunks} files looked at).`);
    if (sb.first?.length) say(`  First code files on the home page: ${sb.first.join(', ')}`);
    else say(`  The home page lists no code files. Its first 300 characters: ${html.slice(0, 300).replace(/\s+/g, ' ')}`);
    problems.push("Couldn't find which database the site uses, so the migrations weren't checked.");
  } else {
    say(`Database: ${sb.url.replace(/^https:\/\/([a-z0-9]{4})[a-z0-9]+/, 'https://$1…')} (public key found in the site's code)`);
    const r = await reach(sb.url, sb.key);
    say(`  Reached: ${r.ok ? 'yes' : 'NO'} (${r.detail})`);
    if (!r.ok) {
      problems.push(
        /ENOTFOUND/.test(r.detail)
          ? "The live database's address doesn't exist: the Supabase project is paused or deleted. Nobody can sign in until it's back. Open the Supabase dashboard: if it's paused, Restore it (a free project pauses after a week without use)."
          : `The live database can't be reached (${r.detail}). Nobody can sign in until it's back: check the project in the Supabase dashboard.`
      );
      say("  Migrations: can't be checked until the database is reachable.");
    }
  }
  if (sb.url && sb.key && problems.every((p) => !/database's address|database can't be reached/.test(p))) {
    say('Migrations (run in Supabase → SQL Editor):');
    for (const m of MIGRATIONS) {
      const results = [];
      for (const [t, c] of m.probes) results.push([`${t}.${c}`, await exists(sb.url, sb.key, t, c)]);
      const missing = results.filter(([, r]) => r === 'no');
      const unknown = results.filter(([, r]) => r.startsWith('unknown'));
      const state = missing.length ? 'NOT RUN' : unknown.length ? 'unclear' : 'run    ';
      say(`  ${state} ${m.file} (${m.what})${missing.length ? `: missing ${missing.map(([n]) => n).join(', ')}` : ''}${unknown.length ? `: ${unknown.map(([n, r]) => `${n} ${r}`).join(', ')}` : ''}`);
      if (missing.length) problems.push(`Migration ${m.file} hasn't been run on the live database.`);
      else if (unknown.length) problems.push(`Couldn't tell whether ${m.file} has been run (the database gave an unexpected answer).`);
    }
    say('  ?       0005_realtime.sql (live updates): can\'t be seen from outside; run it anyway, it is safe to run twice.');
  }
}

say();
if (problems.length) {
  say(`${problems.length} problem(s):`);
  for (const p of problems) say(`  - ${p}`);
} else {
  say('No problems found.');
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const fs = await import('node:fs');
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + lines.join('\n') + '\n```\n');
}
process.exit(problems.length ? 1 : 0);
