export default function PuraPreviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        body:has([data-pura-preview-root]) [aria-label="Open help"],
        body:has([data-pura-preview-root]) .fixed.bottom-4.right-4.z-50 {
          display: none !important;
        }
      `}</style>
      {children}
    </>
  );
}