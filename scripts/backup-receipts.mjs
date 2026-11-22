#!/usr/bin/env node
/**
 * Backs up the receipt files (Supabase Storage bucket "receipts"), encrypted like the database backup.
 * The database backup (scripts/backup-db.sh) has the receipt rows; this has the photos and PDFs.
 *
 *   node scripts/backup-receipts.mjs backup [out_dir]      → out_dir/stacktrack-receipts-YYYY-MM-DD.tar.gz.gpg
 *   node scripts/backup-receipts.mjs restore <file.gpg>    → uploads every file back (overwrites same names)
 *   node scripts/backup-receipts.mjs rehearse              → LOCAL stack only: backup, delete, restore, compare
 *                                                            (uses the local stack's keys by itself)
 *
 * Needs: SUPABASE_SERVICE_ROLE_KEY (the secret key), BACKUP_PASSPHRASE (16+ characters, the same one as
 * the database backup), and the project URL: SUPABASE_URL, or worked out from SUPABASE_DB_URL (the
 * Session pooler string, whose user is postgres.<project-ref>). Also gpg and tar.
 * The key goes only in request headers; it is never printed.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BUCKET = 'receipts';
const LOCAL_URL = 'http://127.0.0.1:55621';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function projectUrl() {
  if (process.env.SUPABASE_URL) return process.env.SUPABASE_URL.replace(/\/+$/, '');
  const db = process.env.SUPABASE_DB_URL || '';
  const ref = /^postgres(?:ql)?:\/\/postgres\.([a-z0-9]{10,40}):/i.exec(db)?.[1];
  if (!ref) fail('Set SUPABASE_URL, or SUPABASE_DB_URL as the Session pooler string (user postgres.<project-ref>).');
  return `https://${ref}.supabase.co`;
}

function settings() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const passphrase = process.env.BACKUP_PASSPHRASE;
  if (!key) fail('SUPABASE_SERVICE_ROLE_KEY is not set.');
  if (!passphrase || passphrase.length < 16) fail('BACKUP_PASSPHRASE must be set and at least 16 characters.');
  return { url: projectUrl(), key, passphrase };
}

const headers = (key, extra = {}) => ({ apikey: key, Authorization: `Bearer ${key}`, ...extra });

async function storage(s, method, route, body, extraHeaders = {}) {
  const res = await fetch(`${s.url}/storage/v1/${route}`, {
    method,
    headers: headers(s.key, body && !(body instanceof Uint8Array) ? { 'Content-Type': 'application/json', ...extraHeaders } : extraHeaders),
    body: body instanceof Uint8Array ? body : body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Storage ${method} ${route.split('/').slice(0, 2).join('/')}: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  return res;
}

/** Every file in the bucket, walking folders (a workspace id per folder). */
async function listAll(s, prefix = '') {
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await storage(s, 'POST', `object/list/${BUCKET}`, { prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
    const entries = await res.json();
    for (const e of entries) {
      const full = prefix ? `${prefix}${e.name}` : e.name;
      if (e.id === null || e.id === undefined) files.push(...(await listAll(s, `${full}/`)));
      else if (e.name !== '.emptyFolderPlaceholder') files.push(full);
    }
    if (entries.length < 1000) break;
  }
  return files;
}

function run(cmd, args, { input, passphrase } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'inherit', 'inherit', 'pipe'] });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`))));
    if (passphrase !== undefined) child.stdio[3].end(passphrase); // passphrase on fd 3, never on the command line
    else child.stdio[3].end();
    child.stdin.end(input);
  });
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const safePath = (p) => !p.split('/').some((part) => part === '..' || part === '') && !p.startsWith('/');

async function backup(outDir = 'backup') {
  const s = settings();
  const files = await listAll(s);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'receipts-'));
  try {
    const manifest = [];
    for (const name of files) {
      if (!safePath(name)) throw new Error(`Unexpected file name in the bucket: ${JSON.stringify(name)}`);
      const res = await storage(s, 'GET', `object/${BUCKET}/${name.split('/').map(encodeURIComponent).join('/')}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const target = path.join(tmp, 'files', name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes);
      manifest.push({ path: name, size: bytes.byteLength, sha256: sha256(bytes), contentType: res.headers.get('content-type') || 'application/octet-stream' });
    }
    fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify({ bucket: BUCKET, madeAt: new Date().toISOString(), files: manifest }, null, 1));
    fs.mkdirSync(outDir, { recursive: true });
    const tarFile = path.join(tmp, 'receipts.tar.gz');
    await run('tar', ['-czf', tarFile, '-C', tmp, 'manifest.json', ...(manifest.length ? ['files'] : [])]);
    const out = path.join(outDir, `stacktrack-receipts-${new Date().toISOString().slice(0, 10)}.tar.gz.gpg`);
    await run('gpg', ['--batch', '--yes', '--quiet', '--pinentry-mode', 'loopback', '--passphrase-fd', '3', '--symmetric', '--cipher-algo', 'AES256', '--output', out, tarFile], { passphrase: s.passphrase });
    const total = manifest.reduce((n, f) => n + f.size, 0);
    console.log(`Encrypted receipt backup written: ${out} (${manifest.length} files, ${(total / 1024).toFixed(0)} KB before compression)`);
    return { out, manifest };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function restore(file) {
  if (!file || !fs.existsSync(file)) fail('Usage: node scripts/backup-receipts.mjs restore <stacktrack-receipts-….tar.gz.gpg>');
  const s = settings();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'receipts-'));
  try {
    const tarFile = path.join(tmp, 'receipts.tar.gz');
    await run('gpg', ['--batch', '--yes', '--quiet', '--pinentry-mode', 'loopback', '--passphrase-fd', '3', '--decrypt', '--output', tarFile, file], { passphrase: s.passphrase });
    await run('tar', ['-xzf', tarFile, '-C', tmp]);
    const { files } = JSON.parse(fs.readFileSync(path.join(tmp, 'manifest.json'), 'utf8'));
    let restored = 0;
    for (const f of files) {
      if (!safePath(f.path)) throw new Error(`Unexpected file name in the backup: ${JSON.stringify(f.path)}`);
      const bytes = new Uint8Array(fs.readFileSync(path.join(tmp, 'files', f.path)));
      if (sha256(bytes) !== f.sha256) throw new Error(`${f.path} doesn't match its checksum; the backup is damaged.`);
      await storage(s, 'POST', `object/${BUCKET}/${f.path.split('/').map(encodeURIComponent).join('/')}`, bytes, { 'Content-Type': f.contentType, 'x-upsert': 'true' });
      restored++;
    }
    console.log(`Restored ${restored} receipt files into the "${BUCKET}" bucket.`);
    return files;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** LOCAL stack only: backup → delete every file → restore → every file back, byte for byte. */
async function rehearse() {
  // The local stack's own keys (written by npm run local:start) and a throwaway passphrase.
  if (!process.env.SUPABASE_URL && !process.env.SUPABASE_DB_URL && fs.existsSync('.env.development.local')) {
    for (const line of fs.readFileSync('.env.development.local', 'utf8').split('\n')) {
      const [k, ...v] = line.split('=');
      if (k === 'NEXT_PUBLIC_SUPABASE_URL') process.env.SUPABASE_URL = v.join('=');
      if (k === 'SUPABASE_SERVICE_ROLE_KEY' && !process.env.SUPABASE_SERVICE_ROLE_KEY) process.env.SUPABASE_SERVICE_ROLE_KEY = v.join('=');
    }
    process.env.BACKUP_PASSPHRASE ||= 'local-rehearsal-only-passphrase';
  }
  if (projectUrl() !== LOCAL_URL) fail(`The rehearsal deletes files, so it only runs against the local stack (${LOCAL_URL}).`);
  const s = settings();
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'receipts-backup-'));
  try {
    const { out, manifest } = await backup(outDir);
    if (!manifest.length) fail('No receipt files to rehearse with (run the browser tests first, they upload some).');
    const names = manifest.map((f) => f.path);
    for (let i = 0; i < names.length; i += 100) await storage(s, 'DELETE', `object/${BUCKET}`, { prefixes: names.slice(i, i + 100) });
    const left = await listAll(s);
    if (left.length) fail(`Rehearsal: ${left.length} files were still there after deleting.`);
    await restore(out);
    for (const f of manifest) {
      const res = await storage(s, 'GET', `object/${BUCKET}/${f.path.split('/').map(encodeURIComponent).join('/')}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (sha256(bytes) !== f.sha256) fail(`Rehearsal: ${f.path} came back different.`);
    }
    console.log(`Rehearsal passed: ${manifest.length} receipt files backed up, deleted, restored and identical.`);
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}

const [mode, arg] = process.argv.slice(2);
const jobs = { backup: () => backup(arg), restore: () => restore(arg), rehearse };
if (!jobs[mode]) fail('Usage: node scripts/backup-receipts.mjs backup [out_dir] | restore <file.gpg> | rehearse');
jobs[mode]().catch((err) => fail(err instanceof Error ? err.message : String(err)));
