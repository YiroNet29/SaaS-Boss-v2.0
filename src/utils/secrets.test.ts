// Fake keys below are split into pieces so GitHub secret scanning does not flag these test fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSecretInText, SECRET_GUARDRAIL_WARNING } from './secrets';

test('detectSecretInText detects Stripe, Google, GitHub, Slack, and PEM keys', () => {
  // Stripe live key
  const stripeLive = detectSecretInText('Using secret key sk_' + 'live_51Ny8sA3lKg1B9d4ef83Kd0');
  assert.equal(stripeLive.hasSecret, true);
  assert.equal(stripeLive.warningMessage, SECRET_GUARDRAIL_WARNING);

  // Stripe test key
  const stripeTest = detectSecretInText('sk_test_51Ny8sA3lKg1B9d4ef83Kd0test');
  assert.equal(stripeTest.hasSecret, true);

  // Google API key
  const googleKey = detectSecretInText('AI' + 'zaSyAbcdEfghIjklMnopQrstuVwxyz01234');
  assert.equal(googleKey.hasSecret, true);

  // GitHub token
  const githubToken = detectSecretInText('gh' + 'p_abcdefghijklmnopqrstuvwxyz1234567890');
  assert.equal(githubToken.hasSecret, true);

  // Slack token
  const slackToken = detectSecretInText('xo' + 'xb-123456789012-abcdefghijklmn');
  assert.equal(slackToken.hasSecret, true);

  // Private key PEM
  const pem = detectSecretInText('-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...');
  assert.equal(pem.hasSecret, true);
});

test('detectSecretInText allows normal non-secret text and URLs', () => {
  assert.equal(detectSecretInText('Production database hosted on AWS us-east-1').hasSecret, false);
  assert.equal(detectSecretInText('https://dashboard.stripe.com/acct_1234/settings').hasSecret, false);
  assert.equal(detectSecretInText('Visa ending in 4417, expires 12/28').hasSecret, false);
  assert.equal(detectSecretInText('').hasSecret, false);
});
