import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { createLlmHandler, loadEnv } from './llmProxy.mjs';

/**
 * 生产单进程服务：静态站点 + /api/llm 代理。
 * 部署到任意能跑 Node 18+ 的公网主机即可，无需 Nginx / 额外后端框架。
 * 用法：npm run build && npm run serve
 */
const env = loadEnv();
const PORT = Number(env.PORT || 4173);
const ROOT = resolve(process.cwd(), 'dist');
const llmHandler = createLlmHandler();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');

  if (url.pathname === '/api/llm') return llmHandler(req, res);
  if (url.pathname === '/api/health') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok: true, service: 'ai-report-checker' }));
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    return res.end('Method Not Allowed');
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.statusCode = 400;
    return res.end('Bad Request');
  }

  let filePath = normalize(join(ROOT, pathname));
  if (!filePath.startsWith(ROOT)) {
    res.statusCode = 403;
    return res.end('Forbidden');
  }

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, 'index.html');
    const data = await readFile(filePath);
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME[extname(filePath)] || 'application/octet-stream');
    res.setHeader(
      'Cache-Control',
      extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    );
    return res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    // SPA 兜底：前端路由交给 index.html
    try {
      const data = await readFile(join(ROOT, 'index.html'));
      res.statusCode = 200;
      res.setHeader('Content-Type', MIME['.html']);
      return res.end(data);
    } catch {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.end('未找到 dist 目录，请先执行 npm run build');
    }
  }
});

server.listen(PORT, () => {
  console.log(`核查镜已启动：http://localhost:${PORT}`);
  console.log('健康检查：/api/health　模型代理：/api/llm');
});
