"use client";

import { Button, Notice, PageFrame } from "@/components/ui";
import { CoverSvg } from "@/components/CoverArt";
import { plural } from "@/lib/words";
import type { useSample } from "./useSample";
import styles from "./shelf.module.css";

/** "Or read the sample first": the cover (the real page 1 once the sample is installed), the title and one button. */
export function SampleCard({ sample }: { sample: ReturnType<typeof useSample> }) {
  return (
    <section className={styles.sample} aria-labelledby="sample-h">
      <h2 id="sample-h" className={styles.h2}>
        Or read the sample first
      </h2>
      <div className={styles.sampleRow}>
        <div className={styles.sampleCover}>
          <PageFrame state={sample.svg ? "drawn" : "blank"} variant="cover">
            {sample.svg ? <CoverSvg svg={sample.svg} /> : null}
          </PageFrame>
        </div>
        <div className={styles.sampleText}>
          <p className={styles.sampleTitle}>{sample.title}</p>
          <p className={styles.sampleMeta}>{plural(sample.facts.pages, "manga page")}. A first draft.</p>
          <Button variant="secondary" size="md" loading={sample.opening} accessibleName={sample.opening ? "Read the sample: opening" : undefined} onClick={() => sample.open()}>
            {sample.opening ? "Opening" : "Read the sample"}
          </Button>
        </div>
      </div>
      {sample.error ? (
        <Notice tone="needs" role="alert" title="The sample could not be opened.">
          {sample.error}
        </Notice>
      ) : null}
    </section>
  );
}
