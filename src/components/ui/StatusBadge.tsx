export type StatusTone = 'fault' | 'clear' | 'caution' | 'neutral';

const toneClasses: Record<StatusTone, string> = {
  fault: 'bg-fault-soft text-fault border-fault/20',
  clear: 'bg-clear-soft text-clear border-clear/20',
  caution: 'bg-caution-soft text-[#8a5a05] border-caution/30',
  neutral: 'bg-paper text-ink-muted border-line',
};

export default function StatusBadge({
  tone = 'neutral',
  children,
}: {
  tone?: StatusTone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5
        font-data text-[11px] font-medium uppercase tracking-wide ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
