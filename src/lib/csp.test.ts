import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCsp } from './csp';

const directive = (csp: string, name: string) => csp.split('; ').find((d) => d.startsWith(name + ' ')) ?? '';

test('hosted Supabase: https + wss, insecure requests upgraded', () => {
  const csp = buildCsp('n0nce', { supabaseUrl: 'https://abc.supabase.co' });
  assert.equal(directive(csp, 'connect-src'), "connect-src 'self' https://abc.supabase.co wss://abc.supabase.co");
  assert.match(directive(csp, 'script-src'), /'nonce-n0nce' 'strict-dynamic'/);
  assert.ok(csp.endsWith('upgrade-insecure-requests'));
});

test('local Docker Supabase: http + ws, nothing upgraded', () => {
  const csp = buildCsp('n0nce', { supabaseUrl: 'http://127.0.0.1:55621' });
  assert.equal(directive(csp, 'connect-src'), "connect-src 'self' http://127.0.0.1:55621 ws://127.0.0.1:55621");
  assert.ok(!csp.includes('upgrade-insecure-requests'));
  assert.equal(directive(csp, 'img-src'), "img-src 'self' data: blob: https: http://127.0.0.1:55621");
});
