import { defineConfig } from '@playwright/test';

// Em Linux com o Chromium do ambiente, defina PW_CHROMIUM com o caminho do executável.
const executablePath = process.env.PW_CHROMIUM || undefined;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1440, height: 900 },
    timezoneId: 'America/Sao_Paulo',
    locale: 'pt-BR',
    launchOptions: { executablePath },
  },
  webServer: { command: 'npm run build:mock && npx vite preview --port 4173 --strictPort', port: 4173, reuseExistingServer: true, timeout: 120_000 },
});
