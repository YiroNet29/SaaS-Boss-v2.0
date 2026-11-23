import { StackTemplate } from '../types';

/**
 * Built-in starting points for a new product. Typical prices only: change them after stamping out a stack.
 * Ids are kept stable (the demo data refers to them).
 */
export const STARTER_TEMPLATES: StackTemplate[] = [
  {
    id: 'tpl-standard-saas',
    name: 'Next.js + Supabase on Vercel',
    description:
      'How StackTrack itself runs: Vercel hosting, Supabase database and login, a domain, Resend email, a Telegram bot for alerts, the Claude API, GitHub and an hourly cron-job.org job.',
    isBuiltIn: true,
    blueprints: [
      { category: 'hosting', providerName: 'Vercel', billingCycle: 'monthly', typicalCost: 20, currency: 'USD', defaultPlan: 'Pro', loginUrl: 'https://vercel.com' },
      { category: 'database', providerName: 'Supabase', billingCycle: 'monthly', typicalCost: 25, currency: 'USD', defaultPlan: 'Pro', loginUrl: 'https://supabase.com/dashboard' },
      { category: 'domain registrar', providerName: 'Cloudflare', billingCycle: 'yearly', typicalCost: 11, currency: 'USD', defaultPlan: 'Registrar (.com)', loginUrl: 'https://dash.cloudflare.com' },
      { category: 'email provider', providerName: 'Resend', billingCycle: 'free', typicalCost: 0, currency: 'USD', defaultPlan: 'Free', loginUrl: 'https://resend.com' },
      { category: 'Telegram API', providerName: 'Telegram Bot API', billingCycle: 'free', typicalCost: 0, currency: 'USD', defaultPlan: 'Bot', loginUrl: 'https://t.me/BotFather' },
      { category: 'other', providerName: 'Anthropic (Claude API)', billingCycle: 'usage-based', typicalCost: 5, currency: 'USD', defaultPlan: 'Pay as you go', loginUrl: 'https://console.anthropic.com' },
      { category: 'other', providerName: 'GitHub', billingCycle: 'free', typicalCost: 0, currency: 'USD', defaultPlan: 'Free', loginUrl: 'https://github.com' },
      { category: 'other', providerName: 'cron-job.org', billingCycle: 'free', typicalCost: 0, currency: 'USD', defaultPlan: 'Free', loginUrl: 'https://cron-job.org' },
    ],
  },
  {
    id: 'tpl-shop-management',
    name: 'Shop or hotel SaaS for Ethiopia',
    description:
      'The same Vercel and Supabase base, plus what local customers pay and hear from you with: Chapa and telebirr payments, SMS, and a Telegram bot.',
    isBuiltIn: true,
    blueprints: [
      { category: 'hosting', providerName: 'Vercel', billingCycle: 'monthly', typicalCost: 20, currency: 'USD', defaultPlan: 'Pro', loginUrl: 'https://vercel.com' },
      { category: 'database', providerName: 'Supabase', billingCycle: 'monthly', typicalCost: 25, currency: 'USD', defaultPlan: 'Pro', loginUrl: 'https://supabase.com/dashboard' },
      { category: 'domain registrar', providerName: 'Cloudflare', billingCycle: 'yearly', typicalCost: 11, currency: 'USD', defaultPlan: 'Registrar (.com)', loginUrl: 'https://dash.cloudflare.com' },
      { category: 'payment processor', providerName: 'Chapa', billingCycle: 'usage-based', typicalCost: 0, currency: 'ETB', defaultPlan: 'Fee per payment', loginUrl: 'https://chapa.co' },
      { category: 'payment processor', providerName: 'telebirr', billingCycle: 'usage-based', typicalCost: 0, currency: 'ETB', defaultPlan: 'Merchant, fee per payment' },
      { category: 'SMS', providerName: "Africa's Talking", billingCycle: 'usage-based', typicalCost: 10, currency: 'USD', defaultPlan: 'Bulk SMS', loginUrl: 'https://africastalking.com' },
      { category: 'Telegram API', providerName: 'Telegram Bot API', billingCycle: 'free', typicalCost: 0, currency: 'USD', defaultPlan: 'Bot', loginUrl: 'https://t.me/BotFather' },
    ],
  },
];
