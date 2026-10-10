// The reader and the PDF viewer. They never get .app-root and they ignore the theme.
// This layout keeps exactly what the root layout gave them in v0.1: the skip link.
export default function ReaderLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {children}
    </>
  );
}
