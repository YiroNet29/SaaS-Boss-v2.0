/**
 * Guesses sensible defaults for a new service from its name, so Quick Add needs less typing.
 * Order of preference: your own existing services, then stack templates, then a keyword list.
 */
import type { BillingCycle, Currency, ServiceCategory, ServiceLink, StackTemplate } from '../types';

const KEYWORDS: [RegExp, ServiceCategory][] = [
  [/namecheap|godaddy|porkbun|gandi|dynadot|hover|ethio ?telecom|domain|\.et\b/i, 'domain registrar'],
  [/supabase|neon|planetscale|mongo|postgres|mysql|turso|firebase|redis|upstash|xata/i, 'database'],
  [/resend|sendgrid|postmark|mailgun|brevo|ses\b|mailchimp|zoho mail|email/i, 'email provider'],
  [/stripe|chapa|telebirr|paypal|paddle|lemon ?squeezy|santimpay|arifpay/i, 'payment processor'],
  [/clerk|auth0|okta|kinde|stytch|workos/i, 'auth'],
  [/posthog|plausible|mixpanel|amplitude|google analytics|umami|hotjar/i, 'analytics'],
  [/sentry|bugsnag|rollbar|logrocket|better ?stack|datadog/i, 'error monitoring'],
  [/telegram/i, 'Telegram API'],
  [/google|gcp|firebase/i, 'Google API'],
  [/africa'?s talking|twilio|vonage|sms|geez ?sms/i, 'SMS'],
  [/\br2\b|s3|backblaze|wasabi|uploadthing|cloudinary|storage/i, 'storage'],
  [/vercel|netlify|railway|render|fly\.io|heroku|digitalocean|hetzner|aws|azure|linode|vultr|cloudflare|hosting|vps/i, 'hosting'],
];

export interface ServiceGuess {
  category?: ServiceCategory;
  cost?: number;
  currency?: Currency;
  billingCycle?: BillingCycle;
  plan?: string;
}

export function guessServiceDefaults(
  name: string,
  existing: ServiceLink[],
  templates: StackTemplate[]
): ServiceGuess {
  const q = name.trim().toLowerCase();
  if (q.length < 2) return {};

  // 1. Something you already pay for under the same name: copy its details.
  const mine = existing.find((s) => s.providerName.trim().toLowerCase() === q);
  if (mine) {
    return {
      category: mine.category,
      cost: mine.cost,
      currency: mine.currency,
      billingCycle: mine.billingCycle,
      plan: mine.plan,
    };
  }

  // 2. A provider from the built-in stack templates.
  for (const t of templates) {
    const bp = t.blueprints.find((b) => b.providerName.toLowerCase() === q);
    if (bp) return { category: bp.category };
  }

  // 3. Keyword match.
  for (const [re, category] of KEYWORDS) {
    if (re.test(q)) return { category };
  }
  return {};
}
