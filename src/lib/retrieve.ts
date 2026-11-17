import type { DocChunk } from '../types';

export interface Hit {
  chunk: DocChunk;
  score: number;
}

const STOP_WORDS = new Set(
  '的 了 和 与 或 在 是 有 对 中 为 以 及 等 并 也 上 下 这 那 其 之 可 要 应 需 一个 进行 内容 要求 相关 我们 使用'.split(' '),
);

/** 中文按二元字组切分，英文/数字按词切分；无需分词库，纯前端零依赖 */
export function tokenize(text: string): string[] {
  const segments = text.toLowerCase().match(/[\u4e00-\u9fa5]+|[a-z0-9_]{2,}/g) ?? [];
  const tokens: string[] = [];
  for (const segment of segments) {
    if (/^[\u4e00-\u9fa5]+$/.test(segment)) {
      if (segment.length === 1) tokens.push(segment);
      for (let i = 0; i < segment.length - 1; i += 1) tokens.push(segment.slice(i, i + 2));
    } else {
      tokens.push(segment);
    }
  }
  return tokens.filter((token) => !STOP_WORDS.has(token));
}

/**
 * 轻量检索增强：BM25 + 章节标题加权。
 * 精简版刻意不引入向量数据库 / embedding 接口，只需一个 Chat 接口即可跑通，
 * 同时保证「每条结论都能追溯到具体原文片段」这一核心要求。
 */
export function retrieve(query: string, chunks: DocChunk[], topK = 4): Hit[] {
  const queryTerms = [...new Set(tokenize(query))];
  if (queryTerms.length === 0 || chunks.length === 0) return [];

  const docs = chunks.map((chunk) => tokenize(`${chunk.heading} ${chunk.text}`));
  const docCount = docs.length;
  const avgLength = docs.reduce((sum, doc) => sum + doc.length, 0) / docCount || 1;

  const df = new Map<string, number>();
  for (const doc of docs) {
    for (const term of new Set(doc)) df.set(term, (df.get(term) ?? 0) + 1);
  }

  const k1 = 1.5;
  const b = 0.75;
  const hits: Hit[] = chunks.map((chunk, index) => {
    const doc = docs[index];
    const tf = new Map<string, number>();
    for (const term of doc) tf.set(term, (tf.get(term) ?? 0) + 1);

    let score = 0;
    for (const term of queryTerms) {
      const freq = tf.get(term) ?? 0;
      if (freq === 0) continue;
      const docFreq = df.get(term) ?? 0;
      const idf = Math.log(1 + (docCount - docFreq + 0.5) / (docFreq + 0.5));
      const norm = freq + k1 * (1 - b + (b * doc.length) / avgLength);
      score += idf * ((freq * (k1 + 1)) / norm);
    }
    const flatHeading = chunk.heading.toLowerCase();
    if (queryTerms.some((term) => flatHeading.includes(term))) score *= 1.35;
    return { chunk, score };
  });

  return hits
    .filter((hit) => hit.score > 0)
    .sort((a, b2) => b2.score - a.score)
    .slice(0, topK);
}
