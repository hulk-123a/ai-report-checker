import { useEffect, useRef, useState } from 'react';
import type { DocKind, ParsedDoc } from '../types';

interface Props {
  kind: DocKind;
  title: string;
  hint: string;
  doc: ParsedDoc | null;
  disabled: boolean;
  onFile: (file: File) => void;
  onImage: (file: File) => void;
  onText: (text: string) => void;
  onVoice: () => void;
  listening: boolean;
  voiceDraft: string;
  speechSupported: boolean;
}

export function UploadPanel({
  kind,
  title,
  hint,
  doc,
  disabled,
  onFile,
  onImage,
  onText,
  onVoice,
  listening,
  voiceDraft,
  speechSupported,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const accept = '.pdf,.docx,.txt,.md,.markdown,.png,.jpg,.jpeg,.webp,.bmp';
  const prefix = kind === 'task' ? '任务书' : '报告';

  // 语音听写过程中，把实时转写显示在粘贴草稿框，便于用户直观看到多模态输入
  useEffect(() => {
    if (listening && voiceDraft) setDraft(voiceDraft);
  }, [listening, voiceDraft]);

  const handleFile = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(ext)) onImage(file);
    else onFile(file);
  };

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
          if (file && !disabled) handleFile(file);
        }}
      >
        <span className="drop-icon">↑</span>
        <strong>{doc ? doc.name : `点击或拖入${prefix}文件`}</strong>
        <small>{doc ? `${doc.text.length} 字符 · ${doc.chunks.length} 个可检索片段` : '支持 PDF / DOCX / TXT / MD · 图片截图（OCR）'}</small>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) handleFile(file);
          event.target.value = '';
        }}
      />
      <input
        ref={imageRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/bmp"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onImage(file);
          event.target.value = '';
        }}
      />

      <div className="multimodal-bar">
        <button
          type="button"
          className={`mm-btn ${listening ? 'is-listening' : ''}`}
          onClick={onVoice}
          disabled={disabled || !speechSupported}
          title={speechSupported ? '浏览器端语音识别，无需密钥' : '当前浏览器不支持语音识别'}
        >
          <span className="mm-dot" />
          {listening ? '停止听写' : '🎙 语音口述'}
        </button>
        <button
          type="button"
          className="mm-btn"
          onClick={() => !disabled && imageRef.current?.click()}
          disabled={disabled}
          title="上传截图，由视觉模型 OCR 识别"
        >
          🖼 图片识别
        </button>
        <button type="button" className="link-btn" onClick={() => setPasteOpen((value) => !value)}>
          {pasteOpen ? '收起' : '粘贴文字'}
        </button>
      </div>

      {!speechSupported && (
        <small className="mm-hint">语音识别需 Chrome / Edge；图片识别需在服务端启用视觉模型。</small>
      )}

      {pasteOpen && (
        <div className="paste-box">
          <textarea
            value={draft}
            placeholder={`把${prefix}全文粘贴到这里，或点击上方语音口述…`}
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
