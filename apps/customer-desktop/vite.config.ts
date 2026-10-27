import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: 'src',
  base: './',
  resolve: {
    alias: {
      '@pisonet/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts')
    }
  },
  build: {
    outDir: '../dist/renderer',
    emptyOutDir: true
  },
  server: {
    port: 5173
  }
});
