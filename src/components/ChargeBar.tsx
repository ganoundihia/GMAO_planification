import { Tooltip } from 'react-tooltip';

interface Props {
  value_h: number;
  cap_h: number;
  jours_dispo: number;
  technicien: string;
}

export default function ChargeBar({ value_h, cap_h, jours_dispo, technicien }: Props) {
  const maxH = cap_h * jours_dispo;
  const pct = maxH > 0 ? Math.min((value_h / maxH) * 100, 100) : 0;
  const moyParJ = jours_dispo > 0 ? value_h / jours_dispo : 0;
  const isOver = value_h > maxH;
  const isWarning = !isOver && moyParJ > cap_h * 0.8;

  const color = isOver ? '#E24B4A' : isWarning ? '#EF9F27' : '#1D9E75';
  const bgClass = isOver ? 'bg-red-50' : isWarning ? 'bg-amber-50' : 'bg-green-50';

  const h = Math.floor(value_h);
  const m = Math.round((value_h - h) * 60);
  const tooltipId = `cb-${technicien.replace(/\s/g, '')}`;

  return (
    <div className={`rounded-lg p-3 ${bgClass} border ${isOver ? 'border-red-200' : isWarning ? 'border-amber-200' : 'border-green-200'}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-slate-700">{technicien}</span>
        <span className="text-xs font-mono text-slate-600">{h}h {m > 0 ? `${m}m` : ''} / {maxH}h cap</span>
      </div>
      <div className="w-full bg-white rounded-full h-5 overflow-hidden border border-slate-200 relative">
        <div
          className="h-full rounded-full transition-all duration-500 relative"
          style={{ width: `${pct}%`, backgroundColor: color }}
          data-tooltip-id={tooltipId}
          data-tooltip-content={`${h}h ${m}min sur ${jours_dispo} j — ${Math.round(moyParJ * 60)}min/j moy. — ${maxH > 0 ? Math.round(value_h / maxH * 1000) / 10 : 0}% du cap`}
        />
        {isOver && (
          <div className="absolute top-0 right-0 h-full w-1 bg-red-600 rounded-full" style={{ left: '100%' }} />
        )}
      </div>
      <Tooltip id={tooltipId} place="top" className="!text-xs !z-50" />
    </div>
  );
}
