import type { DocChunk } from '../types';

const HEADING_RE = /^(第[一二三四五六七八九十\d]+[章节部分]|[一二三四五六七八九十]+[、.]|\d+(?:\.\d+)*[、.\s]|#{1,6}\s|[（(]\d+[）)])/;
const MAX_CHARS = 700;

/**
 * 「章节感知」切片：遇到标题先切块，块内按字符长度再切。
 * 保留 heading 与原文偏移，使检索结果可以精确回跳到报告对应段落。
 */
export function chunkText(text: string, prefix: string): DocChunk[] {
  const chunks: DocChunk[] = [];
  const lines = text.split('\n');
  let heading = '正文';
  let buffer: string[] = [];
  let start = 0;
  let cursor = 0;

  const flush = () => {
    const body = buffer.join('\n').trim();
    if (body.length >= 10) {
      chunks.push({
        id: `${prefix}-${chunks.length + 1}`,
        index: chunks.length,
        heading,
        text: body.length > MAX_CHARS ? `${body.slice(0, MAX_CHARS)}…` : body,
        start,
        end: cursor,
      });
    }
    buffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const isHeading = trimmed.length > 0 && trimmed.length < 60 && HEADING_RE.test(trimmed);
    if (isHeading) {
      flush();
      heading = trimmed.replace(/^#+\s*/, '');
    }
    if (buffer.length === 0) start = cursor;
    buffer.push(line);
    cursor += line.length + 1;
    if (buffer.join('\n').length > MAX_CHARS) flush();
  }
  flush();
  return chunks;
}
