import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { metaCsp } from './security-policy';

/**
 * Production builds get the CSP as a <meta> tag, a fallback for hosts that cannot set
 * headers. Not in dev: Vite's dev server injects inline styles and a websocket client,
 * which this policy (correctly) forbids.
 */
function cspMeta(): Plugin {
  return {
    name: 'aiira-csp-meta',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      // Right after <meta charset>, before any script or stylesheet it must govern.
      handler: (html) => {
        const withCsp = html.replace('<meta charset="UTF-8" />',
          `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${metaCsp()}" />`);
        // Link previews need an absolute image URL. Set SITE_URL (e.g. https://example.com) when building for a domain.
        const site = process.env.SITE_URL?.replace(/\/+$/, '');
        return site === undefined || site === '' ? withCsp : withCsp.replace('content="./og-card.png"', `content="${site}/og-card.png"`);
      },
    },
  };
}

// base './' keeps asset paths relative, so the static build works from any host path.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), cspMeta()],
});
