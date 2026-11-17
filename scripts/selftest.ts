/**
 * 核心链路自检（无需模型接口、无需浏览器）：
 * 切片 → 检索增强 → 证据链校验 → JSON 容错解析
 * 运行：npm run test:core
 */
import { parseJsonArray, validateResults } from '../src/lib/agent';
import { chunkText } from '../src/lib/chunk';
import { retrieve } from '../src/lib/retrieve';
import {
  SAMPLE_RAW_RESULTS,
  SAMPLE_REPORT_TEXT,
  SAMPLE_REQUIREMENTS,
  SAMPLE_TASK_TEXT,
} from '../src/lib/sample';
import type { ParsedDoc } from '../src/types';

let passed = 0;
function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

const task: ParsedDoc = {
  name: '示例任务书',
  text: SAMPLE_TASK_TEXT,
  chunks: chunkText(SAMPLE_TASK_TEXT, 't'),
};
const report: ParsedDoc = {
  name: '示例报告',
  text: SAMPLE_REPORT_TEXT,
  chunks: chunkText(SAMPLE_REPORT_TEXT, 'r'),
};

console.log('\n[1] 章节感知切片');
assert(task.chunks.length >= 5, `任务书切出 ${task.chunks.length} 个片段`);
assert(report.chunks.length >= 4, `报告切出 ${report.chunks.length} 个片段`);
assert(report.chunks.every((chunk) => chunk.text.length > 0 && chunk.id.startsWith('r-')), '片段 id 与内容完整');

console.log('\n[2] 检索增强命中');
for (const requirement of SAMPLE_REQUIREMENTS) {
  const hits = retrieve(`${requirement.title} ${requirement.requirement} ${requirement.keywords.join(' ')}`, report.chunks, 4);
  assert(hits.length > 0, `${requirement.id} ${requirement.title} 命中 ${hits.length} 个证据片段`);
}

console.log('\n[3] 结果硬校验与防幻觉');
const results = validateResults(SAMPLE_RAW_RESULTS, SAMPLE_REQUIREMENTS, report);
const expected: Record<string, string> = {
  Q1: 'partial', Q2: 'covered', Q3: 'covered', Q4: 'conflict', Q5: 'missing',
};
assert(results.length === SAMPLE_REQUIREMENTS.length, `生成 ${results.length} 条结论，无遗漏`);
for (const result of results) {
  assert(result.status === expected[result.id], `${result.id} 判定为 ${result.status}`);
  for (const evidence of result.evidence) {
    const flatQuote = evidence.quote.replace(/\s+/g, '').slice(0, 12);
    assert(report.text.replace(/\s+/g, '').includes(flatQuote), `${result.id} 引用可在报告原文中追溯`);
    assert(report.chunks.some((chunk) => chunk.id === evidence.chunkId), `${result.id} 片段 ${evidence.chunkId} 定位有效`);
  }
}
assert(results.find((item) => item.id === 'Q5')?.evidence.length === 0, '无证据项被正确判定为缺失且不带引用');

console.log('\n[4] 模型输出容错解析');
assert(parseJsonArray('[{"id":"Q1"}]').length === 1, '纯 JSON 数组');
assert(parseJsonArray('```json\n[{"id":"Q1"},{"id":"Q2"}]\n```').length === 2, '带 Markdown 代码块');
assert(parseJsonArray('模型输出如下：[{"id":"Q1"}] 以上').length === 1, '带前后缀文本');
assert(parseJsonArray('{"items":[{"id":"Q1"}]}').length === 1, '对象包裹数组');

console.log(`\n全部通过：${passed} 项断言\n`);
