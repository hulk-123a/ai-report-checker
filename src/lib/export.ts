import type { CheckResult, CheckStatus, ParsedDoc, Requirement } from '../types';

export const STATUS_META: Record<CheckStatus, { label: string; tone: string; icon: string }> = {
  covered: { label: '已覆盖', tone: 'ok', icon: '✓' },
  partial: { label: '部分满足', tone: 'warn', icon: '◐' },
  missing: { label: '缺失', tone: 'danger', icon: '✕' },
  conflict: { label: '存在矛盾', tone: 'conflict', icon: '!' },
};

export function buildMarkdown(
  task: ParsedDoc,
  report: ParsedDoc,
  requirements: Requirement[],
  results: CheckResult[],
): string {
  const counts = { covered: 0, partial: 0, missing: 0, conflict: 0 };
  for (const result of results) counts[result.status] += 1;
  const coveredRate = results.length
    ? Math.round(((counts.covered + counts.partial * 0.5) / results.length) * 100)
    : 0;

  const lines: string[] = [
    '# 实训材料一致性核查报告',
    '',
    `- 任务书：${task.name}`,
    `- 实践报告：${report.name}`,
    `- 生成时间：${new Date().toLocaleString('zh-CN')}`,
    `- 核查项：${results.length} 条　综合覆盖率：${coveredRate}%`,
    `- 已覆盖 ${counts.covered} / 部分满足 ${counts.partial} / 缺失 ${counts.missing} / 矛盾 ${counts.conflict}`,
    '',
    '> 本报告由 AI Agent 生成，每条结论均附报告原文引用，请结合人工复核使用。',
    '',
    '## 逐条核查结果',
    '',
  ];

  for (const requirement of requirements) {
    const result = results.find((item) => item.id === requirement.id);
    if (!result) continue;
    lines.push(`### ${requirement.id}　${requirement.title}　【${STATUS_META[result.status].label}】`);
    lines.push('');
    lines.push(`- **任务书要求**：${requirement.requirement}`);
    lines.push(`- **判定理由**：${result.reason}`);
    lines.push(`- **置信度**：${Math.round(result.confidence * 100)}%`);
    lines.push(`- **修改建议**：${result.suggestion}`);
    if (result.evidence.length) {
      lines.push('- **报告原文证据**：');
      for (const evidence of result.evidence) {
        lines.push(`  - [${evidence.chunkId}] ${evidence.quote}`);
      }
    } else {
      lines.push('- **报告原文证据**：未检索到可引用证据（判定为缺失/部分满足）');
    }
    lines.push('');
  }

  lines.push('---', '', '由「核查镜 · 实训材料一致性核查 Agent」生成');
  return lines.join('\n');
}

export function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
