import { Skeleton } from "@/components/ui";
import styles from "@/components/shelf/shelf.module.css";

/** Route loading: a quiet skeleton. No edge and no text, so it never looks like a cover with no art yet. */
export default function Loading() {
  return (
    <main id="main" className={styles.main} aria-busy="true">
      <p role="status" className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        Loading
      </p>
      <div style={{ margin: "24px 0 8px" }}>
        <Skeleton shape="line" width={260} height={44} />
      </div>
      <div style={{ marginBottom: 32 }}>
        <Skeleton shape="line" width={360} />
      </div>
      <ul className={styles.grid} aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className={styles.tile}>
            <Skeleton shape="cover" />
            <Skeleton shape="line" width="70%" />
          </li>
        ))}
      </ul>
    </main>
  );
}
