import { defineConfig } from 'vite';
import { singleHtmlPlugin } from './scripts/single-html-plugin.js';

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [singleHtmlPlugin()],
  server: { watch: { ignored: ['**/.browser-cache/**', '**/releases/**', '**/test-results*/**'] } },
  build: {
    // Never clean an existing directory automatically.
    emptyOutDir: false,
    assetsInlineLimit: Infinity,
    sourcemap: false,
    modulePreload: false,
    cssCodeSplit: false,
    rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } },
  },
});
