import { useEffect, useRef } from 'react';
import type { TimelineItem } from '../types';

interface Props {
  items: TimelineItem[];
  streaming: string;
  busy: boolean;
  error: string;
  onCancel: () => void;
}

export function Timeline({ items, streaming, busy, error, onCancel }: Props) {
  const streamRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [streaming]);

  return (
    <section className="panel timeline-panel">
      <div className="panel-head">
        <h3>Agent 工作流</h3>
        {busy && (
          <button type="button" className="link-btn danger" onClick={onCancel}>
            中止
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="empty-hint">上传两份材料后点击「开始核查」，这里会实时显示规划 → 检索 → 判定三个阶段。</p>
      ) : (
        <ol className="timeline">
          {items.map((item, index) => (
            <li key={`${item.at}-${index}`} className={`timeline-item ${item.stage}`}>
              <span className="dot" />
              <div>
                <strong>{item.label}</strong>
                {item.detail && <small>{item.detail}</small>}
                <time>{new Date(item.at).toLocaleTimeString('zh-CN')}</time>
              </div>
            </li>
          ))}
        </ol>
      )}

      {streaming && (
        <div className="stream-box">
          <div className="stream-title">
            <span className="pulse" /> 模型流式输出
          </div>
          <pre ref={streamRef}>{streaming}</pre>
        </div>
      )}

      {error && <div className="error-box">{error}</div>}
    </section>
  );
}
