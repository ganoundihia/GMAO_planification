/**
 * Temporary bridge for Ingénierie tools not yet ported to React (see
 * README "What's not finished yet"). Each of these still reads its Excel
 * import from the shared IndexedDB hub — same origin as the React app, so
 * that keeps working. Iframing (not opening a new tab) mirrors how the
 * legacy portal integrated these same four tools, including reloading on
 * every visit so freshly-imported files are picked up.
 */
export default function IframeTool({ title, src }: { title: string; src: string }) {
  return (
    <div className="h-[calc(100vh-4rem)]">
      <iframe title={title} src={src} className="h-full w-full border-0" />
    </div>
  );
}
