import test from 'node:test';
import assert from 'node:assert/strict';
import { describeDraft, encodeAddChoice, parseAddChoice, parseAddCommand, pickApp } from './telegramAdd';

const ok = (s: string) => {
  const r = parseAddCommand(s);
  if ('error' in r) throw new Error(`expected a draft for "${s}", got: ${r.error}`);
  return r.draft;
};
const err = (s: string) => {
  const r = parseAddCommand(s);
  assert.ok('error' in r, `expected an error for "${s}"`);
  return (r as { error: string }).error;
};

test('/add: the checklist example', () => {
  assert.deepEqual(ok('Vercel Pro 20 USD monthly for StackTrack'), {
    providerName: 'Vercel',
    plan: 'Pro',
    cost: 20,
    currency: 'USD',
    billingCycle: 'monthly',
    appName: 'StackTrack',
  });
});

test('/add: currencies, cycles, dates and defaults', () => {
  assert.deepEqual(ok('Supabase 25'), { providerName: 'Supabase', plan: '', cost: 25, currency: 'USD', billingCycle: 'monthly' });
  assert.equal(ok('Namecheap $12.98 yearly').cost, 12.98);
  assert.equal(ok('Namecheap 12.98$ a year').billingCycle, 'yearly');
  assert.deepEqual(
    { ...ok('Ethio Telecom 3,900 birr per month') },
    { providerName: 'Ethio Telecom', plan: '', cost: 3900, currency: 'ETB', billingCycle: 'monthly' }
  );
  assert.equal(ok('Hosting ETB 1500 annual').currency, 'ETB');
  assert.equal(ok('Hosting ETB 1500 annual').providerName, 'Hosting');
  assert.equal(ok('Logo design 300 once').billingCycle, 'one-time');
  assert.equal(ok('Vercel 20 monthly renews 2026-12-01').renewalDate, '2026-12-01');
  assert.equal(ok('Vercel 20 monthly 2026-12-01 in Hotel app').appName, 'Hotel app');
  assert.deepEqual(ok('Cloudflare free'), { providerName: 'Cloudflare', plan: '', cost: 0, currency: 'USD', billingCycle: 'free' });
  assert.equal(ok('OpenAI usage for StackTrack').billingCycle, 'usage-based');
  assert.equal(ok('OpenAI 15 usage').cost, 15);
  assert.equal(ok('Something 0').billingCycle, 'free');
  // "for" before the price is part of the name.
  assert.equal(ok('Tools for Teams 9 monthly').providerName, 'Tools for');
  assert.equal(ok('Tools for Teams 9 monthly').plan, 'Teams');
  // Only a known plan word is split off.
  assert.equal(ok('Google Workspace 7').providerName, 'Google Workspace');
});

test('/add: what it refuses instead of guessing', () => {
  assert.match(err(''), /Usage/);
  assert.match(err('Vercel'), /need the price/);
  assert.match(err('20 monthly'), /name first/);
  assert.match(err('Vercel 20 EUR'), /USD or ETB/);
  assert.match(err('Vercel €20'), /USD or ETB/);
  assert.match(err('Vercel 20 monthly 2026-02-30'), /real date/);
  assert.match(err('Vercel 20 fortnightly'), /didn't understand: fortnightly/);
  assert.match(err('Vercel 20 for'), /which app/);
  assert.match(err('Vercel 99999999'), /too big/);
});

test('/add: picking the app by name', () => {
  const apps = [
    { id: 'a', name: 'StackTrack' },
    { id: 'b', name: 'Hotel booking' },
    { id: 'c', name: 'Hotel POS' },
  ];
  assert.equal(pickApp(apps, 'stacktrack'), apps[0]);
  assert.equal(pickApp(apps, 'Stack'), apps[0]);
  assert.equal(pickApp(apps, 'POS'), apps[2]);
  assert.deepEqual(pickApp(apps, 'hotel'), [apps[1], apps[2]]);
  assert.equal(pickApp(apps, 'Shop'), 'none');
});

test('/add: app buttons carry the app and the message they answer', () => {
  const data = encodeAddChoice('prod-123', 42)!;
  assert.deepEqual(parseAddChoice(data), { appId: 'prod-123', messageId: 42 });
  assert.equal(parseAddChoice('paid|s-1|20261101'), null);
  assert.equal(parseAddChoice('add|bad id|1'), null);
  assert.equal(encodeAddChoice('x'.repeat(70), 1), null);
});

test('/add: how the new service is described', () => {
  const d = { providerName: 'Vercel', plan: 'Pro', cost: 20, currency: 'USD' as const };
  assert.equal(describeDraft({ ...d, billingCycle: 'monthly' }, '$20'), 'Vercel (Pro) · $20 a month');
  assert.equal(describeDraft({ ...d, billingCycle: 'yearly' }, '$20'), 'Vercel (Pro) · $20 a year');
  assert.equal(describeDraft({ ...d, plan: '', billingCycle: 'free', cost: 0 }, ''), 'Vercel · free');
  assert.equal(describeDraft({ ...d, plan: '', billingCycle: 'usage-based', cost: 0 }, ''), 'Vercel · usage-based');
});

test('/add: app names may contain "for" or "in"; echoed mistakes are safe in Telegram HTML', () => {
  assert.equal(ok('Vercel 20 USD monthly for Built in Public').appName, 'Built in Public');
  assert.equal(ok('Vercel 20 monthly for Tools for Teams').appName, 'Tools for Teams');
  assert.equal(ok('Vercel 20 monthly in Hotel app').appName, 'Hotel app');
  assert.match(err('Vercel 20 monthly <3'), /didn't understand: &lt;3/);
  assert.match(err('Vercel 20 monthly 2026-02-30<b>'), /didn't understand|isn't a real date/);
  assert.ok(!/<3|<b>/.test(err('Vercel 20 monthly <3 <b>')));
});

test('/add: a number that is part of the name ("Office 365")', () => {
  assert.deepEqual(
    { ...ok('Office 365 12 monthly') },
    { providerName: 'Office 365', plan: '', cost: 12, currency: 'USD', billingCycle: 'monthly' }
  );
  assert.equal(ok('Office 365 Business 12.50 yearly').providerName, 'Office 365');
  assert.equal(ok('Office 365 Business 12.50 yearly').plan, 'Business');
  assert.equal(ok('Office 365 Business 12.50 yearly').cost, 12.5);
});
