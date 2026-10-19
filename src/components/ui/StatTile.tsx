export default function StatTile({
  value,
  label,
  className = '',
}: {
  value: string | number;
  label: string;
  className?: string;
}) {
  return (
    <div className={`flex items-baseline gap-2 ${className}`}>
      <span className="font-data text-xl font-bold text-white">{value}</span>
      <span className="font-data text-[9px] uppercase tracking-[0.16em] text-white/55">{label}</span>
    </div>
  );
}
