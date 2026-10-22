import { useState } from 'react';
import { Spinner } from './ui';

/** The dashed "drop a file here or click" area of the import dialogs; the file input lives with the caller. */
export default function FileDrop({ icon, title, busyTitle, hint, busy, onPick, onFile }: {
  icon: string;
  title: string;
  busyTitle: string;
  hint: string;
  busy: boolean;
  onPick: () => void;
  onFile: (file: File) => void;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <button
      type="button"
      aria-busy={busy}
      className={`flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition duration-200 ${dragging ? 'scale-[1.01] border-accent bg-accent-soft' : 'border-line hover:border-accent hover:bg-surface-2/50'}`}
      onClick={onPick}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
    >
      <span className={`text-4xl transition-transform duration-300 ${dragging ? '-translate-y-1' : ''}`} aria-hidden>{icon}</span>
      <span className="flex items-center gap-2 font-semibold">{busy && <Spinner label={busyTitle} />}{busy ? busyTitle : title}</span>
      <span className="text-sm text-ink-2">{hint}</span>
    </button>
  );
}
