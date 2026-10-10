"use client";

import Link from "next/link";
import { Button, PageFrame, TextLink, UploadIcon } from "@/components/ui";
import { CoverSvg } from "@/components/CoverArt";
import { SvgPage } from "@/components/SvgPage";
import { OfflineGate } from "@/components/shelf/OfflineGate";
import { UploadPanel } from "@/components/shelf/UploadPanel";
import { useSample } from "@/components/shelf/useSample";
import { useServerStatus } from "@/components/shelf/useServerStatus";
import { useUploadFlow } from "@/components/shelf/useUploadFlow";
import { pdfPageUrl } from "@/lib/api";
import { FALLBACK_LIMITS, FIDELITY_LABEL, GITHUB_URL, plural, sampleLandingSentence, voiceLabel } from "@/lib/words";
import { useProof } from "./useProof";
import styles from "./landing.module.css";

const HOW = ["You add the PDF.", "A language model reads the text and writes a plan for each page.", "PanelSummary's own code draws each page."];

/** /welcome: the LOCAL landing. The first screen says what this is, holds the working drop zone, and shows the proof. */
export function LandingScreen() {
  const { status, refresh } = useServerStatus();
  const limits = status?.limits;
  const flow = useUploadFlow(limits?.max_pdf_size_mb);
  const sample = useSample({ install: true });
  const { proof, thumbs } = useProof(sample.info);
  const bookId = sample.info?.book_id;
  const lim = limits ?? FALLBACK_LIMITS;

  const panelBox = proof ? proof.panel.bbox : null;
  const lines = proof ? proof.page.texts.filter((t) => t.panel === proof.panel.id) : [];

  return (
    <main id="main" className={styles.main}>
      {status === null ? <OfflineGate onRetry={refresh} /> : null}
      <section className={styles.first} aria-labelledby="land-h">
        <h1 id="land-h" className={styles.h1}>
          Your book&apos;s PDF, drawn as a manga
        </h1>
        <div className={styles.firstGrid}>
          <div className={styles.action}>
            <p className={styles.sub}>A language model reads your book and plans each page. PanelSummary&apos;s own code draws the pages.</p>
            <UploadPanel flow={flow} limits={limits} />
            <p className={styles.small}>It runs on your computer. You need your own MiniMax plan and API key.</p>
            <div>
              <Button variant="secondary" size="md" loading={sample.opening} accessibleName={sample.opening ? "Read a sample: opening" : undefined} onClick={sample.open} iconStart={<UploadIcon size={20} />}>
                {sample.opening ? "Opening" : "Read a sample"}
              </Button>
            </div>
            {sample.error ? <p className={styles.small}>{sample.error}</p> : null}
          </div>

          <figure className={styles.proof}>
            {proof && panelBox && bookId ? (
              <>
                <figcaption className={styles.proofHead}>Each line says where it comes from</figcaption>
                <div className={styles.proofRow}>
                  <div className={styles.panelCol}>
                    <div className={styles.panel} style={{ aspectRatio: `${panelBox.w + 20} / ${panelBox.h + 20}` }}>
                      <SvgPage
                        svg={proof.page.svg ?? ""}
                        decorative
                        onReady={(root) => root.setAttribute("viewBox", `${panelBox.x - 10} ${panelBox.y - 10} ${panelBox.w + 20} ${panelBox.h + 20}`)}
                      />
                    </div>
                    <p className={styles.cap}>
                      Manga page {proof.page.page_number}, panel {proof.panel.order + 1}
                    </p>
                    <ul className={styles.lines}>
                      {lines.map((t) => (
                        <li key={`${t.panel}-${t.index}`}>
                          <span className={styles.meta}>
                            {voiceLabel(t.kind, t.speaker, proof.page.speakers)} · {FIDELITY_LABEL[t.fidelity]}
                          </span>
                          <span>{t.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className={styles.pdfCol}>
                    <p className={styles.from}>
                      Comes from{" "}
                      {proof.pdfPages.map((p, i) => (
                        <span key={p}>
                          {i > 0 ? (i === proof.pdfPages.length - 1 ? " and " : ", ") : ""}
                          <TextLink href={`/books/${bookId}/source?page=${p}`}>PDF page {p}</TextLink>
                        </span>
                      ))}
                    </p>
                    <div className={styles.pdf}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={pdfPageUrl(bookId, proof.pdfPages[0] ?? 1)} alt={`PDF page ${proof.pdfPages[0] ?? 1} of ${sample.title}, the page this panel comes from`} />
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className={styles.small}>{sample.info === null ? "The sample could not be loaded." : "Loading the proof from the sample."}</p>
            )}
          </figure>
        </div>
      </section>

      <Section title="How it works">
        <ol className={styles.list}>
          {HOW.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ol>
      </Section>

      <Section title="The facts">
        <ul className={styles.list}>
          <li>No image-generation model: code draws every page.</li>
          <li>Each panel links to the PDF pages it comes from, and each line says if it is quoted, paraphrased or dramatized.</li>
          <li>You see the estimated cost and time before you start.</li>
          <li>
            It runs on your own computer. The code is on{" "}
            <TextLink href={GITHUB_URL} rel="noopener noreferrer">
              GitHub
            </TextLink>
            . You need your own MiniMax plan and API key.
          </li>
        </ul>
      </Section>

      <Section title="The sample">
        <p className={styles.body}>
          {sampleLandingSentence(sample.title, sample.book.sections, sample.book.pdfPages, sample.facts)} A first draft.
        </p>
        {thumbs.length && bookId && sample.info?.edition_id ? (
          <ul className={styles.thumbs}>
            {thumbs.map((t) => (
              <li key={t.page}>
                <Link href={`/books/${bookId}/read?edition=${sample.info!.edition_id}&page=${t.page}`} className={styles.thumb}>
                  <PageFrame state="drawn" variant="thumbnail">
                    <CoverSvg svg={t.svg} />
                  </PageFrame>
                  <span>Manga page {t.page}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title="The limits">
        <p className={styles.body}>
          Born-digital PDFs with selectable text, in English, up to {lim.max_pdf_size_mb} MB, {plural(lim.max_pdf_pages, "PDF page")} and {lim.max_source_words.toLocaleString("en-US")} words. A scanned book does not work. Version 0.2 lets you choose sections of a longer book.
        </p>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = `s-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <section className={styles.section} aria-labelledby={id}>
      <h2 id={id} className={styles.h2}>
        {title}
      </h2>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}
