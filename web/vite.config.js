import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 前端构建与开发服务器配置。
 * 开发期把 /api 代理到后端 3001 端口，因此前端代码里始终写相对路径 /api，
 * 生产期后端单端口托管 dist，同一份代码无需改动 —— 这是前后端分离下最省心的联调方式。
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
