import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Loader stub — the tiny script sites embed as public/embed.js. It renders the
// button and lazy-loads the calling core (see vite.embed-core.config.ts).
export default defineConfig({
  // outDir is 'public', which is also Vite's default publicDir; disable the
  // public-dir copy step so it does not try to copy the folder onto itself.
  publicDir: false,
  build: {
    lib: {
      entry: resolve(__dirname, 'src/embed/stub.js'),
      name: 'CallSafeStub',
      formats: ['iife'],
      fileName: () => 'embed.js'
    },
    outDir: 'public',
    emptyOutDir: false,
    minify: true
  }
});
