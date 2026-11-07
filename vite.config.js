import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // three.js 本体だけで 500 kB を超えるため、警告の閾値を上げる
    chunkSizeWarningLimit: 800,
  },
});
