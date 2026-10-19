import { useCallback, useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';

export default function Dropzone({
  onFiles,
  accept,
  multiple = true,
  hint = 'Glissez vos fichiers ici ou cliquez pour parcourir',
}: {
  onFiles: (files: FileList) => void;
  accept?: string;
  multiple?: boolean;
  hint?: string;
}) {
  const [isOver, setIsOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsOver(false);
      if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
    },
    [onFiles],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={handleDrop}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2
        border-dashed p-10 text-center transition-colors duration-150
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steel
        ${isOver ? 'border-steel bg-steel/5' : 'border-line bg-paper hover:border-steel/40'}`}
    >
      <UploadCloud className="text-steel" size={28} aria-hidden="true" />
      <p className="text-sm font-medium text-ink-muted">{hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => e.target.files && onFiles(e.target.files)}
      />
    </div>
  );
}
