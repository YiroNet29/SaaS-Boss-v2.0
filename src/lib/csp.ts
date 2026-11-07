/**
 * Content-Security-Policy for the app's pages. Only this app's scripts (carrying the per-request
 * nonce) may run; the page may only talk to itself and the configured Supabase project.
 */
export function buildCsp(nonce: string, opts: { supabaseUrl?: string; dev?: boolean } = {}): string {
  let supabase: string[] = [];
  let localHttp = false;
  if (opts.supabaseUrl) {
    try {
      const u = new URL(opts.supabaseUrl);
      // The hosted project is https; the local Docker stack is plain http on 127.0.0.1.
      localHttp = u.protocol === 'http:';
      supabase = localHttp ? [`http://${u.host}`, `ws://${u.host}`] : [`https://${u.host}`, `wss://${u.host}`];
    } catch {
      /* invalid URL: leave Supabase out */
    }
  }
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(opts.dev ? ["'unsafe-eval'"] : [])],
    // React style props and chart libraries set inline style attributes, which nonces can't cover.
    'style-src': ["'self'", "'unsafe-inline'"],
    // Receipt previews load from Supabase Storage (https: covers the hosted project; the local stack is http).
    'img-src': ["'self'", 'data:', 'blob:', 'https:', ...(localHttp ? supabase.slice(0, 1) : [])],
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
  // Not when talking to a local http Supabase (it would turn those calls into https and break them).
  if (!opts.dev && !localHttp) parts.push('upgrade-insecure-requests');
  return parts.join('; ');
}
