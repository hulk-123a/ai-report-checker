import type { CheckResult } from '../types';

interface Props {
  results: CheckResult[];
  onExport: () => void;
}

export function SummaryBar({ results, onExport }: Props) {
  const counts = { covered: 0, partial: 0, missing: 0, conflict: 0 };
  for (const result of results) counts[result.status] += 1;
  const rate = results.length
    ? Math.round(((counts.covered + counts.partial * 0.5) / results.length) * 100)
    : 0;

  return (
    <div className="summary-bar">
      <div className="rate-block">
        <span className="rate-value">{rate}<small>%</small></span>
        <span className="rate-label">综合覆盖率</span>
      </div>
      <div className="rate-track" aria-label={`综合覆盖率 ${rate}%`}>
        <span style={{ width: `${rate}%` }} />
      </div>
      <div className="stat-chips">
        <span className="chip ok">已覆盖 {counts.covered}</span>
        <span className="chip warn">部分满足 {counts.partial}</span>
        <span className="chip danger">缺失 {counts.missing}</span>
        <span className="chip conflict">矛盾 {counts.conflict}</span>
      </div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onExport}>
        导出核查报告
      </button>
    </div>
  );
}
