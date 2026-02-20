import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/embed/index.js'),
      name: 'CallSafeWidget',
      formats: ['iife'],
      fileName: () => 'embed.js'
    },
    outDir: 'static',
    emptyOutDir: false,
    // Keep readable for debugging; minify separately for production deploys
    minify: false
  },
  resolve: {
    alias: {
      '$lib': resolve(__dirname, 'src/lib')
    }
  },
  define: {
    // Production embed — no dev-mode verbose logging
    'import.meta.env.DEV': 'false',
    'import.meta.env.PROD': 'true',
    // STUN defaults; embed fetches TURN dynamically via setTurnCredentials()
    'import.meta.env.VITE_STUN_SERVER_1': JSON.stringify('stun:stun.l.google.com:19302'),
    'import.meta.env.VITE_STUN_SERVER_2': JSON.stringify('stun:stun1.l.google.com:19302'),
    'import.meta.env.VITE_TURN_SERVER_URL': JSON.stringify(''),
    'import.meta.env.VITE_TURN_USERNAME': JSON.stringify(''),
    'import.meta.env.VITE_TURN_CREDENTIAL': JSON.stringify('')
  }
});
