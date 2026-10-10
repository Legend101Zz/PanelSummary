import { Footer, Header, SkipLink } from "@/components/ui";
import styles from "./shell.module.css";

/**
 * The app frame for pages that render outside the (app) layout: the 404 page and the error page.
 * Same parts as app/(app)/layout.tsx: .app-root, the skip link, the header and the footer.
 */
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={`app-root ${styles.frame}`}>
      <SkipLink />
      <Header />
      <div id="app-content" className={styles.content}>
        {children}
      </div>
      <Footer />
    </div>
  );
}
