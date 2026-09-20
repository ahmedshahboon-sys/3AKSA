import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { normalizeBasePath } from '@3aksa/config';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = normalizeBasePath(env.VITE_PUBLIC_BASE_PATH || '/3aksa/');

  return {
    base,
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173
    },
    preview: {
      host: '127.0.0.1',
      port: 4173
    },
    build: {
      sourcemap: false,
      target: 'es2022'
    }
  };
});
