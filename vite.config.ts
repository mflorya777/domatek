import { defineConfig } from 'vite';

// Relative base so the build works from any sub-path (GitHub Pages, client site folder, etc.)
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 6000,
  },
});
