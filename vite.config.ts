import { defineConfig } from 'vite';

// Two pages: the optimised game at / and the frozen naive baseline at /naive/
export default defineConfig({
  build: {
    rollupOptions: {
      input: { main: 'index.html', naive: 'naive/index.html' },
    },
  },
});
