import * as React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { ArrowRight, type LucideIcon } from 'lucide-react';

/**
 * Adapted from a community "DestinationCard" pattern (full-bleed photo +
 * themed gradient overlay, built for travel-site destination cards). Kept
 * the interaction language — hover scale, theme-colored glow, gradient
 * overlay, bottom-anchored "Explore" button — but swapped the photo
 * background for an icon-on-tint treatment: there's no photo of "Analyse
 * MBF", and standing in a generic stock photo would read as exactly the
 * incoherent, disconnected-from-content look this site was explicitly
 * built to avoid. themeColor stays an HSL triplet string (e.g. "205 42%
 * 35%") so the glow/overlay math is unchanged from the source pattern.
 */
interface ModuleCardProps extends React.HTMLAttributes<HTMLDivElement> {
  icon: LucideIcon;
  title: string;
  tag: string;
  description: string;
  href: string;
  themeColor: string;
}

const ModuleCard = React.forwardRef<HTMLDivElement, ModuleCardProps>(
  ({ className, icon: Icon, title, tag, description, href, themeColor, ...props }, ref) => {
    return (
      <div
        ref={ref}
        style={{ '--theme-color': themeColor } as React.CSSProperties}
        className={cn('group w-full h-full', className)}
        {...props}
      >
        <Link
          to={href}
          className="relative flex h-full min-h-[260px] flex-col justify-end overflow-hidden rounded-2xl p-6
            shadow-lg transition-all duration-500 ease-in-out
            group-hover:scale-[1.03] group-hover:shadow-[0_0_50px_-15px_hsl(var(--theme-color)/0.55)]"
          style={{
            background: `linear-gradient(160deg, hsl(var(--theme-color) / 0.14) 0%, hsl(var(--theme-color) / 0.04) 55%, transparent 100%)`,
            boxShadow: `0 0 30px -18px hsl(var(--theme-color) / 0.4)`,
            border: '1px solid hsl(var(--theme-color) / 0.18)',
          }}
        >
          <Icon
            aria-hidden="true"
            className="pointer-events-none absolute -right-4 -top-4 h-32 w-32 opacity-[0.08] transition-transform
              duration-500 ease-in-out group-hover:scale-110 group-hover:opacity-[0.12]"
            style={{ color: `hsl(var(--theme-color))` }}
            strokeWidth={1.2}
          />

          <div className="relative z-10">
            <span
              className="font-data mb-3 inline-flex items-center justify-center rounded-xl p-2.5"
              style={{ background: `hsl(var(--theme-color) / 0.14)`, color: `hsl(var(--theme-color))` }}
            >
              <Icon size={22} />
            </span>
            <span className="font-data block text-[10px] font-bold uppercase tracking-wide" style={{ color: `hsl(var(--theme-color))` }}>
              {tag}
            </span>
            <h3 className="font-display mt-1 text-xl font-bold text-ink">{title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{description}</p>

            <div
              className="mt-5 flex items-center justify-between rounded-lg border px-4 py-3 backdrop-blur-md
                transition-all duration-300"
              style={{
                background: `hsl(var(--theme-color) / 0.1)`,
                borderColor: `hsl(var(--theme-color) / 0.25)`,
              }}
            >
              <span className="text-sm font-semibold" style={{ color: `hsl(var(--theme-color))` }}>
                Ouvrir
              </span>
              <ArrowRight
                className="h-4 w-4 transform transition-transform duration-300 group-hover:translate-x-1"
                style={{ color: `hsl(var(--theme-color))` }}
              />
            </div>
          </div>
        </Link>
      </div>
    );
  },
);
ModuleCard.displayName = 'ModuleCard';

export { ModuleCard };
