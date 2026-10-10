import { TextLink } from "./TextLink";
import styles from "./Footer.module.css";

export const APP_VERSION = "v0.2";
export const PRIVACY_LINE = "PanelSummary runs on your computer. Only MiniMax gets the book text and page previews.";

/** The version, a link to Settings / About, and the line about what leaves the computer. */
export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.row}>
        <span>PanelSummary {APP_VERSION}</span>
        <TextLink href="/settings" kind="secondary">
          Settings / About
        </TextLink>
        <p className={styles.line}>{PRIVACY_LINE}</p>
      </div>
    </footer>
  );
}
