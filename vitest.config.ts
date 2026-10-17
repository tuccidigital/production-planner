import { defineConfig } from 'vitest/config';

process.env.TZ = 'America/Sao_Paulo';

export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
