import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Calling core — the heavy bundle (modal UI + WebSocket transport + WebRTC),
// lazy-loaded by the loader stub as static/embed.core.js.
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/embed/core.js'),
      name: 'CallSafeCore',
      formats: ['iife'],
      fileName: () => 'embed.core.js'
    },
    outDir: 'static',
    emptyOutDir: false,
    minify: true
  },
  resolve: {
    alias: {
      '$lib': resolve(__dirname, 'src/lib')
    }
  },
  define: {
    // src/lib is shared with the Next.js app and now reads process.env.NEXT_PUBLIC_*.
    // Vite must substitute those here so the embed bundle contains no process.env.
    // Production embed — no dev-mode verbose logging
    'import.meta.env.DEV': 'false',
    'import.meta.env.PROD': 'true',
    'process.env.NODE_ENV': JSON.stringify('production'),
    // STUN defaults; embed fetches TURN dynamically via setTurnCredentials()
    'process.env.NEXT_PUBLIC_STUN_SERVER_1': JSON.stringify('stun:stun.l.google.com:19302'),
    'process.env.NEXT_PUBLIC_STUN_SERVER_2': JSON.stringify('stun:stun1.l.google.com:19302'),
    'process.env.NEXT_PUBLIC_TURN_SERVER_URL': JSON.stringify(''),
    'process.env.NEXT_PUBLIC_TURN_USERNAME': JSON.stringify(''),
    'process.env.NEXT_PUBLIC_TURN_CREDENTIAL': JSON.stringify('')
  }
});
