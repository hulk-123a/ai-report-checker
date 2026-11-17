#!/usr/bin/env node
/**
 * 核查镜 · 证据检索 MCP Server
 *
 * 基于 MCP（Model Context Protocol）标准，通过 stdio 使用 JSON-RPC 2.0 通信。
 * 零第三方依赖，Node 18+ 直接运行：node mcp-server/index.mjs
 *
 * 暴露工具：
 *   - retrieve_evidence  在内置示例报告中做 BM25 检索，返回可追溯的原文片段
 *   - list_reports       列出可用的内置报告文档
 *
 * 设计意图：证明本项目的「检索取证」能力可被任意 MCP 客户端（如 Claude Desktop、
 * Cursor、自研 Agent）标准化复用，而不仅局限于内置 Web 应用。
 */

const SERVER_INFO = { name: 'hechajing-evidence-mcp', version: '1.0.0' };

// ---- 内置演示语料（真实可检索；生产环境可换成任意文档源） ----
const CORPUS = {
  '示例-实践报告.txt': [
    { id: 'r-1', heading: '一、项目概述', text: '本项目为校园二手书交易平台，面向在校学生提供教材与课外书的发布、检索与交易撮合功能，采用 Web 前端结合轻量后端实现。' },
    { id: 'r-2', heading: '二、系统设计', text: '技术栈使用 React 18 与 TypeScript 严格模式构建前端，Vite 作为构建工具，后端采用 Node.js 单进程代理，数据暂存于本地 JSON 文件。' },
    { id: 'r-3', heading: '三、功能实现', text: '已实现图书发布、关键词搜索、在线咨询与订单管理四个核心模块，页面共 6 个，包含首页、列表页、详情页、发布页、消息页与个人中心。' },
    { id: 'r-4', heading: '四、测试', text: '对主要流程进行了功能测试，共设计 20 个用例，通过 18 个，2 个因网络超时未通过，已在总结中说明。' },
    { id: 'r-5', heading: '五、总结', text: '系统基本达成课程实训要求，源码与 README 已提交至公开代码仓库，实践报告字数约 3000 字，符合不少于 2000 字的要求。' },
  ],
};

const STOP = new Set('的 了 和 与 或 在 是 有 对 中 为 以 及 等 并 也 上 下 这 那 其 之 可 要 应 需'.split(' '));

function tokenize(text) {
  const segments = String(text).toLowerCase().match(/[\u4e00-\u9fa5]+|[a-z0-9_]{2,}/g) ?? [];
  const tokens = [];
  for (const seg of segments) {
    if (/^[\u4e00-\u9fa5]+$/.test(seg)) {
      if (seg.length === 1) tokens.push(seg);
      for (let i = 0; i < seg.length - 1; i += 1) tokens.push(seg.slice(i, i + 2));
    } else tokens.push(seg);
  }
  return tokens.filter((t) => !STOP.has(t));
}

function retrieve(query, chunks, topK = 4) {
  const q = [...new Set(tokenize(query))];
  if (!q.length || !chunks.length) return [];
  const docs = chunks.map((c) => tokenize(`${c.heading} ${c.text}`));
  const n = docs.length;
  const avg = docs.reduce((s, d) => s + d.length, 0) / n || 1;
  const df = new Map();
  for (const doc of docs) for (const t of new Set(doc)) df.set(t, (df.get(t) ?? 0) + 1);
  const k1 = 1.5;
  const b = 0.75;
  return chunks
    .map((chunk, i) => {
      const doc = docs[i];
      const tf = new Map();
      for (const t of doc) tf.set(t, (tf.get(t) ?? 0) + 1);
      let score = 0;
      for (const term of q) {
        const f = tf.get(term) ?? 0;
        if (!f) continue;
        const dff = df.get(term) ?? 0;
        const idf = Math.log(1 + (n - dff + 0.5) / (dff + 0.5));
        const norm = f + k1 * (1 - b + (b * doc.length) / avg);
        score += idf * ((f * (k1 + 1)) / norm);
      }
      if (q.some((t) => chunk.heading.toLowerCase().includes(t))) score *= 1.35;
      return { chunk, score };
    })
    .filter((h) => h.score > 0)
    .sort((a, b2) => b2.score - a.score)
    .slice(0, topK);
}

const TOOLS = [
  {
    name: 'retrieve_evidence',
    description: '在内置实践报告中用 BM25 检索与核查要求相关的原文片段，返回片段编号、章节、原文与相关度得分。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '检索查询，可包含要求标题与关键词' },
        document: { type: 'string', description: '文档名，留空则使用全部内置文档' },
        top_k: { type: 'number', description: '返回条数，默认 4' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_reports',
    description: '列出当前可被检索的内置报告文档名称与片段数。',
    inputSchema: { type: 'object', properties: {} },
  },
];

function callTool(name, args) {
  if (name === 'list_reports') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            Object.entries(CORPUS).map(([doc, chunks]) => ({ document: doc, chunks: chunks.length })),
            null,
            2,
          ),
        },
      ],
    };
  }
  if (name === 'retrieve_evidence') {
    const query = String(args?.query ?? '');
    const doc = String(args?.document ?? '');
    const topK = Math.min(Math.max(Number(args?.top_k) || 4, 1), 10);
    const sources = doc && CORPUS[doc] ? { [doc]: CORPUS[doc] } : CORPUS;
    const results = [];
    for (const [name2, chunks] of Object.entries(sources)) {
      for (const hit of retrieve(query, chunks, topK)) {
        results.push({
          document: name2,
          chunk_id: hit.chunk.id,
          heading: hit.chunk.heading,
          quote: hit.chunk.text,
          score: Number(hit.score.toFixed(2)),
        });
      }
    }
    results.sort((a, b2) => b2.score - a.score);
    return {
      content: [{ type: 'text', text: JSON.stringify(results.slice(0, topK), null, 2) }],
    };
  }
  throw new Error(`未知工具: ${name}`);
}

function send(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

function handle(msg) {
  const { id, method, params } = msg;
  switch (method) {
    case 'initialize':
      return send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: params?.protocolVersion ?? '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        },
      });
    case 'notifications/initialized':
      return; // 通知，无响应
    case 'tools/list':
      return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    case 'tools/call': {
      try {
        const result = callTool(params?.name, params?.arguments ?? {});
        return send({ jsonrpc: '2.0', id, result });
      } catch (error) {
        return send({ jsonrpc: '2.0', id, error: { code: -32000, message: error.message } });
      }
    }
    case 'ping':
      return send({ jsonrpc: '2.0', id, result: {} });
    default:
      if (id !== undefined) {
        return send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
      }
  }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    try {
      handle(JSON.parse(line));
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
  }
});
