import TopNav from './TopNav';
import AmbientBackground from './AmbientBackground';

export default function PortailLayout({
  children,
  ambient = true,
}: {
  children: React.ReactNode;
  /** Home's video hero is already a full scene — skip the ambient blobs
   * there, they'd just burn cycles hidden behind an opaque background. */
  ambient?: boolean;
}) {
  return (
    <div className="relative min-h-screen bg-paper">
      {ambient && <AmbientBackground />}
      <TopNav />
      <main className="relative z-[1]">{children}</main>
    </div>
  );
}
