import { useCallback, useReducer, useRef } from 'react';
import { runCheck, validateResults, type CheckOutput } from '../lib/agent';
import { buildDoc, parseFile, parseImage } from '../lib/parse';
import { retrieve } from '../lib/retrieve';
import { isSpeechSupported, startVoiceToText, type VoiceSession } from '../lib/multimodal';
import {
  SAMPLE_RAW_RESULTS,
  SAMPLE_REPORT_TEXT,
  SAMPLE_REQUIREMENTS,
  SAMPLE_TASK_TEXT,
} from '../lib/sample';
import type {
  CheckResult,
  DocKind,
  EvidenceBundle,
  ParsedDoc,
  Requirement,
  Stage,
  TimelineItem,
} from '../types';

interface State {
  task: ParsedDoc | null;
  report: ParsedDoc | null;
  requirements: Requirement[];
  results: CheckResult[];
  bundles: EvidenceBundle[];
  stage: Stage;
  timeline: TimelineItem[];
  streaming: string;
  error: string;
  /** 语音听写中的临时文本（多模态入口） */
  voiceDraft: string;
  listening: boolean;
}

const initialState: State = {
  task: null,
  report: null,
  requirements: [],
  results: [],
  bundles: [],
  stage: 'idle',
  timeline: [],
  streaming: '',
  error: '',
  voiceDraft: '',
  listening: false,
};

type Action =
  | { type: 'setTask'; doc: ParsedDoc }
  | { type: 'setReport'; doc: ParsedDoc }
  | { type: 'stage'; stage: Stage; label: string; detail?: string }
  | { type: 'delta'; text: string }
  | { type: 'success'; payload: CheckOutput }
  | { type: 'demo'; task: ParsedDoc; report: ParsedDoc; payload: CheckOutput }
  | { type: 'error'; message: string }
  | { type: 'voiceDraft'; text: string }
  | { type: 'listening'; value: boolean }
  | { type: 'reset' };

function withTimeline(state: State, stage: Stage, label: string, detail?: string): TimelineItem[] {
  return [...state.timeline, { stage, label, detail, at: Date.now() }].slice(-12);
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'setTask':
      return { ...state, task: action.doc, error: '' };
    case 'setReport':
      return { ...state, report: action.doc, error: '' };
    case 'stage':
      return {
        ...state,
        stage: action.stage,
        streaming: action.stage === 'judging' ? state.streaming : '',
        timeline: withTimeline(state, action.stage, action.label, action.detail),
      };
    case 'delta':
      return { ...state, streaming: (state.streaming + action.text).slice(-4000) };
    case 'success':
      return {
        ...state,
        ...action.payload,
        stage: 'done',
        error: '',
      };
    case 'demo':
      return {
        ...state,
        task: action.task,
        report: action.report,
        ...action.payload,
        stage: 'done',
        error: '',
        streaming: '',
        timeline: [
          {
            stage: 'done',
            label: '已载入离线演示数据',
            detail: '界面与结论链路完全一致，未调用模型接口',
            at: Date.now(),
          },
        ],
      };
    case 'error':
      return {
        ...state,
        stage: 'error',
        error: action.message,
        timeline: withTimeline(state, 'error', '核查中断', action.message),
      };
    case 'voiceDraft':
      return { ...state, voiceDraft: action.text };
    case 'listening':
      return { ...state, listening: action.value };
    case 'reset':
      return initialState;
    default:
      return state;
  }
}

