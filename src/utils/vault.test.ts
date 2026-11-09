import test from 'node:test';
import assert from 'node:assert/strict';
import { vaultUrl, vaultItemUrl } from './vault';

test('vault address: empty, the old made-up default and non-web addresses count as not set', () => {
  assert.equal(vaultUrl(''), '');
  assert.equal(vaultUrl(undefined), '');
  assert.equal(vaultUrl('https://vault.internal.net'), '');
  assert.equal(vaultUrl('https://vault.internal.net/'), '');
  assert.equal(vaultUrl('javascript:alert(1)'), '');
  assert.equal(vaultUrl('not a url'), '');
});

test('vault address: a real one is kept, without a trailing slash', () => {
  assert.equal(vaultUrl(' https://vault.example.com/ '), 'https://vault.example.com');
  assert.equal(vaultUrl('http://localhost:4000'), 'http://localhost:4000');
});

test('vault item link: only when an address is set; the item id is escaped', () => {
  assert.equal(vaultItemUrl('', 'vt_1'), null);
  assert.equal(vaultItemUrl('https://vault.internal.net', 'vt_1'), null);
  assert.equal(vaultItemUrl('https://vault.example.com/', 'vt_stripe_prod'), 'https://vault.example.com/vault/api-keys/vt_stripe_prod');
  assert.equal(vaultItemUrl('https://vault.example.com', 'a/b?c'), 'https://vault.example.com/vault/api-keys/a%2Fb%3Fc');
  assert.equal(vaultItemUrl('https://vault.example.com', ''), null);
});
