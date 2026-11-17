import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';

const MAX_BODY = 12 * 1024 * 1024; // 单次请求上限 12MB（视觉模态需容纳 base64 图片），仍设硬上限避免异常请求

/** 读取 .env.local；系统环境变量优先级更高，便于云端部署时 injection */
export function loadEnv() {
  const env = { ...process.env };
  try {
    const text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (match && env[match[1]] === undefined) {
        env[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    // 没有 .env.local 时只使用系统环境变量，属正常情况
  }
  return env;
}

export function getConfig() {
  const env = loadEnv();
  return {
    apiKey: env.LLM_API_KEY || '',
    baseUrl: env.LLM_BASE_URL || 'https://api.deepseek.com/v1',
    model: env.LLM_MODEL || 'deepseek-chat',
    vision: String(env.LLM_VISION || 'false').toLowerCase() === 'true',
    // 视觉/图像理解可独立指定基地址与模型；未指定则复用主模型（要求其兼容 image_url 多模态消息）
    visionModel: env.LLM_VISION_MODEL || '',
    visionBaseUrl: env.LLM_VISION_BASE_URL || '',
  };
}

export function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('请求体超过 12MB 限制'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new Error('请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

/**
 * 极简 LLM 反向代理：
 * 1. 密钥只在服务端，前端永远拿不到；
 * 2. 模型地址由服务端环境变量决定，不接受客户端传入，避免 SSRF；
 * 3. 同时支持普通 JSON 与 SSE 流式透传。
 */
export function createLlmHandler() {
  return async function handleLlm(req, res) {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { error: '仅支持 POST' });
    }

    const config = getConfig();
    if (!config.apiKey || config.apiKey.includes('xxxxxxxx')) {
      return sendJson(res, 500, {
        error: '尚未配置模型密钥：请把 .env.example 复制为 .env.local，填写 LLM_API_KEY 后重启服务',
      });
    }

    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }

    if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 40) {
      return sendJson(res, 400, { error: 'messages 参数不合法' });
    }

    // 视觉模态：需服务端显式启用，避免前端绕过配置直接调用付费视觉接口
    const wantVision = Boolean(body.vision);
    if (wantVision && !config.vision) {
      return sendJson(res, 403, {
        error: '视觉模态未启用。请在服务端 .env.local 设置 LLM_VISION=true 并可选用 LLM_VISION_MODEL / LLM_VISION_BASE_URL 指定视觉模型。',
      });
    }

    // 基地址与模型一律由服务端环境变量决定，杜绝客户端传入造成 SSRF
    const base = (wantVision ? config.visionBaseUrl || config.baseUrl : config.baseUrl).replace(/\/+$/, '');
    const endpoint = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
    const payload = {
      model: wantVision ? config.visionModel || config.model : config.model,
      messages: body.messages,
      temperature: typeof body.temperature === 'number' ? body.temperature : 0.1,
      max_tokens: Math.min(Number(body.max_tokens) || 2048, 8192),
      stream: Boolean(body.stream),
    };

    // Function Calling：透传工具定义与调用策略，返回完整 message（含 tool_calls）
    if (Array.isArray(body.tools) && body.tools.length > 0 && body.tools.length <= 16) {
      payload.tools = body.tools;
      if (['auto', 'none', 'required'].includes(body.tool_choice) || typeof body.tool_choice === 'object') {
        payload.tool_choice = body.tool_choice;
      }
    }

    let upstream;
    try {
      upstream = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (error) {
      return sendJson(res, 502, { error: `模型接口连接失败：${error.message}` });
    }

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      return sendJson(res, 502, {
        error: `模型接口返回 HTTP ${upstream.status}`,
        detail: detail.slice(0, 400),
      });
    }

    if (payload.stream) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (upstream.body) {
        Readable.fromWeb(upstream.body).pipe(res);
      } else {
        res.end();
      }
      return;
    }

    const data = await upstream.json().catch(() => ({}));
    return sendJson(res, 200, data);
  };
}
