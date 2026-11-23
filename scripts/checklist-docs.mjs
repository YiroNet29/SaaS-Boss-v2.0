#!/usr/bin/env node
/**
 * Helpers for the shared checklist page (see docs/HANDOVER.md). docs/checklist.json is the repo's copy of it.
 *
 *   node scripts/checklist-docs.mjs out <dir>
 *     Writes one JSON file per database document (meta/phases and tasks/<id>) into <dir>, plus
 *     batch-1.json, batch-2.json…: ready-made `writes` lists (at most 50 each) for loading a new, empty
 *     page's database.
 *
 *   node scripts/checklist-docs.mjs check <dir>
 *     Compares a read-back of the page's `tasks` collection (one <id>.json per task, in <dir> or
 *     <dir>/tasks) with docs/checklist.json and lists every difference. Exits 1 if there are any.
 */
import fs from 'node:fs';
import path from 'node:path';

const FIELDS = ['id', 'n', 'phase', 'who', 'title', 'detail', 'done', 'doneAt', 'note'];
const [mode, dirArg] = process.argv.slice(2);
if (!['out', 'check'].includes(mode) || !dirArg) {
  console.error('Usage: node scripts/checklist-docs.mjs out <dir> | check <dir>');
  process.exit(2);
}
const dir = path.resolve(dirArg);
const list = JSON.parse(fs.readFileSync(new URL('../docs/checklist.json', import.meta.url), 'utf8'));
const tasks = [...list.tasks].sort((a, b) => a.n - b.n);
const countIn = (key) => tasks.filter((t) => t.phase === key).length;

if (mode === 'out') {
  fs.mkdirSync(path.join(dir, 'tasks'), { recursive: true });
  const phases = { list: list.phases.map((p) => ({ key: p.key, title: p.title, desc: p.desc, count: countIn(p.key) })) };
  fs.writeFileSync(path.join(dir, 'meta-phases.json'), JSON.stringify(phases));
  const writes = [{ op: 'set', collection: 'meta', doc_id: 'phases', file_path: path.join(dir, 'meta-phases.json') }];
  for (const t of tasks) {
    const file = path.join(dir, 'tasks', `${t.id}.json`);
    fs.writeFileSync(file, JSON.stringify(Object.fromEntries(FIELDS.map((k) => [k, t[k]]))));
    writes.push({ op: 'set', collection: 'tasks', doc_id: t.id, file_path: file });
  }
  const batches = [];
  for (let i = 0; i < writes.length; i += 50) batches.push(writes.slice(i, i + 50));
  batches.forEach((b, i) => fs.writeFileSync(path.join(dir, `batch-${i + 1}.json`), JSON.stringify(b)));
  console.log(`${tasks.length} tasks (${tasks.filter((t) => t.done).length} done) + the phase list written to ${dir}`);
  console.log(`${batches.length} batches: ${batches.map((b, i) => `batch-${i + 1}.json (${b.length} writes)`).join(', ')}`);
} else {
  const from = fs.existsSync(path.join(dir, 'tasks')) ? path.join(dir, 'tasks') : dir;
  const onPage = new Map(
    fs.readdirSync(from).filter((f) => f.endsWith('.json')).map((f) => {
      const raw = JSON.parse(fs.readFileSync(path.join(from, f), 'utf8'));
      return [path.basename(f, '.json'), raw.data ?? raw];
    })
  );
  const diffs = [];
  for (const t of tasks) {
    const p = onPage.get(t.id);
    if (!p) { diffs.push(`${t.id}: in the repo copy, not on the page`); continue; }
    for (const k of FIELDS) {
      if (JSON.stringify(p[k]) !== JSON.stringify(t[k])) diffs.push(`${t.id}.${k}: page ${JSON.stringify(p[k])} | repo ${JSON.stringify(t[k])}`);
    }
  }
  for (const id of onPage.keys()) if (!tasks.some((t) => t.id === id)) diffs.push(`${id}: on the page, not in the repo copy`);
  console.log(`page ${onPage.size} tasks | repo ${tasks.length} tasks | ${diffs.length} differences`);
  for (const d of diffs) console.log('  ' + d);
  process.exit(diffs.length ? 1 : 0);
}
