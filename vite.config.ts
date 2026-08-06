import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  server: {
    // Vite's default binds 'localhost' to whichever address DNS returns first —
    // on Windows that is ::1 only, so browsers reaching for 127.0.0.1 get a
    // refused connection. Binding the wildcard covers both stacks.
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        styleguide: fileURLToPath(new URL('./styleguide.html', import.meta.url)),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
