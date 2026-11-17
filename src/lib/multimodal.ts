/**
 * 多模态输入封装：
 * - 语音：浏览器原生 SpeechRecognition（Web Speech API），端侧识别，零依赖、零密钥；
 * - 图像：宠物/截图经服务端视觉模型 OCR 转成文字，再回流到统一核查链路。
 *
 * 两条路径最终都产出纯文本，复用同一套「切片 → 检索 → 核查」链路，
 * 实现「多模态 → 文本」的自然融合，而非割裂的功能堆叠。
 */

/** SpeechRecognition 的最小类型声明（TS lib.dom 尚未内置） */
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as Record<string, unknown>;
  const ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return typeof ctor === 'function' ? (ctor as SpeechRecognitionCtor) : null;
}

export function isSpeechSupported(): boolean {
  return getSpeechCtor() !== null;
}

export interface VoiceSession {
  stop: () => void;
  done: Promise<string>;
}

/**
 * 启动语音转文字会话。持续收集最终识别结果，调用 stop() 后 Promise 解析为完整文本。
 */
export function startVoiceToText(
  onInterim?: (text: string) => void,
  onError?: (message: string) => void,
): VoiceSession {
  const Ctor = getSpeechCtor();
  if (!Ctor) {
    return { stop: () => {}, done: Promise.reject(new Error('当前浏览器不支持语音识别，请使用 Chrome / Edge')) };
  }
  const recognizer = new Ctor();
  recognizer.lang = 'zh-CN';
  recognizer.continuous = true;
  recognizer.interimResults = true;
  recognizer.maxAlternatives = 1;

  let finalText = '';
  let settled = false;
  const done = new Promise<string>((resolve, reject) => {
    recognizer.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const alt = result[0];
        if (!alt) continue;
        if (result.isFinal) finalText += alt.transcript;
        else interim += alt.transcript;
      }
      onInterim?.(`${finalText}${interim}`);
    };
    recognizer.onerror = (event) => {
      if (settled) return;
      settled = true;
      const messages: Record<string, string> = {
        'not-allowed': '麦克风权限被拒绝，请在浏览器地址栏允许麦克风访问',
        'no-speech': '未检测到语音，请靠近麦克风重试',
        network: '语音识别需要网络，请检查连接',
      };
      const message = messages[event.error] ?? `语音识别失败：${event.error}`;
      onError?.(message);
      reject(new Error(message));
    };
    recognizer.onend = () => {
      if (settled) return;
      settled = true;
      resolve(finalText.trim());
    };
  });

  try {
    recognizer.start();
  } catch (error) {
    settled = true;
    const message = error instanceof Error ? error.message : '语音识别启动失败';
    onError?.(message);
    return { stop: () => {}, done: Promise.reject(new Error(message)) };
  }

  return { stop: () => recognizer.stop(), done };
}

export const IMAGE_OCR_PROMPT = `这是一张课程实践报告或任务书的截图。请逐字识别图片中的全部文字，保持原有段落与标题结构。
要求：
- 只输出识别出的文字，不要解释、不要评论、不要加 Markdown 代码块；
- 表格请用「字段：值」的形式逐行输出；
- 无法辨认的字用「□」代替，不要臆造内容。`;
