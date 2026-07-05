import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Loader stub — the tiny script sites embed as static/embed.js. It renders the
// button and lazy-loads the calling core (see vite.embed-core.config.ts).
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/embed/stub.js'),
      name: 'CallSafeStub',
      formats: ['iife'],
      fileName: () => 'embed.js'
    },
    outDir: 'static',
    emptyOutDir: false,
    minify: true
  }
});
