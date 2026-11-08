import { existsSync } from 'node:fs';
import { localEnv, sql } from './helpers';
import { SUPABASE_API } from './ports';

// Fail fast, with the fix, when the local stack isn't running.
export default async function globalSetup() {
  if (!existsSync('.env.development.local')) {
    throw new Error('No .env.development.local. Start the local stack first: npm run local:start');
  }
  const env = localEnv();
  const res = await fetch(`${SUPABASE_API}/rest/v1/workspaces?select=id&limit=1`, {
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
  }).catch(() => null);
  if (!res || res.status !== 200) {
    throw new Error(`The local Supabase API isn't answering at ${SUPABASE_API}. Start it with: npm run local:start`);
  }
  try {
    sql('select 1');
  } catch {
    throw new Error('Could not reach the local database through Docker (docker exec supabase_db_stacktrack_local).');
  }
}
