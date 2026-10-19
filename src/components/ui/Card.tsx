import type { HTMLAttributes } from 'react';

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-2xl border border-line bg-panel p-6 shadow-sm ${className}`}
      {...props}
    />
  );
}

export function KpiCard({
  label,
  value,
  tone = 'neutral',
  className = '',
}: {
  label: string;
  value: string | number;
  tone?: 'neutral' | 'fault' | 'clear' | 'caution';
  className?: string;
}) {
  const toneClasses: Record<string, string> = {
    neutral: 'text-ink',
    fault: 'text-fault',
    clear: 'text-clear',
    caution: 'text-caution',
  };
  return (
    <Card className={`flex flex-col gap-1 ${className}`}>
      <span className="font-data text-[11px] uppercase tracking-wider text-ink-muted">
        {label}
      </span>
      <span className={`font-display text-3xl font-bold ${toneClasses[tone]}`}>{value}</span>
    </Card>
  );
}

export default Card;
