/**
 * Test doubles shared by the server-side tests: an in-memory stand-in for the Supabase query
 * builder (tables + private storage) and a recording fake for the Telegram API.
 */
import type { TgCall } from './telegram-bot';

type Row = Record<string, any>;

class Query {
  private filters: ((r: Row) => boolean)[] = [];
  private mode: 'select' | 'update' = 'select';
  private patch: Row | null = null;
  private returnRows = false;
  private one: 'maybe' | 'single' | null = null;
  constructor(private db: Record<string, Row[]>, private table: string) {}
  select() {
    if (this.mode === 'update') this.returnRows = true;
    return this;
  }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  in(c: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
  lt(c: string, v: any) { this.filters.push((r) => r[c] != null && r[c] < v); return this; }
  order() { return this; }
  limit() { return this; }
  update(patch: Row) { this.mode = 'update'; this.patch = patch; return this; }
  upsert(rows: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    const key = opts.onConflict ?? 'id';
    const table = (this.db[this.table] ??= []);
    for (const r of Array.isArray(rows) ? rows : [rows]) {
      const existing = table.find((x) => x[key] === r[key]);
      if (existing && !opts.ignoreDuplicates) Object.assign(existing, r);
      if (!existing) table.push({ ...r });
    }
    return Promise.resolve({ data: null, error: null });
  }
  /** Like Postgres: a second row with the same id is rejected (code 23505). */
  insert(rows: Row | Row[]) {
    const table = (this.db[this.table] ??= []);
    const list = Array.isArray(rows) ? rows : [rows];
    if (list.some((r) => r.id !== undefined && table.some((x) => x.id === r.id))) {
      return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } });
    }
    table.push(...list.map((r) => ({ ...r })));
    return Promise.resolve({ data: null, error: null });
  }
  maybeSingle() { this.one = 'maybe'; return this.run(); }
  single() { this.one = 'single'; return this.run(); }
  then(res: any, rej: any) { return this.run().then(res, rej); }
  private run() {
    const matched = (this.db[this.table] ?? []).filter((r) => this.filters.every((f) => f(r)));
    if (this.mode === 'update') matched.forEach((r) => Object.assign(r, this.patch));
    let data: any = this.mode === 'update' && !this.returnRows ? null : matched.map((r) => ({ ...r }));
    if (this.one) data = data?.[0] ?? null;
    return Promise.resolve({ data, error: null });
  }
}

export interface FakeStorage {
  files: Map<string, { bytes: Uint8Array; contentType?: string }>;
}

export function fakeAdmin(db: Record<string, Row[]>, storage: FakeStorage = { files: new Map() }) {
  return {
    from: (t: string) => new Query(db, t),
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, bytes: Uint8Array, opts: { contentType?: string } = {}) => {
          storage.files.set(`${bucket}/${path}`, { bytes, contentType: opts.contentType });
          return { data: { path }, error: null };
        },
        download: async (path: string) => {
          const f = storage.files.get(`${bucket}/${path}`);
          return f ? { data: new Blob([f.bytes as BlobPart]), error: null } : { data: null, error: { message: 'Object not found' } };
        },
      }),
    },
  } as any;
}

export function fakeTg() {
  const calls: { method: string; payload: Record<string, any> }[] = [];
  const tg: TgCall = async (method, payload) => {
    calls.push({ method, payload });
    return {} as any;
  };
  return { tg, calls };
}
