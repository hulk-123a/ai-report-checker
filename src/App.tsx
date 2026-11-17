import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckMatrix } from './components/CheckMatrix';
import { ReportViewer } from './components/ReportViewer';
import { SummaryBar } from './components/SummaryBar';
import { Timeline } from './components/Timeline';
import { UploadPanel } from './components/UploadPanel';
import { buildMarkdown, downloadText } from './lib/export';
import { isSpeechSupported } from './lib/multimodal';
import { useChecker } from './state/useChecker';

export default function App() {
  const {
    state,
    loadFile,
    loadText,
    loadImage,
    toggleVoice,
    run,
    cancel,
    loadDemo,
    reset,
    busy,
  } = useChecker();
  const speechSupported = isSpeechSupported();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [jump, setJump] = useState<{ id: string; seq: number } | null>(null);
  const seqRef = useRef(0);

  // 出结果后默认展开最需要关注的一条（优先非「已覆盖」）
  useEffect(() => {
    if (state.results.length > 0 && !activeId) {
      const focus = state.results.find((item) => item.status !== 'covered') ?? state.results[0];
      setActiveId(focus.id);
    }
  }, [state.results, activeId]);

  const highlightIds = useMemo(() => {
    const ids = new Set<string>();
    if (!activeId) return [];
    state.results.find((item) => item.id === activeId)?.evidence.forEach((item) => ids.add(item.chunkId));
    state.bundles
      .find((item) => item.requirementId === activeId)
      ?.chunkIds.slice(0, 2)
      .forEach((id) => ids.add(id));
    return [...ids];
  }, [activeId, state.results, state.bundles]);

  const handleJump = (id: string) => {
    seqRef.current += 1;
    setJump({ id, seq: seqRef.current });
  };

  const handleReset = () => {
    reset();
    setActiveId(null);
    setJump(null);
  };

  const handleExport = () => {
    if (!state.task || !state.report) return;
    const markdown = buildMarkdown(state.task, state.report, state.requirements, state.results);
    downloadText(`核查报告-${new Date().toISOString().slice(0, 10)}.md`, markdown);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="logo">镜</div>
          <div>
            <h1>核查镜</h1>
            <p>实训任务书 ↔ 实践报告 · 一致性核查 Agent</p>
          </div>
        </div>
        <div className="header-actions">
          <span className="tech-tags">React · Function Calling · MCP · RAG · 多模态</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={loadDemo} disabled={busy}>
            离线演示
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleReset} disabled={busy}>
            重置
          </button>
          {busy ? (
            <button type="button" className="btn btn-primary" onClick={cancel}>
              中止核查
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={run}
              disabled={!state.task || !state.report}
            >
              开始核查
            </button>
          )}
        </div>
      </header>

      <main className="layout">
        <aside className="left-col">
          <UploadPanel
            kind="task"
            title="实训任务书"
            hint="核查依据 · 要求的来源"
            doc={state.task}
            disabled={busy}
            onFile={(file) => loadFile('task', file)}
            onImage={(file) => loadImage('task', file)}
            onText={(text) => loadText('task', text, '粘贴的任务书.txt')}
            onVoice={() => toggleVoice('task')}
            listening={state.listening && state.voiceDraft !== ''}
            voiceDraft={state.voiceDraft}
            speechSupported={speechSupported}
          />
          <UploadPanel
            kind="report"
            title="实践报告"
            hint="被核查对象 · 证据的来源"
            doc={state.report}
            disabled={busy}
            onFile={(file) => loadFile('report', file)}
            onImage={(file) => loadImage('report', file)}
            onText={(text) => loadText('report', text, '粘贴的实践报告.txt')}
            onVoice={() => toggleVoice('report')}
            listening={state.listening && state.voiceDraft !== ''}
            voiceDraft={state.voiceDraft}
            speechSupported={speechSupported}
          />
          <Timeline
            items={state.timeline}
            streaming={state.streaming}
            busy={busy}
            error={state.error}
            onCancel={cancel}
          />
        </aside>

        <section className="center-col">
          {state.results.length > 0 ? (
            <>
              <SummaryBar results={state.results} onExport={handleExport} />
              <CheckMatrix
                requirements={state.requirements}
                results={state.results}
                bundles={state.bundles}
                activeId={activeId}
                onSelect={setActiveId}
                onJump={handleJump}
              />
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">◎</div>
              <h2>把「要求」和「证据」对齐</h2>
              <p>AI Agent 会先拆解任务书，再逐条到报告中检索取证，最后给出可追溯的一致性结论。</p>
              <ol>
                <li><span>1</span> 上传任务书与实践报告：支持 PDF / DOCX / TXT / MD，也支持图片截图 OCR、语音口述</li>
                <li><span>2</span> 点击「开始核查」，观察 Agent 通过 Function Calling 自主调用检索工具取证</li>
                <li><span>3</span> 逐条查看结论，点击证据引用跳转报告原文，导出可追溯的核查报告</li>
              </ol>
              <button type="button" className="btn btn-ghost" onClick={loadDemo} disabled={busy}>
                暂无材料？先看离线演示
              </button>
              <small>文档在浏览器本地解析，仅检索命中的片段会发送给模型；密钥只存服务端。</small>
            </div>
          )}
        </section>

        <aside className="right-col">
          <ReportViewer doc={state.report} highlightIds={highlightIds} jump={jump} />
        </aside>
      </main>

      <footer className="app-footer">
        <span>核查镜 · AI WEB 网页开发挑战赛参赛作品</span>
        <span>AI 结论仅供辅助，最终以人工复核为准 · 文档原文不落服务器</span>
      </footer>
    </div>
  );
}
