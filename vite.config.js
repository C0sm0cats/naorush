import { defineConfig } from 'vite';
import { pwaPlugin } from './plugins/pwa.js';

export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: false },
  plugins: [pwaPlugin()],
});
