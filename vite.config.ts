import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// base relativa: o mesmo build roda no Power Platform (Code App) e como demo estática.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 3000 },
});
