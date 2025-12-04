import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const backendPort = Number(env.PORT) || 3001;
    return {
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      optimizeDeps: {
        include: ['react', 'react-dom', 'zustand', 'immer', 'clsx']
      },
      server: {
        port: 5179,
        open: false,
        proxy: {
          '/api': {
            target: `http://localhost:${backendPort}`,
            changeOrigin: true,
            secure: false,
          },
          '/uploads': {
            target: `http://localhost:${backendPort}`,
            changeOrigin: true,
            secure: false,
          }
        }
      }
    };
});
