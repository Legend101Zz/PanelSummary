// The app frame: shelf, Add a book, the book page, the landing, first run, Settings.
// The reader and the PDF viewer are in the (reader) group and never get .app-root.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <div className="app-root">{children}</div>;
}
