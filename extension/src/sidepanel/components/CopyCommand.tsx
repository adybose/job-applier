import { useState } from 'react';

export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="command">
      <code>{command}</code>
      <button type="button" className="small" onClick={copy} aria-label={`Copy command: ${command}`}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
