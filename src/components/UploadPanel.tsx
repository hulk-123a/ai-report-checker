import { useRef, useState } from 'react';
import type { DocKind, ParsedDoc } from '../types';

interface Props {
  kind: DocKind;
  title: string;
  hint: string;
  doc: ParsedDoc | null;
  disabled: boolean;
  onFile: (file: File) => void;
  onText: (text: string) => void;
}

export function UploadPanel({ kind, title, hint, doc, disabled, onFile, onText }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const accept = '.pdf,.docx,.txt,.md,.markdown';
  const prefix = kind === 'task' ? '任务书' : '报告';

  return (
    <section className={`upload-card ${doc ? 'is-ready' : ''}`}>
      <div className="upload-head">
        <span className="upload-index">{kind === 'task' ? '01' : '02'}</span>
        <div>
          <h3>{title}</h3>
          <p>{hint}</p>
        </div>
        {doc && <span className="ready-badge">已就绪</span>}
      </div>

      <div
        className={`dropzone ${dragOver ? 'is-over' : ''} ${disabled ? 'is-disabled' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === ' ') && !disabled) inputRef.current?.click();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          const file = event.dataTransfer.files[0];
          if (file && !disabled) onFile(file);
        }}
      >
        <span className="drop-icon">↑</span>
        <strong>{doc ? doc.name : `点击或拖入${prefix}文件`}</strong>
        <small>{doc ? `${doc.text.length} 字符 · ${doc.chunks.length} 个可检索片段` : '支持 PDF / DOCX / TXT / MD'}</small>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = '';
        }}
      />

      <button type="button" className="link-btn" onClick={() => setPasteOpen((value) => !value)}>
        {pasteOpen ? '收起粘贴入口' : '没有文件？直接粘贴文字'}
      </button>

      {pasteOpen && (
        <div className="paste-box">
          <textarea
            value={draft}
            placeholder={`把${prefix}全文粘贴到这里…`}
            onChange={(event) => setDraft(event.target.value)}
            rows={5}
          />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={disabled || draft.trim().length < 30}
            onClick={() => {
              onText(draft);
              setPasteOpen(false);
            }}
          >
            使用这段文本
          </button>
        </div>
      )}
    </section>
  );
}