export function useChecker() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const abortRef = useRef<AbortController | null>(null);

  const loadFile = useCallback(async (kind: DocKind, file: File) => {
    dispatch({ type: 'stage', stage: 'parsing', label: `正在解析 ${file.name}` });
    try {
      const doc = await parseFile(file, kind === 'task' ? 't' : 'r');
      dispatch(kind === 'task' ? { type: 'setTask', doc } : { type: 'setReport', doc });
      dispatch({
        type: 'stage',
        stage: 'idle',
        label: `${file.name} 解析完成`,
        detail: `${doc.text.length} 字符 / ${doc.chunks.length} 个片段`,
      });
    } catch (error) {
      dispatch({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  const loadText = useCallback((kind: DocKind, text: string, name: string) => {
    if (text.trim().length < 30) {
      dispatch({ type: 'error', message: '文本内容过短，请至少输入 30 个字符' });
      return;
    }
    const doc = buildDoc(name, text, kind === 'task' ? 't' : 'r');
    dispatch(kind === 'task' ? { type: 'setTask', doc } : { type: 'setReport', doc });
  }, []);

  /** 图像模态：视觉模型 OCR → 统一文档结构 */
  const loadImage = useCallback(async (kind: DocKind, file: File) => {
    dispatch({ type: 'stage', stage: 'parsing', label: `视觉识别 ${file.name}` });
    dispatch({ type: 'stage', stage: 'idle', label: '图像 OCR 进行中', detail: '调用视觉模型提取文字' });
    try {
      const doc = await parseImage(file, kind === 'task' ? 't' : 'r');
      dispatch(kind === 'task' ? { type: 'setTask', doc } : { type: 'setReport', doc });
      dispatch({
        type: 'stage',
        stage: 'idle',
        label: `${file.name} 图像识别完成`,
        detail: `OCR 提取 ${doc.text.length} 字符 / ${doc.chunks.length} 个片段`,
      });
    } catch (error) {
      dispatch({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  const voiceSessionRef = useRef<VoiceSession | null>(null);
  const voiceKindRef = useRef<DocKind>('task');

  /** 语音模态：浏览器端语音识别，识别完成自动汇入对应文档（与文本/图像同一链路） */
  const toggleVoice = useCallback((kind: DocKind) => {
    if (voiceSessionRef.current) {
      voiceSessionRef.current.stop();
      voiceSessionRef.current = null;
      dispatch({ type: 'listening', value: false });
      return;
    }
    if (!isSpeechSupported()) {
      dispatch({ type: 'error', message: '当前浏览器不支持语音识别，请使用 Chrome / Edge' });
      return;
    }
    voiceKindRef.current = kind;
    const targetKind = kind;
    dispatch({ type: 'voiceDraft', text: '' });
    dispatch({ type: 'listening', value: true });
    const session = startVoiceToText(
      (text) => dispatch({ type: 'voiceDraft', text }),
      (message) => {
        dispatch({ type: 'error', message });
        dispatch({ type: 'listening', value: false });
        voiceSessionRef.current = null;
      },
    );
    voiceSessionRef.current = session;
    session.done
      .then((finalText) => {
        dispatch({ type: 'listening', value: false });
        voiceSessionRef.current = null;
        if (finalText.length < 30) {
          dispatch({ type: 'error', message: '语音识别内容过短，请至少口述 30 字' });
          return;
        }
        const doc = buildDoc(`语音口述-${targetKind === 'task' ? '任务书' : '报告'}.txt`, finalText, targetKind === 'task' ? 't' : 'r');
        dispatch(targetKind === 'task' ? { type: 'setTask', doc } : { type: 'setReport', doc });
        dispatch({
          type: 'stage',
          stage: 'idle',
          label: '语音转写完成',
          detail: `已汇入${targetKind === 'task' ? '任务书' : '报告'} · ${finalText.length} 字符`,
        });
      })
      .catch(() => {
        dispatch({ type: 'listening', value: false });
        voiceSessionRef.current = null;
      });
  }, []);

  const run = useCallback(async () => {
    if (!state.task || !state.report) {
      dispatch({ type: 'error', message: '请先上传或粘贴任务书与实践报告' });
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // 流式增量做 80ms 合并，避免每个 token 触发一次重渲染
    let pending = '';
    let timer: number | undefined;
    const onDelta = (text: string) => {
      pending += text;
      if (timer === undefined) {
        timer = window.setTimeout(() => {
          const chunk = pending;
          pending = '';
          timer = undefined;
          if (chunk) dispatch({ type: 'delta', text: chunk });
        }, 80);
      }
    };

    try {
      const payload = await runCheck({
        taskText: state.task.text,
        report: state.report,
        onStage: (stage, label, detail) => dispatch({ type: 'stage', stage, label, detail }),
        onDelta,
        signal: controller.signal,
      });
      dispatch({ type: 'success', payload });
    } catch (error) {
      if (!controller.signal.aborted) {
        dispatch({ type: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    } finally {
      if (timer !== undefined) window.clearTimeout(timer);
      if (pending) dispatch({ type: 'delta', text: pending });
    }
  }, [state.task, state.report]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: 'stage', stage: 'idle', label: '已取消本次核查' });
  }, []);

  /** 离线演示：除模型调用外，检索与证据链校验走的都是真实代码路径 */
  const loadDemo = useCallback(() => {
    const task = buildDoc('示例-实训任务书.txt', SAMPLE_TASK_TEXT, 't');
    const report = buildDoc('示例-实践报告.txt', SAMPLE_REPORT_TEXT, 'r');
    const requirements = SAMPLE_REQUIREMENTS;
    const bundles: EvidenceBundle[] = requirements.map((requirement) => {
      const hits = retrieve(
        `${requirement.title} ${requirement.requirement} ${requirement.keywords.join(' ')}`,
        report.chunks,
        4,
      );
      return {
        requirementId: requirement.id,
        chunkIds: hits.map((hit) => hit.chunk.id),
        scores: hits.map((hit) => Number(hit.score.toFixed(2))),
      };
    });
    const results = validateResults(SAMPLE_RAW_RESULTS, requirements, report);
    dispatch({ type: 'demo', task, report, payload: { requirements, results, bundles } });
  }, []);

  const busy = ['parsing', 'extracting', 'retrieving', 'judging'].includes(state.stage);

  return {
    state,
    loadFile,
    loadText,
    loadImage,
    toggleVoice,
    run,
    cancel,
    loadDemo,
    reset: () => dispatch({ type: 'reset' }),
    busy,
  };
}
