import { Card, Skeleton } from "@/components/ui";
import styles from "./Book.module.css";

/** The loading state of the book page. A skeleton has no edge and no text, so it never looks like a cover with no art. */
export function BookSkeleton() {
  return (
    <main id="main" className={styles.main} aria-busy="true">
      <p className="sr-only" role="status">
        Loading the book
      </p>
      <div className={styles.skBack}>
        <Skeleton shape="line" width={96} height={18} />
      </div>
      <div className={styles.top}>
        <div className={styles.cover}>
          <Skeleton shape="cover" />
        </div>
        <div className={styles.text}>
          <Skeleton shape="line" width="70%" height={44} />
          <Skeleton shape="line" width="38%" height={22} />
          <Skeleton shape="line" width="48%" height={18} />
        </div>
        <div className={styles.console}>
          <Card>
            <Skeleton shape="line" width="40%" height={30} />
            <div className={styles.skRows}>
              <Skeleton shape="line" width="100%" height={20} />
              <Skeleton shape="line" width="100%" height={20} />
              <Skeleton shape="line" width="100%" height={20} />
            </div>
            <Skeleton shape="block" width={180} height={48} />
          </Card>
        </div>
      </div>
    </main>
  );
}
