/**
 * The site's shared "alive" background — slow-drifting blurred gradient
 * blobs, sourced from Suivi des Performances (picked as the visual
 * reference) and applied on every page for consistency. Styles/keyframes
 * live in src/index.css (.bg-balls / .ball-*) so the React and legacy-HTML
 * sides render the identical motif from one definition.
 */
export default function AmbientBackground() {
  return (
    <div className="bg-balls" aria-hidden="true">
      <div className="ball ball-1" />
      <div className="ball ball-2" />
      <div className="ball ball-3" />
      <div className="ball ball-4" />
    </div>
  );
}
