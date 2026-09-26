import Link from "next/link";
import type { ReactNode } from "react";

export function SiteHeader({ action }: { action?: ReactNode }) {
  return (
    <header className="site-header">
      <Link href="/" className="wordmark" aria-label="PanelSummary, your shelf">
        <span className="wordmark-mark" aria-hidden="true" />
        PanelSummary
      </Link>
      {action}
    </header>
  );
}
