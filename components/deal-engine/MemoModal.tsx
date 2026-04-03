import React, { useState } from 'react';

interface MemoModalProps {
  content: string;
  isLoading: boolean;
  dealName: string;
  onClose: () => void;
}

// ── Inline markdown renderer ─────────────────────────────────────────────

function parseBold(text: string): React.ReactNode[] {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part,
  );
}

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let keyIdx = 0;

  const flushList = () => {
    if (listItems.length) {
      nodes.push(
        <ul key={`ul-${keyIdx++}`} style={{ margin: '8px 0 12px 0', paddingLeft: 18 }}>
          {listItems}
        </ul>,
      );
      listItems = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      nodes.push(<div key={keyIdx++} style={{ height: 8 }} />);
      continue;
    }

    if (trimmed === '---') {
      flushList();
      nodes.push(
        <hr key={keyIdx++} style={{ border: 'none', borderTop: '1px solid rgba(17,17,17,0.1)', margin: '16px 0' }} />,
      );
      continue;
    }

    if (trimmed.startsWith('# ')) {
      flushList();
      nodes.push(
        <h1
          key={keyIdx++}
          style={{
            fontFamily: 'Lora, serif',
            fontWeight: 700,
            fontSize: 18,
            color: '#111111',
            marginBottom: 4,
            marginTop: 0,
            lineHeight: 1.3,
          }}
        >
          {parseBold(trimmed.slice(2))}
        </h1>,
      );
      continue;
    }

    if (trimmed.startsWith('## ')) {
      flushList();
      nodes.push(
        <h2
          key={keyIdx++}
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 600,
            fontSize: 11,
            color: '#111111',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginTop: 20,
            marginBottom: 6,
          }}
        >
          {trimmed.slice(3)}
        </h2>,
      );
      continue;
    }

    // Italic line (e.g. *Sector · Currency · Date*)
    if (trimmed.startsWith('*') && trimmed.endsWith('*') && !trimmed.startsWith('**')) {
      flushList();
      nodes.push(
        <p
          key={keyIdx++}
          style={{
            fontFamily: 'Lora, serif',
            fontSize: 11,
            color: 'rgba(17,17,17,0.45)',
            fontStyle: 'italic',
            margin: '2px 0 8px 0',
            lineHeight: 1.5,
          }}
        >
          {trimmed.slice(1, -1)}
        </p>,
      );
      continue;
    }

    // Bullet list item
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      listItems.push(
        <li
          key={keyIdx++}
          style={{
            fontFamily: 'Lora, serif',
            fontSize: 12.5,
            color: 'rgba(17,17,17,0.8)',
            lineHeight: 1.7,
            marginBottom: 5,
          }}
        >
          {parseBold(trimmed.slice(2))}
        </li>,
      );
      continue;
    }

    // Regular paragraph
    flushList();
    nodes.push(
      <p
        key={keyIdx++}
        style={{
          fontFamily: 'Lora, serif',
          fontSize: 12.5,
          color: 'rgba(17,17,17,0.8)',
          lineHeight: 1.75,
          margin: '0 0 8px 0',
        }}
      >
        {parseBold(trimmed)}
      </p>,
    );
  }

  flushList();
  return <>{nodes}</>;
}

// ── Modal component ──────────────────────────────────────────────────────

const MemoModal: React.FC<MemoModalProps> = ({ content, isLoading, dealName, onClose }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dealName.replace(/\s+/g, '_')}_investment_memo.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const actionBtnStyle: React.CSSProperties = {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: 'rgba(17,17,17,0.5)',
    border: '1px solid rgba(17,17,17,0.15)',
    background: 'transparent',
    padding: '3px 10px',
    cursor: 'pointer',
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: 'rgba(249,249,247,0.92)' }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          border: '1px solid rgba(17,17,17,0.12)',
          boxShadow: '4px 4px 0px rgba(17,17,17,0.06)',
          width: '92%',
          maxWidth: 760,
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div
          style={{
            borderBottom: '1px solid rgba(17,17,17,0.1)',
            padding: '10px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ width: 20, borderTop: '2px solid #CC0000', marginBottom: 5 }} />
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'rgba(17,17,17,0.4)',
              }}
            >
              Investment Memo
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {!isLoading && (
              <>
                <button onClick={handleCopy} style={actionBtnStyle}>
                  {copied ? 'Copied ✓' : 'Copy'}
                </button>
                <button onClick={handleDownload} style={actionBtnStyle}>
                  Download .md
                </button>
              </>
            )}
            <button
              onClick={onClose}
              style={{
                color: 'rgba(17,17,17,0.3)',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 14,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '0 4px',
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          {isLoading ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: 280,
                gap: 14,
              }}
            >
              <div
                className="animate-spin"
                style={{
                  width: 24,
                  height: 24,
                  border: '2px solid rgba(17,17,17,0.08)',
                  borderTopColor: '#CC0000',
                  borderRadius: '50%',
                }}
              />
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                  color: 'rgba(17,17,17,0.4)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}
              >
                Drafting memo...
              </span>
              <span
                style={{
                  fontFamily: 'Lora, serif',
                  fontSize: 12,
                  color: 'rgba(17,17,17,0.3)',
                  maxWidth: 240,
                  textAlign: 'center',
                  lineHeight: 1.6,
                }}
              >
                Synthesising deal data into IC-grade memo
              </span>
            </div>
          ) : (
            renderMarkdown(content)
          )}
        </div>
      </div>
    </div>
  );
};

export default MemoModal;
