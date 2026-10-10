"use client";

import { usePathname } from "next/navigation";
import { Button } from "@/components/ui";
import { PageShell } from "./PageShell";
import styles from "./shell.module.css";

/** The 404 page: the header and the footer stay, so the way back is there twice. */
export function NotFoundScreen() {
  const path = usePathname();
  return (
    <PageShell>
      <main id="main" className={styles.main}>
        <p className={styles.eyebrow}>Error 404</p>
        <h1 className={styles.h1}>This page does not exist.</h1>
        <p className={styles.text}>Check the link, or go back to your shelf.</p>
        {path ? (
          <p className={styles.address}>
            The address was
            <code>{path}</code>
          </p>
        ) : null}
        <div className={styles.actions}>
          <Button href="/" variant="primary" size="lg">
            Go to your shelf
          </Button>
        </div>
      </main>
    </PageShell>
  );
}
