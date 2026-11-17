/** 多模态文本内容块：文本，或 OpenAI 兼容的 image_url（data URL / 公网 URL） */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];
  /** Function Calling：模型返回的工具调用请求 */
  tool_calls?: ToolCall[];
  /** 工具角色消息：对应某次 tool_call 的 id */
  tool_call_id?: string;
  name?: string;
}

export interface ToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface CallOptions {
  stream?: boolean;
  maxTokens?: number;
  onDelta?: (text: string) => void;
  signal?: AbortSignal;
  /** Function Calling 工具清单 */
  tools?: ToolDef[];
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  /** 是否走服务端视觉模型通道 */
  vision?: boolean;
  temperature?: number;
}

export interface LlmResult {
  content: string;
  toolCalls: ToolCall[];
}

async function post(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
  return fetch('/api/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
}

async function unwrapError(response: Response): Promise<string> {
  const error = await response.json().catch(() => ({ error: '未知错误' }));
  return `${error.error ?? '模型调用失败'}${error.detail ? `：${error.detail}` : ''}`;
}

function normalizeToolCalls(message: Record<string, unknown> | undefined): ToolCall[] {
  if (!Array.isArray(message?.tool_calls)) return [];
  return (message.tool_calls as Record<string, unknown>[])
    .filter((call) => call?.type === 'function' && call?.function)
    .map((call) => {
      const fn = call.function as Record<string, unknown>;
      return {
        id: String(call.id ?? ''),
        type: 'function',
        function: {
          name: String(fn.name ?? ''),
          arguments: typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments ?? {}),
        },
      };
    });
}

/**
 * 统一模型调用口。前端只访问同源 /api/llm，
 * 由服务端注入密钥与模型地址，前端产物中不含任何敏感信息。
 *
 * 返回 { content, toolCalls }：
 * - 普通/流式文本调用只用到 content，行为与旧版一致；
 * - Function Calling 调用可读取 toolCalls 并驱动本地检索工具。
 */
export async function callLlm(messages: ChatMessage[], options: CallOptions = {}): Promise<LlmResult> {
  const response = await post(
    {
      messages,
      stream: Boolean(options.stream),
      max_tokens: options.maxTokens ?? 2048,
      temperature: options.temperature ?? 0.1,
      ...(options.tools ? { tools: options.tools } : {}),
      ...(options.toolChoice ? { tool_choice: options.toolChoice } : {}),
      ...(options.vision ? { vision: true } : {}),
    },
    options.signal,
  );

  if (!response.ok) throw new Error(await unwrapError(response));

  if (!options.stream) {
    const data = await response.json();
    const message = (data?.choices?.[0]?.message ?? {}) as Record<string, unknown>;
    const content = typeof message.content === 'string' ? message.content : '';
    return { content, toolCalls: normalizeToolCalls(message) };
  }

  // 解析上游 SSE 增量帧，实时渲染「AI 正在分析」
  const reader = response.body?.getReader();
  if (!reader) throw new Error('浏览器不支持流式响应');
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const frame = JSON.parse(payload);
        const delta: string = frame?.choices?.[0]?.delta?.content ?? '';
        if (delta) {
          full += delta;
          options.onDelta?.(delta);
        }
      } catch {
        // 忽略心跳帧与非 JSON 帧
      }
    }
  }

  if (!full) throw new Error('模型流式返回为空，请改用非推理模型或检查额度');
  return { content: full, toolCalls: [] };
}

/** 便捷方法：只要文本，兼容旧调用习惯（阶段一拆解、阶段二判定内部使用） */
export async function callLlmText(messages: ChatMessage[], options: CallOptions = {}): Promise<string> {
  return (await callLlm(messages, options)).content;
}

/** 把图片文件读成 data URL（浏览器端完成，图片不落服务器） */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

/**
 * 视觉模态入口：把图片交给服务端视觉模型做 OCR / 版面理解，转成纯文本，
 * 再回流到统一的「切片 → 检索 → 核查」链路，实现多模态到文本链路的自然融合。
 */
export async function describeImage(
  dataUrl: string,
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const messages: ChatMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
      ],
    },
  ];
  const result = await callLlm(messages, { vision: true, maxTokens: 4096, signal, temperature: 0 });
  if (!result.content.trim()) throw new Error('视觉模型未返回可识别的文字');
  return result.content.trim();
}
