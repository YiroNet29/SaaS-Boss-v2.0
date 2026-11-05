/**
 * Content-Security-Policy for the app's pages. Only this app's scripts (carrying the per-request
 * nonce) may run; the page may only talk to itself and the configured Supabase project.
 */
export function buildCsp(nonce: string, opts: { supabaseUrl?: string; dev?: boolean } = {}): string {
  let supabase: string[] = [];
  if (opts.supabaseUrl) {
    try {
      const u = new URL(opts.supabaseUrl);
      supabase = [`https://${u.host}`, `wss://${u.host}`];
    } catch {
      /* invalid URL: leave Supabase out */
    }
  }
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(opts.dev ? ["'unsafe-eval'"] : [])],
    // React style props and chart libraries set inline style attributes, which nonces can't cover.
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", ...supabase, ...(opts.dev ? ['ws:'] : [])],
    'worker-src': ["'self'"],
    'manifest-src': ["'self'"],
    'frame-src': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(' ')}`);
  if (!opts.dev) parts.push('upgrade-insecure-requests');
  return parts.join('; ');
}
