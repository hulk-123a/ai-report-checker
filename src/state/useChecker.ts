import { useCallback, useReducer, useRef } from 'react';
import { runCheck, validateResults, type CheckOutput } from '../lib/agent';
import { buildDoc, parseFile } from '../lib/parse';
import { retrieve } from '../lib/retrieve';
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
};

type Action =
  | { type: 'setTask'; doc: ParsedDoc }
  | { type: 'setReport'; doc: ParsedDoc }
  | { type: 'stage'; stage: Stage; label: string; detail?: string }
  | { type: 'delta'; text: string }
  | { type: 'success'; payload: CheckOutput }
  | { type: 'demo'; task: ParsedDoc; report: ParsedDoc; payload: CheckOutput }
  | { type: 'error'; message: string }
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

  return { state, loadFile, loadText, run, cancel, loadDemo, reset: () => dispatch({ type: 'reset' }), busy };
}
