import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createLlmHandler } from './server/llmProxy.mjs';

/**
 * 开发/预览环境把 /api/llm 挂到同一个 Vite 进程上。
 * 这样全项目只需 `npm run dev` 一条命令，密钥只存在于服务端内存中，
 * 不会打进前端产物（对应赛项「API 密钥不得出现在公开仓库」要求）。
 */
const llmProxyPlugin = {
  name: 'llm-proxy',
  configureServer(server) {
    server.middlewares.use('/api/llm', createLlmHandler());
  },
  configurePreviewServer(server) {
    server.middlewares.use('/api/llm', createLlmHandler());
  },
};

export default defineConfig({
  plugins: [react(), llmProxyPlugin],
  server: { port: 5173 },
  preview: { port: 4173 },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // pdf.js 体积较大，单独分包并按需加载，优化首屏
        manualChunks: { pdf: ['pdfjs-dist'] },
      },
    },
  },
});
