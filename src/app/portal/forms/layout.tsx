export default function PortalHostedFormsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Portal forms are customer-facing; hide the portal topbar.
  // (The topbar is rendered by the parent /portal layout.)
  return (
    <>
      <style>{`
        .pa-portal-topbar {
          display: none !important;
        }
      `}</style>
      {children}
    </>
  );
}
