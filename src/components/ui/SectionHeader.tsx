export default function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-6">
      {eyebrow && (
        <div className="font-data mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-steel-dark">
          {eyebrow}
        </div>
      )}
      <h2 className="font-display text-2xl font-bold tracking-tight" style={{ color: 'white' }}>
        {title}
      </h2>
      {description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">{description}</p>}
    </div>
  );
}
