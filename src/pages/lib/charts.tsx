// lib/charts.tsx
// ══════════════════════════════════════════════════════════════════════════════
//  Primitives d'affichage analytique : panneaux, bandeaux de chiffres et
//  graphiques en SVG pur (aucune dépendance externe).
//
//  Parti pris graphique : à plat. Pas de dégradé, pas d'ombre portée, pas de
//  halo. Un seul accent, des bordures fines, de la densité.
//
//  MàJ : bandeau de statistiques (GroupBar) repensé en pastilles colorées avec
//  compteur animé pour une meilleure lisibilité, + WeeklyProgress pour la
//  progression semaine par semaine en vue mensuelle.
// ══════════════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

// ─── Palette ─────────────────────────────────────────────────────────────────
export const C = {
  ink: '#0a1930',
  accent: '#2f6690',
  accentSoft: '#8fb3cc',
  gold: '#c8901a',
  grid: '#eceff4',
  axis: '#9aa5b8',
  muted: '#7b879d',
  line: '#e4e8ef',
  done: '#1f9d6b',
  wip: '#d99400',
  plan: '#4a86b8',
  late: '#c8384c',
};

// ═══ Compteur animé (indépendant, utilisé par GroupBar) ═════════════════════
function CountUp({ value, className = '', duration = 650 }: { value: number; className?: string; duration?: number }) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; prev.current = value; setDisplay(value); return; }
    const from = prev.current;
    const to = value;
    prev.current = value;
    if (from === to) { setDisplay(to); return; }
    let start: number | null = null;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const step = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      setDisplay(Math.round(from + (to - from) * ease(p)));
      if (p < 1) requestAnimationFrame(step); else setDisplay(to);
    };
    const id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <span className={className}>{display.toLocaleString('fr-FR')}</span>;
}

