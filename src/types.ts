export type DocKind = 'task' | 'report';

/** 报告被切分后的最小检索单元，start/end 用于原文定位高亮 */
export interface DocChunk {
  id: string;
  index: number;
  heading: string;
  text: string;
  start: number;
  end: number;
}

export interface ParsedDoc {
  name: string;
  text: string;
  chunks: DocChunk[];
}

/** Agent 阶段一：从任务书抽取出的可核查要求项 */
export interface Requirement {
  id: string;
  title: string;
  requirement: string;
  keywords: string[];
  category: string;
}

export type CheckStatus = 'covered' | 'partial' | 'missing' | 'conflict';

/** Agent 阶段二：逐条取证判定结果 */
export interface Evidence {
  chunkId: string;
  quote: string;
}

export interface CheckResult {
  id: string;
  status: CheckStatus;
  confidence: number;
  reason: string;
  evidence: Evidence[];
  suggestion: string;
}

/** 一条要求项对应的检索证据包，用于界面展示「检索到了什么」 */
export interface EvidenceBundle {
  requirementId: string;
  chunkIds: string[];
  scores: number[];
}

export type Stage =
  | 'idle'
  | 'parsing'
  | 'extracting'
  | 'retrieving'
  | 'judging'
  | 'done'
  | 'error';

export interface TimelineItem {
  stage: Stage;
  label: string;
  detail?: string;
  at: number;
}
