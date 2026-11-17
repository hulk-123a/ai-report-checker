export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CallOptions {
  stream?: boolean;
  maxTokens?: number;
  onDelta?: (text: string) => void;
  signal?: AbortSignal;
}

/**
 * 统一模型调用口。前端只访问同源 /api/llm，
 * 由服务端注入密钥与模型地址，前端产物中不含任何敏感信息。
 */
export async function callLlm(messages: ChatMessage[], options: CallOptions = {}): Promise<string> {
  const response = await fetch('/api/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      stream: Boolean(options.stream),
      max_tokens: options.maxTokens ?? 2048,
      temperature: 0.1,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: '未知错误' }));
    throw new Error(`${error.error ?? '模型调用失败'}${error.detail ? `：${error.detail}` : ''}`);
  }

  if (!options.stream) {
    const data = await response.json();
    const content: string = data?.choices?.[0]?.message?.content ?? '';
    if (!content) throw new Error('模型未返回内容，请检查模型名与接口地址');
    return content;
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
  return full;
}