// ═══ Panneau ═════════════════════════════════════════════════════════════════
export function Panel({ icon: Icon, title, right, children, className = '', bodyClass = 'p-4' }: {
  icon?: any; title: string; right?: ReactNode; children: ReactNode;
  className?: string; bodyClass?: string;
}) {
  return (
    <div className={`bg-white border border-[#e4e8ef] rounded-[10px] flex flex-col transition-all duration-200 hover:border-[#d3dce9] hover:shadow-[0_6px_18px_-12px_rgba(10,25,48,0.35)] ${className}`}>
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-[#eceff4]">
        {Icon && (
          <span className="w-6 h-6 rounded-md bg-[#eef3f8] flex items-center justify-center shrink-0">
            <Icon size={12} className="text-[#2f6690]" />
          </span>
        )}
        <h3 className="text-[12.5px] font-semibold text-[#0a1930] flex-1 min-w-0 truncate">{title}</h3>
        {right}
      </div>
      <div className={`flex-1 min-w-0 ${bodyClass}`}>{children}</div>
    </div>
  );
}

// ═══ Bandeau de groupe : titre + chiffres en pastilles colorées animées ═════
export function GroupBar({ icon: Icon, title, stats, right }: {
  icon?: any; title: string;
  stats: Array<{ label: string; value: number | string; tone?: 'ink' | 'done' | 'wip' | 'late' | 'muted' }>;
  right?: ReactNode;
}) {
  const TONE: Record<string, { text: string; bg: string; ring: string; barFrom: string; barTo: string }> = {
    ink:   { text: '#0a1930', bg: '#eef2f8', ring: '#dbe3f0', barFrom: '#0a1930', barTo: '#2f6690' },
    done:  { text: '#157a54', bg: '#e7f7ef', ring: '#c3ecda', barFrom: '#1f9d6b', barTo: '#57cf9c' },
    wip:   { text: '#a2740f', bg: '#fdf3e2', ring: '#f3e0b3', barFrom: '#d99400', barTo: '#f0b429' },
    late:  { text: '#a72c3d', bg: '#fdedf0', ring: '#f5c9cf', barFrom: '#c8384c', barTo: '#ef8090' },
    muted: { text: '#5c6a85', bg: '#f4f6fa', ring: '#e4e8ef', barFrom: '#9aa5b8', barTo: '#c4ccdb' },
  };

  return (
    <div className="bg-white border border-[#e4e8ef] rounded-[12px] px-4 py-3.5 flex items-center gap-4 flex-wrap shadow-[0_1px_3px_rgba(10,25,48,0.05)] transition-shadow duration-200 hover:shadow-[0_4px_14px_-6px_rgba(10,25,48,0.18)]">
      <div className="flex items-center gap-2.5 shrink-0">
        {Icon && (
          <span className="w-8 h-8 rounded-[9px] bg-[#0a1930] flex items-center justify-center">
            <Icon size={14} className="text-white" />
          </span>
        )}
        <h2 className="text-[14px] font-bold text-[#0a1930] tracking-tight">{title}</h2>
      </div>

      <div className="flex items-stretch gap-2 flex-wrap ml-auto">
        {stats.map((s, idx) => {
          const t = TONE[s.tone || 'ink'];
          const numeric = typeof s.value === 'number';
          return (
            <div
              key={s.label}
              className="relative flex flex-col justify-center min-w-[76px] px-3 py-1.5 rounded-[10px] border overflow-hidden transition-transform duration-200 hover:-translate-y-[3px] hover:shadow-sm cursor-default"
              style={{
                background: t.bg,
                borderColor: t.ring,
                animation: `groupbar-in .4s cubic-bezier(.22,.9,.32,1) ${idx * 45}ms both`,
              }}
            >
              <span
                className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-[10px]"
                style={{ background: `linear-gradient(180deg, ${t.barFrom}, ${t.barTo})` }}
              />
              <span className="text-[9.5px] font-bold uppercase tracking-wider pl-1.5" style={{ color: t.text, opacity: 0.75 }}>
                {s.label}
              </span>
              <b className="text-[17px] font-extrabold tabular-nums leading-tight pl-1.5" style={{ color: t.text }}>
                {numeric ? <CountUp value={s.value as number} /> : s.value}
              </b>
            </div>
          );
        })}
        {right}
      </div>

      <style>{`
        @keyframes groupbar-in {
          from { opacity: 0; transform: translateY(4px) scale(.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

// ═══ Progression hebdomadaire (semaines d'un mois) ═══════════════════════════
export interface SemaineStat {
  semaine: number;
  label: string;
  total: number;
  done: number;
  enCours: number;
  plan: number;
  reportees: number;
  late: number;
  pct: number;
}

export function WeeklyProgress({ data, selected, onSelect }: {
  data: SemaineStat[];
  selected: number | null;
  onSelect: (semaine: number | null) => void;
}) {
  if (data.length === 0) {
    return <p className="text-center text-[11.5px] text-[#7b879d] py-6">Aucune intervention ce mois-ci</p>;
  }

  return (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${Math.min(data.length, 5)}, minmax(0,1fr))` }}>
      {data.map((d, idx) => {
        const isSel = selected === d.semaine;
        const barColor = d.pct >= 80 ? '#57cf9c' : d.pct >= 50 ? '#f0b429' : '#ef8090';
        return (
          <button
            key={d.semaine}
            onClick={() => onSelect(isSel ? null : d.semaine)}
            style={{ animation: `wk-in .35s cubic-bezier(.22,.9,.32,1) ${idx * 55}ms both` }}
            className={`text-left rounded-[11px] border p-3 transition-all duration-200 group ${
              isSel
                ? 'bg-[#0a1930] border-[#0a1930] shadow-[0_10px_24px_-12px_rgba(10,25,48,0.55)] -translate-y-[3px]'
                : 'bg-white border-[#e4e8ef] hover:border-[#c4ccdb] hover:-translate-y-[3px] hover:shadow-[0_8px_18px_-12px_rgba(10,25,48,0.3)]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-[11.5px] font-bold ${isSel ? 'text-white' : 'text-[#0a1930]'}`}>{d.label}</span>
              <span className={`text-[10px] font-semibold tabular-nums ${isSel ? 'text-white/60' : 'text-[#7b879d]'}`}>
                {d.total} int.
              </span>
            </div>

            <div className={`mt-2.5 h-[6px] rounded-full overflow-hidden ${isSel ? 'bg-white/15' : 'bg-[#f4f6fa]'}`}>
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{ width: `${d.total > 0 ? (d.done / d.total) * 100 : 0}%`, background: isSel ? '#8fd8ec' : barColor }}
              />
            </div>

            <div className="mt-2 flex items-end justify-between">
              <span className={`text-[18px] font-extrabold tabular-nums leading-none ${isSel ? 'text-white' : 'text-[#0a1930]'}`}>
                {d.pct}%
              </span>
              {d.late > 0 ? (
                <span className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded-md tabular-nums ${
                  isSel ? 'bg-white/15 text-[#ef8090]' : 'bg-[#fdecee] text-[#c8384c]'
                }`}>
                  {d.late} retard{d.late > 1 ? 's' : ''}
                </span>
              ) : (
                <span className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded-md ${
                  isSel ? 'bg-white/15 text-[#8fd8ec]' : 'bg-[#e7f7ef] text-[#1f9d6b]'
                }`}>
                  à jour
                </span>
              )}
            </div>
          </button>
        );
      })}

      <style>{`
        @keyframes wk-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ═══ Sélecteur discret ═══════════════════════════════════════════════════════
export function MiniSelect<T extends string | number>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }>;
}) {
  return (
    <select
      value={String(value)}
      onChange={e => {
        const raw = e.target.value;
        const match = options.find(o => String(o.value) === raw);
        if (match) onChange(match.value);
      }}
      className="text-[11px] text-[#44537a] bg-white border border-[#e4e8ef] rounded-md px-2 py-1 outline-none focus:border-[#2f6690] cursor-pointer transition-colors"
    >
      {options.map(o => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
    </select>
  );
}

// ═══ Légende ═════════════════════════════════════════════════════════════════
export function Legend({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <div className="flex items-center justify-center gap-4 flex-wrap mt-3">
      {items.map(i => (
        <span key={i.label} className="flex items-center gap-1.5 text-[10px] text-[#7b879d]">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

// ═══ Barres verticales groupées ══════════════════════════════════════════════
export function GroupedBars({ data, series, height = 190, onBarClick, yTicks = 4 }: {
  data: Array<{ label: string; values: number[]; key?: string | number }>;
  series: Array<{ name: string; color: string }>;
  height?: number;
  onBarClick?: (index: number) => void;
  yTicks?: number;
}) {
  const W = 640, H = height, PAD_L = 34, PAD_B = 26, PAD_T = 10, PAD_R = 6;
  const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;
  const max = Math.max(1, ...data.flatMap(d => d.values));
  const step = plotW / Math.max(1, data.length);
  const barW = Math.min(13, (step - 8) / series.length);
  const groupW = barW * series.length + 2 * (series.length - 1);

  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => Math.round((max / yTicks) * i));

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
        {ticks.map(t => {
          const y = PAD_T + plotH - (t / max) * plotH;
          return (
            <g key={t}>
              <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke={C.grid} strokeWidth="1" />
              <text x={PAD_L - 6} y={y + 3} textAnchor="end" fontSize="9" fill={C.axis} fontFamily="ui-monospace, monospace">{t}</text>
            </g>
          );
        })}

        {data.map((d, di) => {
          const gx = PAD_L + di * step + (step - groupW) / 2;
          return (
            <g key={d.key ?? d.label}
              onClick={() => onBarClick?.(di)}
              style={{ cursor: onBarClick ? 'pointer' : 'default' }}>
              <rect x={PAD_L + di * step} y={PAD_T} width={step} height={plotH} fill="transparent">
                <title>{`${d.label} — ${series.map((s, si) => `${s.name} ${d.values[si]}`).join(' · ')}`}</title>
              </rect>
              {series.map((s, si) => {
                const v = d.values[si] || 0;
                const h = (v / max) * plotH;
                return (
                  <rect key={s.name}
                    x={gx + si * (barW + 2)} y={PAD_T + plotH - h}
                    width={barW} height={Math.max(v > 0 ? 2 : 0, h)}
                    rx="2" fill={s.color}
                    style={{ transition: 'height .5s ease, y .5s ease' }}>
                    <title>{`${d.label} · ${s.name} : ${v}`}</title>
                  </rect>
                );
              })}
              <text x={PAD_L + di * step + step / 2} y={H - 8} textAnchor="middle"
                fontSize="9" fill={C.axis}>{d.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ═══ Barres horizontales ═════════════════════════════════════════════════════
export function HorizontalBars({ data, color = C.accent, onRowClick, maxRows = 8, unit = '' }: {
  data: Array<{ label: string; value: number; sub?: string; key?: string | number }>;
  color?: string;
  onRowClick?: (index: number) => void;
  maxRows?: number;
  unit?: string;
}) {
  const rows = data.slice(0, maxRows);
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => (
        <div key={r.key ?? r.label}
          onClick={() => onRowClick?.(i)}
          className={`flex items-center gap-3 ${onRowClick ? 'cursor-pointer group' : ''}`}>
          <span className="w-[70px] shrink-0 text-[11px] font-medium text-[#0a1930] truncate" title={r.label}>
            {r.label}
          </span>
          <div className="flex-1 h-[18px] bg-[#f4f6fa] rounded-[3px] overflow-hidden relative">
            <div className="h-full rounded-[3px] transition-all duration-700 group-hover:opacity-80"
              style={{ width: `${(r.value / max) * 100}%`, background: color }} />
          </div>
          <span className="w-14 shrink-0 text-right text-[11px] font-semibold text-[#0a1930] tabular-nums">
            {r.value}{unit}
          </span>
          {r.sub && <span className="w-12 shrink-0 text-right text-[10px] text-[#7b879d] tabular-nums">{r.sub}</span>}
        </div>
      ))}
    </div>
  );
}

// ═══ Anneau à cercles superposés ═════════════════════════════════════════════
export function OverlapDonut({ parts, size = 190 }: {
  parts: Array<{ label: string; value: number; color: string }>;
  size?: number;
}) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const sorted = [...parts].sort((a, b) => b.value - a.value).slice(0, 3);

  // Rayons proportionnels à la part, cercles décalés comme sur la référence
  const positions = [
    { cx: 0.38, cy: 0.5, r: 0.34 },
    { cx: 0.68, cy: 0.42, r: 0.26 },
    { cx: 0.66, cy: 0.72, r: 0.17 },
  ];

  return (
    <div className="flex items-center justify-center" style={{ height: size }}>
      <svg viewBox="0 0 200 200" style={{ width: size, height: size }}>
        {sorted.map((p, i) => {
          const pos = positions[i];
          if (!pos) return null;
          const pct = Math.round((p.value / total) * 100);
          return (
            <g key={p.label}>
              <circle cx={pos.cx * 200} cy={pos.cy * 200} r={pos.r * 200} fill={p.color}>
                <title>{`${p.label} : ${p.value} (${pct}%)`}</title>
              </circle>
              <text x={pos.cx * 200} y={pos.cy * 200 + 6}
                textAnchor="middle" fontSize={i === 0 ? 22 : i === 1 ? 17 : 13}
                fontWeight="700" fill="#fff">{pct}%</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ═══ Jauge en arc ════════════════════════════════════════════════════════════
export function ArcGauge({ value, label, sublabel, color = C.late, height = 168 }: {
  value: number; label: string; sublabel?: string; color?: string; height?: number;
}) {
  const R = 72, CX = 100, CY = 100, W = 16;
  const pct = Math.max(0, Math.min(100, value));
  const angle = Math.PI * (1 - pct / 100);
  const arc = (from: number, to: number) => {
    const x1 = CX + R * Math.cos(from), y1 = CY - R * Math.sin(from);
    const x2 = CX + R * Math.cos(to), y2 = CY - R * Math.sin(to);
    const large = Math.abs(to - from) > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`;
  };
  const knobX = CX + R * Math.cos(angle);
  const knobY = CY - R * Math.sin(angle);

  return (
    <div className="flex flex-col items-center justify-center" style={{ minHeight: height }}>
      <svg viewBox="0 0 200 122" style={{ width: 210, height: 128 }}>
        <path d={arc(Math.PI, 0)} fill="none" stroke="#e9edf3" strokeWidth={W} strokeLinecap="round" />
        <path d={arc(Math.PI, angle)} fill="none" stroke={color} strokeWidth={W} strokeLinecap="round"
          style={{ transition: 'd .6s ease' }} />
        <circle cx={knobX} cy={knobY} r="8" fill="#fff" stroke={color} strokeWidth="4"
          style={{ transition: 'cx .6s ease, cy .6s ease' }} />
      </svg>
      <div className="-mt-9 text-center">
        <p className="text-[26px] font-bold text-[#0a1930] leading-none tabular-nums">{label}</p>
        {sublabel && <p className="text-[10.5px] text-[#7b879d] mt-1">{sublabel}</p>}
      </div>
    </div>
  );
}

