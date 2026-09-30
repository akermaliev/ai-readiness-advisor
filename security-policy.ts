/**
 * v1.2 C3 — the site's security policy, defined once.
 *
 * Visitors paste API keys into this page, so it loads nothing it didn't ship and talks to
 * nothing except its own origin and Anthropic. The same values feed:
 *   - the <meta> CSP injected into production builds (vite.config.ts), a fallback for hosts
 *     that cannot set headers;
 *   - the host's header config, once a host is chosen (Cloudflare Pages / Netlify `_headers`,
 *     or Vercel `vercel.json`), via `headerLines()`.
 *
 * No `blob:` or `worker-src` is needed: the PDF is built in the main thread by jsPDF and the
 * download uses an object URL on a link, which CSP fetch directives do not govern.
 */
export const CSP_DIRECTIVES: readonly (readonly [string, string])[] = [
  ['default-src', "'self'"],
  ['script-src', "'self'"],
  ['style-src', "'self'"],
  ['img-src', "'self' data:"],
  ['connect-src', "'self' https://api.anthropic.com"],
  ['frame-ancestors', "'none'"],
  ['base-uri', "'none'"],
  ['form-action', "'none'"],
];

/** Directives a <meta> CSP may carry (browsers ignore frame-ancestors there and log a warning). */
export function metaCsp(): string {
  return CSP_DIRECTIVES.filter(([d]) => d !== 'frame-ancestors').map(([d, v]) => `${d} ${v}`).join('; ');
}

export function headerCsp(): string {
  return CSP_DIRECTIVES.map(([d, v]) => `${d} ${v}`).join('; ');
}

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': headerCsp(),
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

/** The headers as `Name: value` lines, the format `_headers` files use under a path rule. */
export function headerLines(): string[] {
  return Object.entries(SECURITY_HEADERS).map(([k, v]) => `${k}: ${v}`);
}
