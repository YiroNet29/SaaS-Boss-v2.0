import test from 'node:test';
import assert from 'node:assert/strict';
import { guessServiceDefaults } from './serviceGuess';
import { STARTER_TEMPLATES } from '../data/templates';
import type { ServiceLink } from '../types';

const mine = {
  id: 's', workspaceId: 'ws', productId: 'p', environmentType: 'production', category: 'database',
  providerName: 'Neon', accountEmail: '', loginUrl: '', plan: 'Launch', billingCycle: 'monthly', cost: 19,
  currency: 'USD', autoRenew: true, paymentMethodLabel: '', notes: '', status: 'active', vaultRefs: [],
  createdAt: '2026-01-01',
} as ServiceLink;

test('copies details from a service you already have', () => {
  assert.deepEqual(guessServiceDefaults('neon', [mine], STARTER_TEMPLATES), {
    category: 'database', cost: 19, currency: 'USD', billingCycle: 'monthly', plan: 'Launch',
  });
});

test('uses template categories, then keywords', () => {
  assert.equal(guessServiceDefaults('Resend', [], STARTER_TEMPLATES).category, 'email provider');
  assert.equal(guessServiceDefaults('Namecheap', [], STARTER_TEMPLATES).category, 'domain registrar');
  assert.equal(guessServiceDefaults('GoDaddy', [], STARTER_TEMPLATES).category, 'domain registrar');
  assert.equal(guessServiceDefaults('Hetzner VPS', [], STARTER_TEMPLATES).category, 'hosting');
  assert.equal(guessServiceDefaults('Postmark', [], STARTER_TEMPLATES).category, 'email provider');
});

test('returns nothing for unknown or too-short names', () => {
  assert.deepEqual(guessServiceDefaults('x', [], STARTER_TEMPLATES), {});
  assert.deepEqual(guessServiceDefaults('Figma', [], STARTER_TEMPLATES), {});
});
