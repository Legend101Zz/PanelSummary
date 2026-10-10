"use client";

import { useEffect } from "react";
import { Button, TextLink } from "@/components/ui";
import { GITHUB_URL } from "@/lib/words";
import { PageShell } from "./PageShell";
import styles from "./shell.module.css";

/** The crash page: one plain sentence and two actions. No error code and no stack trace on the page. */
export function ErrorScreen({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    document.title = "Error | PanelSummary";
    // the detail goes to the console for the person who reports it
    console.error(error);
  }, [error]);
  return (
    <PageShell>
      <main id="main" className={styles.main}>
        <p className={styles.eyebrow}>Error</p>
        <h1 className={styles.h1}>This page stopped with an error.</h1>
        <p className={styles.text}>Your books and drawn pages are safe on your computer. Reload the page to try again.</p>
        <div className={styles.actions}>
          <Button variant="primary" size="lg" onClick={() => window.location.reload()}>
            Reload the page
          </Button>
          <Button href="/" variant="secondary" size="lg">
            Go to your shelf
          </Button>
        </div>
        <p className={styles.report}>
          If this happens again, report it. Give the address of the page and what you did.{" "}
          <TextLink href={`${GITHUB_URL}/issues/new`} rel="noopener noreferrer">
            Report it on GitHub
          </TextLink>
        </p>
      </main>
    </PageShell>
  );
}
