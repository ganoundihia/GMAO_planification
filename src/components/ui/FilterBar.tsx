export interface FilterOption {
  value: string;
  label: string;
}

export default function FilterBar({
  options,
  active,
  onChange,
}: {
  options: FilterOption[];
  active: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filtres">
      {options.map((opt) => {
        const isActive = opt.value === active;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(opt.value)}
            className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold
              transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steel
              ${
                isActive
                  ? 'border-steel bg-steel text-white'
                  : 'border-line bg-white text-ink-muted hover:border-steel/40 hover:text-ink'
              }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
