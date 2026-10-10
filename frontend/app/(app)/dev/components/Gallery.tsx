"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { SvgPage } from "@/components/SvgPage";
import { listBooks, loadPage } from "@/lib/api";
import { useTheme } from "@/lib/useTheme";
import * as I from "@/components/ui/icons";
import {
  BottomBar,
  Button,
  Card,
  Checkbox,
  Disclosure,
  DropZone,
  EstimatePanel,
  IconButton,
  Meter,
  MomentBand,
  Notice,
  NumberField,
  OfflineBanner,
  PageFrame,
  ResultLine,
  RunCard,
  SegmentedControl,
  Skeleton,
  StatusBand,
  StatusLine,
  StepList,
  Switch,
  ThemeButton,
  TextLink,
  ToneStrip,
  Tooltip,
  shelfBandExamples,
} from "@/components/ui";
import type { SegmentState } from "@/components/ui";
import styles from "./gallery.module.css";

// ---- real page art, when a fixture or a run is in the database ---------------------------------

function usePageSvgs(): string[] {
  const [svgs, setSvgs] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const books = await listBooks();
        const withEdition = books.find((b) => b.latest_edition);
        if (!withEdition?.latest_edition) return;
        const out: string[] = [];
        for (let n = 1; n <= 3; n += 1) {
          const p = await loadPage(withEdition.latest_edition.id, n).catch(() => null);
          if (p && p.status === "accepted" && p.svg) out.push(p.svg);
        }
        if (live) setSvgs(out);
      } catch {
        /* no server or no book: plain sheets are shown */
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  return svgs;
}

function Art({ svgs, i }: { svgs: string[]; i: number }) {
  const svg = svgs[i % Math.max(1, svgs.length)];
  if (!svg) {
    // No real page in the database: a plain sheet, labelled. Never fake manga art.
    return (
      <svg viewBox="0 0 100 150" aria-hidden="true">
        <rect width="100" height="150" fill="#fbfaf6" />
        <text x="50" y="78" textAnchor="middle" fontSize="7" fill="#464a4f" fontFamily="sans-serif">
          page art
        </text>
      </svg>
    );
  }
  return <SvgPage svg={svg} decorative />;
}

// ---- strip data --------------------------------------------------------------------------------

const rep = (s: SegmentState, n: number): SegmentState[] => Array.from({ length: n }, () => s);
const FOUR_AT_ONCE: SegmentState[] = [...rep("drawing", 4), ...rep("waiting", 12)];
const STOPPED: SegmentState[] = [...rep("drawn", 5), ...rep("drawing", 3), ...rep("waiting", 8)];
const FINISHED: SegmentState[] = [...rep("drawn", 8), "failed", ...rep("drawn", 3), "failed", ...rep("drawn", 3)];
const ALL_18: SegmentState[] = rep("drawn", 18);
const SIXTY: SegmentState[] = Array.from({ length: 60 }, (_, i) => (i === 11 || i === 18 ? "failed" : i < 27 ? "drawn" : i < 31 ? "drawing" : "waiting"));
const FOUR_PAGES: SegmentState[] = [...rep("drawn", 1), "drawing", "waiting", "failed"];

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className={styles.section} aria-labelledby={`h-${title.replace(/\W+/g, "-")}`}>
      <h2 id={`h-${title.replace(/\W+/g, "-")}`} className={styles.h2}>
        {title}
      </h2>
      {note ? <p className={styles.note}>{note}</p> : null}
      {children}
    </section>
  );
}

function Cap({ children }: { children: ReactNode }) {
  return <span className={styles.cap}>{children}</span>;
}