// ═══ Courbe multi-séries ═════════════════════════════════════════════════════
export function LineChart({ labels, series, height = 190, onPointClick }: {
  labels: string[];
  series: Array<{ name: string; color: string; values: number[]; dashed?: boolean }>;
  height?: number;
  onPointClick?: (index: number) => void;
}) {
  const W = 640, H = height, PAD_L = 32, PAD_B = 24, PAD_T = 10, PAD_R = 8;
  const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;
  const max = Math.max(1, ...series.flatMap(s => s.values));
  const stepX = plotW / Math.max(1, labels.length - 1);
  const xy = (i: number, v: number) => [PAD_L + i * stepX, PAD_T + plotH - (v / max) * plotH];
  const ticks = Array.from({ length: 5 }, (_, i) => Math.round((max / 4) * i));

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
        {ticks.map(t => {
          const y = PAD_T + plotH - (t / max) * plotH;
          return (
            <g key={t}>
              <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke={C.grid} strokeWidth="1" />
              <text x={PAD_L - 6} y={y + 3} textAnchor="end" fontSize="9" fill={C.axis} fontFamily="ui-monospace, monospace">{t}</text>
            </g>
          );
        })}

        {series.map(s => (
          <polyline key={s.name} fill="none" stroke={s.color} strokeWidth="2"
            strokeLinejoin="round" strokeLinecap="round"
            strokeDasharray={s.dashed ? '4 3' : undefined}
            points={s.values.map((v, i) => xy(i, v).join(',')).join(' ')} />
        ))}

        {labels.map((l, i) => (
          <g key={l} onClick={() => onPointClick?.(i)} style={{ cursor: onPointClick ? 'pointer' : 'default' }}>
            <rect x={PAD_L + i * stepX - stepX / 2} y={PAD_T} width={stepX} height={plotH} fill="transparent">
              <title>{`${l} — ${series.map(s => `${s.name} ${s.values[i]}`).join(' · ')}`}</title>
            </rect>
            {series.map(s => {
              const [x, y] = xy(i, s.values[i] || 0);
              return <circle key={s.name} cx={x} cy={y} r="2.6" fill={s.color} />;
            })}
            <text x={PAD_L + i * stepX} y={H - 7} textAnchor="middle" fontSize="9" fill={C.axis}>{l}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ═══ Barres empilées, une par ligne ══════════════════════════════════════════
export function StackedRow({ parts, height = 8 }: {
  parts: Array<{ value: number; color: string; label?: string }>;
  height?: number;
}) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div className="flex w-full rounded-[3px] overflow-hidden bg-[#f4f6fa]" style={{ height }}>
      {parts.map((p, i) => p.value > 0 && (
        <div key={i} style={{ width: `${(p.value / total) * 100}%`, background: p.color, transition: 'width .5s ease' }} title={p.label}>
          {p.label && <span className="sr-only">{p.label}</span>}
        </div>
      ))}
    </div>
  );
}

// ═══ Pastille de statut ══════════════════════════════════════════════════════
export function StatusPill({ label, tone }: { label: string; tone: 'done' | 'wip' | 'plan' | 'late' | 'muted' }) {
  const TONE = {
    done: 'bg-[#e8f6f0] text-[#1f7d56] border-[#c7e9db]',
    wip: 'bg-[#fdf4e3] text-[#a2740f] border-[#f3e2ba]',
    plan: 'bg-[#eaf2f9] text-[#2f6690] border-[#cfe1ef]',
    late: 'bg-[#fdecee] text-[#b32d40] border-[#f6ccd2]',
    muted: 'bg-[#f4f6fa] text-[#7b879d] border-[#e4e8ef]',
  }[tone];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-[4px] border text-[10px] font-semibold ${TONE}`}>
      {label}
    </span>
  );
}