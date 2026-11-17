import { STATUS_META } from '../lib/export';
import type { CheckResult, EvidenceBundle, Requirement } from '../types';

interface Props {
  requirements: Requirement[];
  results: CheckResult[];
  bundles: EvidenceBundle[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onJump: (chunkId: string) => void;
}

export function CheckMatrix({ requirements, results, bundles, activeId, onSelect, onJump }: Props) {
  return (
    <div className="matrix">
      {requirements.map((requirement) => {
        const result = results.find((item) => item.id === requirement.id);
        const meta = STATUS_META[result?.status ?? 'missing'];
        const bundle = bundles.find((item) => item.requirementId === requirement.id);
        const active = activeId === requirement.id;

        return (
          <article key={requirement.id} className={`matrix-item ${active ? 'is-active' : ''}`}>
            <button type="button" className="matrix-head" onClick={() => onSelect(requirement.id)}>
              <span className="qid">{requirement.id}</span>
              <span className="qtitle">{requirement.title}</span>
              <span className="qtag">{requirement.category}</span>
              <span className={`status ${meta.tone}`}>{meta.icon} {meta.label}</span>
              <span className="chevron">{active ? '−' : '+'}</span>
            </button>

            {active && (
              <div className="matrix-body">
                <div className="field">
                  <label>任务书要求</label>
                  <p>{requirement.requirement}</p>
                </div>
                <div className="field">
                  <label>判定理由 <span className="confidence">置信度 {Math.round((result?.confidence ?? 0) * 100)}%</span></label>
                  <p>{result?.reason ?? '暂无判定结果'}</p>
                </div>
                <div className="field">
                  <label>报告原文证据</label>
                  {result?.evidence.length ? (
                    <ul className="evidence-list">
                      {result.evidence.map((evidence, index) => (
                        <li key={`${evidence.chunkId}-${index}`}>
                          <button type="button" onClick={() => onJump(evidence.chunkId)} title="点击定位到报告原文">
                            <span className="chunk-id">{evidence.chunkId}</span>
                            <q>{evidence.quote}</q>
                            <span className="locate">定位 →</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="no-evidence">未检索到可引用证据 —— 按防幻觉规则判定为缺失 / 部分满足</p>
                  )}
                </div>
                <div className="field">
                  <label>修改建议</label>
                  <p className="suggestion">{result?.suggestion ?? '—'}</p>
                </div>
                {bundle && bundle.chunkIds.length > 0 && (
                  <div className="retrieve-line">
                    <span>检索命中</span>
                    {bundle.chunkIds.map((id, index) => (
                      <button type="button" key={id} onClick={() => onJump(id)}>
                        {id}<small>{bundle.scores[index]?.toFixed(1)}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