export function Gallery() {
  const svgs = usePageSvgs();
  const { pref, setPref } = useTheme();
  const [seg, setSeg] = useState("two");
  const [momentKey, setMomentKey] = useState(0);
  const [checked, setChecked] = useState(true);
  const [beats, setBeats] = useState(false);

  return (
    <main id="main" className={styles.main}>
      <h1 className={styles.h1}>Components</h1>
      <p className={styles.lede}>Every shared component in every state. Development only (a production build answers 404). Use the theme button in the header to see both themes. The contract is components/ui/README.md.</p>

      <Section title="Button" note="Variants primary, secondary, quiet, danger. Sizes lg 52, md 48, sm 44. Off with a reason in words. Busy: three still dots and a verb; the accessible name differs from the label.">
        <div className={styles.row}>
          <Button variant="primary" iconEnd={<I.ArrowRightIcon size={20} />}>Start reading</Button>
          <Button>Stop drawing</Button>
          <Button variant="quiet">Choose a different PDF</Button>
          <Button variant="danger">Delete book</Button>
          <Button variant="primary" size="lg" iconStart={<I.UploadIcon size={20} />}>Choose a PDF</Button>
          <Button size="sm">Add a book</Button>
          <Button variant="primary" iconStart={<I.RetryIcon size={20} />}>Retry failed pages</Button>
        </div>
        <div className={styles.row}>
          <Button disabled why="Available when page 1 is drawn">Page 1 not drawn yet</Button>
          <Button loading accessibleName="Generate manga: starting">Starting</Button>
          <Button variant="primary" loading accessibleName="Retry failed pages: retrying">Retrying</Button>
          <Button variant="primary" disabled why="Off, because the book is over the limit">Generate manga</Button>
          <Button variant="quiet" disabled>Quiet, off</Button>
          <Button variant="danger" disabled>Danger, off</Button>
        </div>
        <div className={styles.row}>
          <Button href="/upload" variant="secondary">A link that looks like a button</Button>
        </div>
      </Section>

      <Section title="TextLink and IconButton">
        <div className={styles.row}>
          <TextLink href="/dev/components">See progress</TextLink>
          <TextLink href="/dev/components" kind="nav" current>Shelf</TextLink>
          <TextLink href="/dev/components" kind="nav">Settings</TextLink>
          <TextLink href="/" kind="back">Your shelf</TextLink>
          <TextLink href="/settings" kind="secondary">Settings / About</TextLink>
        </div>
        <div className={styles.row}>
          <IconButton label="Dark theme (off)" icon={<I.MoonIcon />} pressed={false} />
          <IconButton label="Dark theme (on)" icon={<I.MoonFilledIcon />} pressed />
          <IconButton label="Menu" icon={<I.MenuIcon />} expanded={false} />
          <IconButton label="Close" icon={<I.CloseIcon />} />
          <IconButton label="Previous" icon={<I.ChevronLeftIcon />} />
          <IconButton label="Next" icon={<I.ChevronRightIcon />} />
          <IconButton label="Off" icon={<I.CloseIcon />} disabled />
          <ThemeButton />
        </div>
      </Section>

      <Section title="SegmentedControl" note="Real radio inputs. An option that cannot be chosen shows its reason as a second line.">
        <div className={styles.col}>
          <SegmentedControl name="theme-demo" legend="Theme" value={pref} onChange={setPref} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "system", label: "Use the system setting" }]} />
          <SegmentedControl
            name="seg-demo"
            legend="Scope"
            value={seg}
            onChange={setSeg}
            options={[
              { value: "all", label: "Whole book", disabledReason: "Over the limit" },
              { value: "two", label: "Two sections" },
              { value: "range", label: "PDF pages" },
            ]}
          />
        </div>
      </Section>

      <Section title="Notice" note="needs (coral, problem icon), note, info, wait. Inside a card a notice is a full-width fill with square corners.">
        <div className={`${styles.grid} ${styles.g3}`}>
          <Notice tone="needs" title="notes.txt is not a PDF.">Choose a .pdf file.</Notice>
          <Notice tone="note" title="Nothing is drawn yet. You start the manga from the book's page when you are ready." />
          <Notice tone="wait" title="Still waiting. The PDF is read by the PanelSummary job runner; check that it is running." />
          <Notice tone="info" title="This book is already on your shelf." />
          <Notice tone="needs" title="Each version of this page failed the page checks." detail={<code>PAGE_CHECK_FAILED: panel 3 overlaps the lettering box</code>}>Retry the page, or leave it out.</Notice>
        </div>
        <div className={styles.row}><Disclosure label="Technical detail">An open disclosure shows its block.</Disclosure><Disclosure label="Technical detail (open)" defaultOpen>Open from the start.</Disclosure></div>
      </Section>

      <Section title="MomentBand" note="Yellow, page 1 only. The one motion: scaleX(0) to 1 from the left, 400 ms. Press Replay. With reduced motion it is full at once.">
        <div className={styles.col}>
          <MomentBand key={momentKey} actions={<><Button variant="primary" iconEnd={<I.ArrowRightIcon size={20} />}>Start reading</Button><Button>Stop drawing</Button></>}>
            Page 1 is ready. Read it now while the rest is drawn.
          </MomentBand>
          <div className={styles.row}><Button size="sm" onClick={() => setMomentKey((k) => k + 1)}>Replay</Button></div>
        </div>
      </Section>

      <Section title="Checkbox, Switch, NumberField, Tooltip">
        <div className={`${styles.grid} ${styles.g3}`}>
          <div className={styles.stack}>
            <Checkbox label="The Happy Prince" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <Checkbox label="The Nightingale and the Rose" extra="2,323 words" defaultChecked={false} />
            <Checkbox label="Disabled" disabled />
            <Checkbox label="Disabled, checked" disabled defaultChecked />
          </div>
          <div className={styles.stack}>
            <Switch label="Show page beats" checked={beats} onChange={(e) => setBeats(e.target.checked)} />
            <Switch label="Show page beats (on)" defaultChecked />
            <Switch label="Disabled" disabled />
          </div>
          <div className={`${styles.row} ${styles.top}`}>
            <NumberField label="Go to PDF page" defaultValue={3} />
            <NumberField label="From PDF page" defaultValue={80} invalid suffix="to 40" hint="The book has 68 PDF pages." />
            <NumberField label="Disabled" defaultValue={5} disabled />
          </div>
        </div>
        <div className={styles.row} style={{ paddingTop: 36 }}>
          <Tooltip text="Available when page 1 is drawn">
            <Button disabled>Page 1 not drawn yet</Button>
          </Tooltip>
          <span>Hover or focus the control. Tab to the button below to see the tooltip on focus.</span>
          <Tooltip text="Start reading opens page 1">
            <Button>Tooltip on focus</Button>
          </Tooltip>
        </div>
      </Section>

      <Section title="Meter, progress and StepList">
        <div className={`${styles.grid} ${styles.g3}`}>
          <Meter label="Words in this choice" valueText="5,794 of 17,500" value={5794} limit={17500} note="Inside the limit." />
          <Meter label="Words in this choice" valueText="21,000 of 17,500" value={21000} limit={17500} note="3,500 words over the limit." />
          <Meter label="Uploading" valueText="42%" fraction={0.42} />
        </div>
        <div className={`${styles.grid} ${styles.g3}`}>
          <div><Cap>run</Cap><StepList steps={[{ label: "Reading the book" }, { label: "Planning the pages" }, { label: "Drawing the pages" }]} current={2} /></div>
          <div><Cap>upload (current step has a progress line)</Cap><StepList steps={[{ label: "Uploading, 42%", detail: <Meter label="Upload" valueText="42%" fraction={0.42} /> }, { label: "Read the text and find the sections" }, { label: "Open the book" }]} current={0} /></div>
          <div><Cap>all done, numbered</Cap><StepList numbered steps={[{ label: "Reading the book" }, { label: "Planning the pages" }, { label: "Drawing the pages" }]} current={3} /></div>
        </div>
      </Section>

      <Section title="ResultLine" note="The actual value above its mark; the range ends below.">
        <div className={`${styles.grid} ${styles.g3}`}>
          <ResultLine title="Took 7 min 08 s" actual={428} low={300} high={3480} actualLabel="7 min 08 s" lowLabel="5 min" highLabel="58 min" note="The first page was drawn after 3 min 47 s (page 3). The grey band is the estimate from before the run." />
          <ResultLine title="Took 6 min 04 s (actual at 2%)" actual={304} low={300} high={3480} actualLabel="6 min 04 s" lowLabel="5 min" highLabel="58 min" />
          <ResultLine title="About $0.74, not a bill (actual at 98%)" actual={0.74} low={0.33} high={0.75} actualLabel="$0.74" lowLabel="$0.33" highLabel="$0.75" />
          <ResultLine title="About $0.46, not a bill" actual={0.46} low={0.33} high={0.75} actualLabel="$0.46" lowLabel="$0.33" highLabel="$0.75" />
        </div>
      </Section>

      <Section title="EstimatePanel">
        <Card className={styles.cell}>
          <EstimatePanel
            rows={[{ label: "Manga pages", value: "11 to 18 pages" }, { label: "Page 1 is ready in", value: "2 to 31 min" }, { label: "The whole book is ready in", value: "5 to 58 min" }, { label: "Cost (estimate)", value: "$0.33 to $0.75" }]}
            basis="Estimate at MiniMax-M3 rates, not a bill. This book is inside the limit of 75 PDF pages and 17,500 words."
            detail="The estimate comes from measured runs of the same models. Real time depends on how busy MiniMax is."
          />
        </Card>
      </Section>

      <Section title="StatusBand" note="Four families in 160 px, 13 px text, two lines. The 15 shelf states of SCREENS-AND-STATES section 4 (and the 1-page and no-plan variants).">
        <div className={styles.bands}>
          {shelfBandExamples().map((b) => (
            <div key={b.key} className={styles.band}>
              <Cap>{b.key}</Cap>
              <StatusBand family={b.family} text={b.text} fraction={b.fraction} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="PageFrame and Skeleton" note="Always 2:3. Real page art when the database has a book; otherwise a plain sheet. The blank cover is a plain sheet with a solid edge, no text: it looks different from the skeleton.">
        <div className={styles.frames}>
          <div className={styles.f120}><Cap>thumb: drawn</Cap><PageFrame state="drawn" variant="thumbnail"><Art svgs={svgs} i={0} /></PageFrame></div>
          <div className={styles.f120}><Cap>thumb: drawing</Cap><PageFrame state="drawing" /></div>
          <div className={styles.f120}><Cap>thumb: waiting</Cap><PageFrame state="waiting" /></div>
          <div className={styles.f120}><Cap>thumb: failed</Cap><PageFrame state="failed" /></div>
          <div className={styles.f96}><Cap>96 px</Cap><PageFrame state="drawing" /></div>
          <div className={styles.f160}><Cap>cover: drawn</Cap><PageFrame state="drawn" variant="cover"><Art svgs={svgs} i={1} /></PageFrame></div>
          <div className={styles.f160}><Cap>cover: blank</Cap><PageFrame state="blank" variant="cover" /></div>
          <div className={styles.f160}><Cap>Skeleton (loading)</Cap><Skeleton shape="cover" /><div style={{ height: 8 }} /><Skeleton shape="line" /><div style={{ height: 8 }} /><Skeleton shape="line" width="60%" /></div>
        </div>
      </Section>

      <Section title="ToneStrip" note="Rows of 20 on a narrow container, one row on a wide one. The text alternative is on the picture; the legend names every state in words.">
        <div className={styles.col}>
          <Card narrow><Cap>before the plan exists</Cap><ToneStrip segments={[]} indeterminate showSummary /></Card>
          <Card narrow><Cap>4 pages at the same time, 16 pages</Cap><ToneStrip segments={FOUR_AT_ONCE} showSummary /></Card>
          <Card narrow><Cap>4 pages (a tiny book)</Cap><ToneStrip segments={FOUR_PAGES} showSummary /></Card>
          <Card narrow><Cap>16 pages, after Stop drawing</Cap><ToneStrip segments={STOPPED} /></Card>
          <Card narrow><Cap>16 pages finished with 2 missing</Cap><ToneStrip segments={FINISHED} showSummary /></Card>
          <Card narrow><Cap>18 pages, all drawn</Cap><ToneStrip segments={ALL_18} showSummary /></Card>
          <Card narrow><Cap>60 pages</Cap><ToneStrip segments={SIXTY} showSummary /></Card>
          <Card narrow className={styles.phone}><Cap>60 pages at phone width (358 px)</Cap><ToneStrip segments={SIXTY} showSummary /></Card>
        </div>
      </Section>

      <Section title="RunCard" note="A layout shell with slots. The book page decides what goes in each slot.">
        <div className={`${styles.grid} ${styles.g2}`}>
          <RunCard
            eyebrow="A. Parsed, not drawn yet"
            headline="Before you start"
            strip={<EstimatePanel rows={[{ label: "Manga pages", value: "11 to 18 pages" }, { label: "Page 1 is ready in", value: "2 to 31 min" }, { label: "The whole book is ready in", value: "5 to 58 min" }, { label: "Cost (estimate)", value: "$0.33 to $0.75" }]} basis="Estimate at MiniMax-M3 rates, not a bill." />}
            actions={<Button variant="primary" size="md">Generate manga</Button>}
            notes="MiniMax reads the book's text and plans the pages; PanelSummary draws them."
          />
          <RunCard
            eyebrow="B. Drawing, before page 1"
            headline="Drawing pages 1, 2, 3 and 4 of 16"
            steps={<StepList steps={[{ label: "Reading the book" }, { label: "Planning the pages" }, { label: "Drawing the pages" }]} current={2} />}
            strip={<ToneStrip segments={FOUR_AT_ONCE} />}
            time="0 pages drawn of 16 · Running for 3 min 12 s. Page 1 comes first. This page updates itself."
            actions={<><Button disabled why="Available when page 1 is drawn">Page 1 not drawn yet</Button><Button>Stop drawing</Button></>}
          />
          <RunCard
            eyebrow="D. Complete"
            headline="All 18 pages are drawn"
            strip={<div className={`${styles.grid} ${styles.g2}`}><ResultLine title="Took 7 min 08 s" actual={428} low={300} high={3480} actualLabel="7 min 08 s" lowLabel="5 min" highLabel="58 min" /><ResultLine title="About $0.46, not a bill" actual={0.46} low={0.33} high={0.75} actualLabel="$0.46" lowLabel="$0.33" highLabel="$0.75" /></div>}
            actions={<Button variant="primary" iconEnd={<I.ArrowRightIcon size={20} />}>Start reading</Button>}
          />
          <RunCard
            eyebrow="E. Completed with failures"
            headline="Finished, but 2 pages are missing"
            strip={<ToneStrip segments={FINISHED} />}
            actions={<><Button variant="primary" iconStart={<I.RetryIcon size={20} />}>Retry failed pages</Button><Button>Start reading</Button></>}
            notes="The pages that are drawn stay as they are."
          />
          <RunCard
            eyebrow="F. Stopped by MiniMax: usage limit"
            headline="Drawing stopped: MiniMax usage limit reached"
            notice={<Notice tone="needs" inCard title="MiniMax says the usage limit is reached." detail={<code>PROVIDER_LIMIT 429</code>}>Nothing more was sent, so nothing more was spent. Wait for the limit to reset, then press Resume drawing.</Notice>}
            actions={<><Button variant="primary">Resume drawing</Button><Button>Start reading</Button></>}
          />
          <RunCard
            eyebrow="G. Over the limit"
            headline="This book is too large to draw"
            notice={<Notice tone="needs" inCard title="This book has 150 PDF pages. PanelSummary can adapt books up to 75 PDF pages in one run.">You can still read the PDF here. Longer books are planned for a later version.</Notice>}
            actions={<><Button disabled why="Off, because the book is over the limit">Generate manga</Button><Button variant="primary" href="/upload">Add a shorter book</Button><TextLink href="/">Back to your shelf</TextLink></>}
          />
        </div>
      </Section>

      <Section title="DropZone" note="Idle, error, and the drag-over look. A real file input is inside. Drag a file over the idle zone to see Drop to add.">
        <div className={`${styles.grid} ${styles.g2}`}>
          <div><Cap>idle (drag a file over it)</Cap><DropZone onFile={() => undefined} /></div>
          <div><Cap>error</Cap><DropZone onFile={() => undefined} error="notes.txt is not a PDF. Choose a .pdf file." /></div>
          <div><Cap>off</Cap><DropZone onFile={() => undefined} disabled /></div>
        </div>
      </Section>

      <Section title="BottomBar, OfflineBanner, StatusLine">
        <div className={styles.preview}>
          <BottomBar narrowOnly={false} reserveSpace={false}><Button variant="primary" size="lg" fullWidth>Generate manga</Button></BottomBar>
        </div>
        <div className={styles.col} style={{ marginTop: 16 }}>
          <OfflineBanner />
          <StatusLine>Drawing page 7 of 16. Page 1 is ready.</StatusLine>
          <StatusLine tone="wait">Waiting for MiniMax to answer.</StatusLine>
          <StatusLine tone="needs">2 pages could not be drawn.</StatusLine>
        </div>
      </Section>

      <Section title="Icons" note="Line icons on a 20 x 20 grid, round caps and joins, 2.2 px on screen.">
        <div className={styles.icons}>
          {Object.entries(I)
            .filter(([n]) => n.endsWith("Icon") || n === "PanelMark")
            .map(([name, Cmp]) => {
              const C = Cmp as (p: object) => ReactNode;
              return (
                <div key={name} className={styles.icon}>
                  {C({})}
                  <span>{name}</span>
                </div>
              );
            })}
        </div>
      </Section>
    </main>
  );
}
