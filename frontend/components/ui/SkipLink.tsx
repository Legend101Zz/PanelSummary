import styles from "./SkipLink.module.css";

/** "Skip to content" moves focus to <main id="main">. Every app screen has a <main id="main">. */
export function SkipLink() {
  return (
    <a className={styles.skip} href="#main">
      Skip to content
    </a>
  );
}
