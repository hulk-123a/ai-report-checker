import { useEffect, useRef } from 'react';
import type { ParsedDoc } from '../types';

interface Props {
  doc: ParsedDoc | null;
  highlightIds: string[];
  jump: { id: string; seq: number } | null;
}

export function ReportViewer({ doc, highlightIds, jump }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!jump) return;
    const target = containerRef.current?.querySelector(`[data-chunk-id="${jump.id}"]`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [jump]);

  return (
    <section className="panel report-panel">
      <div className="panel-head">
        <h3>报告原文</h3>
        <small>{doc ? doc.name : '尚未载入'}</small>
      </div>
      <div className="report-scroll" ref={containerRef}>
        {!doc ? (
          <p className="empty-hint">上传实践报告后，这里按章节展示原文；点击左侧证据引用会自动滚动并高亮对应段落。</p>
        ) : (
          doc.chunks.map((chunk) => (
            <div
              key={chunk.id}
              data-chunk-id={chunk.id}
              className={`report-chunk ${highlightIds.includes(chunk.id) ? 'is-highlight' : ''}`}
            >
              <div className="chunk-meta">
                <span>{chunk.id}</span>
                <span>{chunk.heading}</span>
              </div>
              <p>{chunk.text}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
