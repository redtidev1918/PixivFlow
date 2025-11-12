import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
const DEV_API_PORT = process.env.VITE_DEV_API_PORT || 3001;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${DEV_API_PORT}`,
        changeOrigin: true,
      },
      '/socket.io': {
        target: `http://localhost:${DEV_API_PORT}`,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  // 支持 Capacitor
  base: './',
});

