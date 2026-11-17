import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { ParsedDoc } from '../types';
import { chunkText } from './chunk';

function normalize(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 把纯文本包装成带切片与偏移的文档对象，上传文件与示例数据共用 */
export function buildDoc(name: string, raw: string, prefix: string): ParsedDoc {
  const text = normalize(raw);
  return { name, text, chunks: chunkText(text, prefix) };
}

async function readPdf(file: File): Promise<string> {
  // 动态导入：pdf.js 体积较大，只在真正上传 PDF 时才加载
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
  }
  return pages.join('\n\n');
}

async function readDocx(file: File): Promise<string> {
  const mammoth = (await import('mammoth/mammoth.browser.js')).default;
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value;
}

/**
 * 浏览器端完成解析，文档原文不落服务器，只把检索命中的片段发给模型。
 * 支持 PDF / DOCX / TXT / MD，另可直接粘贴文本作为兜底入口。
 */
export async function parseFile(file: File, prefix: string): Promise<ParsedDoc> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  let raw: string;
  if (ext === 'pdf') raw = await readPdf(file);
  else if (ext === 'docx') raw = await readDocx(file);
  else if (['txt', 'md', 'markdown', 'csv', 'text'].includes(ext)) raw = await file.text();
  else throw new Error(`暂不支持 .${ext} 格式，请上传 PDF / DOCX / TXT / MD`);

  if (normalize(raw).length < 30) {
    throw new Error('未能从文件中提取到有效文字（扫描件请先转成文字版 PDF 或直接粘贴）');
  }
  return buildDoc(file.name, raw, prefix);
}
