import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// base './' keeps asset paths relative, so the static build works from any host path
// (GitHub Pages project site, Vercel, or a local file server).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
});
