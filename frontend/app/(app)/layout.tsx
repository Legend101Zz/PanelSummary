// The app frame: shelf, Add a book, the book page, the landing, first run, Settings.
// The reader and the PDF viewer are in the (reader) group and never get .app-root.
import { Footer, Header, SkipLink } from "@/components/ui";
import styles from "./frame.module.css";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`app-root ${styles.frame}`}>
      <SkipLink />
      <Header />
      {/* The screens own their <main id="main">. The menu makes this wrapper inert while it is open. */}
      <div id="app-content" className={styles.content}>
        {children}
      </div>
      <Footer />
    </div>
  );
}
