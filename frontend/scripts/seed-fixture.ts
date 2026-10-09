/**
 * Seed the disposable fixture database for frontend work.
 *
 *   export _ZO_DOCTOR=0
 *   cd "/Volumes/Mrigesh SSD/Book-Reel"
 *   apps/agent-worker/node_modules/.bin/tsx frontend/scripts/seed-fixture.ts \
 *     --storage <dir> [--state drawing|done|cancelled]
 *
 * What it writes (mongodb://127.0.0.1:27018/ps_frontend_fixture only; the
 * Python side refuses anything else):
 * - "The Happy Prince and Other Tales" (the real PDF, parsed by the backend's
 *   own parser) with one edition of 8 planned pages: pages 1-6 accepted
 *   (rendered now by @panelsummary/manga-render from its Happy Prince
 *   fixture), page 7 failed with a reason, page 8 pending.
 * - "Civil Disobedience", parsed, with no edition yet.
 *
 * The fixture's source references (units u01..u12 on pages 1..6) are
 * re-pointed at the real PDF: each fixture unit is matched to the PDF page
 * that shares the most word 4-grams with the lines quoted from it, and to
 * the parsed unit that covers that page.
 *
 * Start the backend with STORAGE_DIR=<dir> so it can serve the PDF pages.
 * --state drawing   (default) edition still drawing, job running
 * --state done      edition completed_with_failures, coverage computed
 * --state cancelled edition cancelled part-way
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { isAcceptable, renderPage } from "../../packages/manga-render/src/index.ts";
import type { MangaPageSpec, SourceRef } from "../../packages/manga-render/src/contracts.ts";
import { BOOK, PAGES, PLAN, UNDERSTANDING } from "../../packages/manga-render/test/fixtures/happy-prince.ts";

const REPO = path.resolve(__dirname, "../..");
const PYTHON = path.join(REPO, "backend/.venv/bin/python");
const HELPER = path.join(__dirname, "seed_fixture_db.py");
const HAPPY_PRINCE_PDF = "/Volumes/Mrigesh SSD/Book-Reel-scratch/books/happy-prince-and-other-tales.pdf";
const CIVIL_PDF = "/Volumes/Mrigesh SSD/Book-Reel-scratch/books/civil-disobedience.pdf";

type State = "drawing" | "done" | "cancelled";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Stable 24-hex ids so URLs survive a reseed. */
function oid(name: string): string {
  return createHash("sha1").update(`ps-frontend-fixture:${name}`).digest("hex").slice(0, 24);
}

function sha(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function python(args: string[], input?: string): string {
  const run = spawnSync(PYTHON, [HELPER, ...args], {
    cwd: path.join(REPO, "backend"),
    input,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, MONGODB_URL: process.env.SEED_MONGODB_URL ?? "mongodb://127.0.0.1:27018", DB_NAME: process.env.SEED_DB_NAME ?? "ps_frontend_fixture" },
  });
  if (run.status !== 0) throw new Error(`seed_fixture_db.py ${args[0]} failed:\n${run.stderr}`);
  return run.stdout;
}

interface ParsedUnit {
  id: string;
  section_id: string;
  page_start: number;
  page_end: number;
  word_count: number;
  text: string;
}
interface ParsedSection {
  id: string;
  title: string;
  page_start: number;
  page_end: number;
  word_count: number;
  unit_ids: string[];
}
interface Parsed {
  source: {
    parser: string;
    page_count: number;
    title: string;
    author: string;
    sections: ParsedSection[];
    units: ParsedUnit[];
    word_count: number;
    content_hash: string;
  };
  page_texts: string[];
}

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z' ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

function shingles(s: string, n = 4): Set<string> {
  const w = words(s);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
}

// ---------------------------------------------------------------------------
// The two pages past the renderer fixture (page 7 fails, page 8 is pending).
// ---------------------------------------------------------------------------

const EXTRA_UNITS: Record<string, string> = {
  u13: "In the square below there stands a little match-girl. She has let her matches fall in the gutter",
  u14: "You are blind now, so I will stay with you always",
  u15: "said the Mathematical Master, \"you have never seen one.\"",
};

const EXTRA_CLAIMS = [
  { id: "c13", section_id: "s5", kind: "event", importance: "core", text: "The Prince gives his second sapphire eye to a little match-girl and is left blind.", unit: "u13" },
  { id: "c14", section_id: "s5", kind: "decision", importance: "core", text: "The Swallow gives up Egypt to stay with the blind Prince.", unit: "u14" },
  { id: "c15", section_id: "s1", kind: "fact", importance: "detail", text: "The Mathematical Master disapproves of the Charity Children dreaming of angels.", unit: "u15" },
];

const EXTRA_PLAN_PAGES = [
  { page_number: 7, section_id: "s5", beat: "The Prince gives his last eye to a little match-girl and is left blind.", claims: ["c13"], cast: ["prince", "swallow"], locations: ["square"], units: ["u13"], page_turn_hook: false },
  { page_number: 8, section_id: "s5", beat: "The Swallow decides to stay with the blind Prince instead of flying south.", claims: ["c14"], cast: ["swallow", "prince"], locations: ["square"], units: ["u14"], page_turn_hook: true },
];

const OMITTED = [{ claim: "c15", reason: "A side remark about the Charity Children; it does not move the story, so it was left out to keep the chapter tight." }];

// ---------------------------------------------------------------------------

function main() {
  const storage = arg("storage");
  if (!storage) throw new Error("--storage <dir> is required (the backend's STORAGE_DIR)");
  const state = (arg("state") ?? "drawing") as State;
  if (!["drawing", "done", "cancelled"].includes(state)) throw new Error(`unknown --state ${state}`);

  const prince = JSON.parse(python(["parse", HAPPY_PRINCE_PDF])) as Parsed;
  const civil = JSON.parse(python(["parse", CIVIL_PDF])) as Parsed;

  // --- 1. match fixture units to real PDF pages -----------------------------
  const tale = prince.source.sections[0]; // "The Happy Prince", pages 3-16
  const probes = new Map<string, string[]>();
  const addProbe = (unit: string | undefined, text: string) => {
    if (!unit) return;
    probes.set(unit, [...(probes.get(unit) ?? []), text]);
  };
  for (const page of PAGES) {
    for (const panel of page.panels) {
      for (const t of panel.text) if (t.source && (t.fidelity === "quote" || t.fidelity === "paraphrase")) addProbe(t.source.unit, t.text);
    }
  }
  for (const [unit, text] of Object.entries(EXTRA_UNITS)) addProbe(unit, text);

  const pageShingles = prince.page_texts.map((t) => shingles(t));
  const unitPage = new Map<string, number>();
  for (const [unit, texts] of probes) {
    const probe = shingles(texts.join(" \n "));
    let best = -1;
    let bestScore = 0;
    for (let p = tale.page_start; p <= tale.page_end; p++) {
      let score = 0;
      for (const s of probe) if (pageShingles[p - 1].has(s)) score++;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (best > 0) unitPage.set(unit, best);
  }
  // units nobody quotes (u02 is only dramatized) take the page of their neighbour
  const allUnits = [...new Set([...UNDERSTANDING.sections.flatMap((s) => s.units), ...Object.keys(EXTRA_UNITS)])].sort();
  for (const u of allUnits) {
    if (unitPage.has(u)) continue;
    const i = allUnits.indexOf(u);
    const prev = allUnits.slice(0, i).reverse().find((x) => unitPage.has(x));
    const next = allUnits.slice(i + 1).find((x) => unitPage.has(x));
    unitPage.set(u, unitPage.get(prev ?? next ?? "") ?? tale.page_start);
  }
  const realUnit = (page: number) =>
    prince.source.units.find((u) => u.section_id === tale.id && u.page_start <= page && page <= u.page_end)?.id ?? tale.unit_ids[0];
  const remap = (ref: SourceRef): SourceRef => {
    const page = unitPage.get(ref.unit) ?? ref.page;
    return { unit: realUnit(page), page };
  };
  const remapUnitId = (unit: string) => realUnit(unitPage.get(unit) ?? tale.page_start);

  // --- 2. understanding + plan with real source refs ------------------------
  const understanding = structuredClone(UNDERSTANDING) as unknown as Record<string, unknown> & {
    sections: { id: string; title: string; summary: string; units: string[] }[];
    claims: { id: string; section_id: string; kind: string; importance: string; text: string; source: SourceRef[] }[];
  };
  understanding.sections.push({ id: "s5", title: "The Second Eye", summary: "The Prince gives his last eye away and the Swallow stays with him.", units: ["u13", "u14"] });
  for (const c of EXTRA_CLAIMS) {
    const { unit, ...claim } = c;
    understanding.claims.push({ ...claim, source: [{ unit, page: 0 }] });
  }
  understanding.claims = understanding.claims.map((c) => ({ ...c, source: c.source.map(remap) }));
  understanding.sections = understanding.sections.map((s) => ({ ...s, units: [...new Set(s.units.map(remapUnitId))] }));

  const plan = {
    ...structuredClone(PLAN),
    pages: [...structuredClone(PLAN.pages), ...EXTRA_PLAN_PAGES].map((p) => ({ ...p, units: [...new Set(p.units.map(remapUnitId))] })),
    omitted: OMITTED,
    page_budget: { min: 6, max: 10, chosen: 8 },
  };

  // --- 3. render the six fixture pages --------------------------------------
  const specs: MangaPageSpec[] = PAGES.map((page) => {
    const spec = structuredClone(page);
    for (const panel of spec.panels) {
      panel.source = panel.source.map(remap);
      for (const t of panel.text) if (t.source) t.source = remap(t.source);
    }
    return spec;
  });
  const rendered = specs.map((spec) => {
    const result = renderPage(spec, BOOK, { idPrefix: `pg${spec.page_number}-` });
    if (!isAcceptable(result)) {
      const errors = result.issues.filter((i) => i.severity === "error");
      throw new Error(`fixture page ${spec.page_number} does not render cleanly: ${JSON.stringify(errors)}`);
    }
    return { spec, result };
  });

  // --- 4. documents ----------------------------------------------------------
  const princeBookId = oid("book:happy-prince");
  const civilBookId = oid("book:civil-disobedience");
  const editionId = oid("edition:happy-prince:1");
  const genJobId = oid("job:generate:happy-prince:1");
  const understandingId = oid("artifact:understanding");
  const planId = oid("artifact:plan");
  const minutes = (m: number) => ({ $ago: m * 60 });

  const receipt = (goal: string, runId: string, input: number, output: number, ms: number, ok = true) => ({
    goal_type: goal,
    run_id: runId,
    state: ok ? "SUCCEEDED" : "FAILED",
    provider: "minimax",
    model: "MiniMax-M3",
    thinking: "low",
    skill: goal === "MANGA_PAGE" ? "manga-page" : goal === "ADAPTATION_PLAN" ? "adaptation-plan" : "book-understanding",
    tokens: { input, output, cache_read: Math.round(input * 0.4), cache_write: 0 },
    cost_usd: 0,
    latency_ms: ms,
    turns: ok ? 4 : 9,
    submits: ok ? 1 : 3,
    tool_calls: ok ? 3 : 8,
    text_fallback_used: false,
    stop_reason: ok ? "submitted" : "max_submits",
    error: ok ? null : { code: "MAX_SUBMITS", message: "The page was rejected on every submit." },
    at: minutes(20),
  });

  const understandingReceipt = receipt("BOOK_UNDERSTANDING", `${editionId}-understanding-a1`, 48210, 7304, 96000);
  const planReceipt = receipt("ADAPTATION_PLAN", `${editionId}-plan-a1`, 31877, 3905, 51000);

  const failedError = {
    code: "MAX_SUBMITS",
    message:
      "The match-girl's line did not fit its balloon in panel 3, and the shortened version left the page without the moment the Prince goes blind.",
  };
  const cancelled = state === "cancelled";
  const done = state === "done";

  const pageDocs = [
    ...rendered.map(({ spec, result }, i) => ({
      _id: oid(`page:${spec.page_number}`),
      edition_id: editionId,
      page_number: spec.page_number,
      section_id: spec.section_id,
      beat: plan.pages[i].beat,
      claims: plan.pages[i].claims,
      units: plan.pages[i].units,
      status: "accepted",
      attempts: spec.page_number === 3 ? 2 : 1,
      spec,
      svg: result.svg,
      svg_hash: result.svg_hash,
      renderer_version: result.renderer_version,
      panels: result.panels,
      texts: result.texts,
      warnings: result.issues.filter((x) => x.severity === "warning"),
      receipts: [receipt("MANGA_PAGE", `${editionId}-page${spec.page_number}-a1`, 52000 + i * 1733, 7100 + i * 211, 140000 + i * 9000)],
      error: null,
      created_at: minutes(22),
      updated_at: minutes(18 - i * 2),
    })),
    {
      _id: oid("page:7"),
      edition_id: editionId,
      page_number: 7,
      section_id: "s5",
      beat: EXTRA_PLAN_PAGES[0].beat,
      claims: EXTRA_PLAN_PAGES[0].claims,
      units: plan.pages[6].units,
      status: "failed",
      attempts: 2,
      spec: null,
      svg: null,
      svg_hash: null,
      renderer_version: null,
      panels: [],
      texts: [],
      warnings: [],
      receipts: [
        receipt("MANGA_PAGE", `${editionId}-page7-a1`, 61200, 9800, 210000, false),
        receipt("MANGA_PAGE", `${editionId}-page7-a2`, 63950, 10120, 225000, false),
      ],
      error: failedError,
      created_at: minutes(22),
      updated_at: minutes(3),
    },
    {
      _id: oid("page:8"),
      edition_id: editionId,
      page_number: 8,
      section_id: "s5",
      beat: EXTRA_PLAN_PAGES[1].beat,
      claims: EXTRA_PLAN_PAGES[1].claims,
      units: plan.pages[7].units,
      status: done ? "failed" : "pending",
      attempts: done ? 2 : 0,
      spec: null,
      svg: null,
      svg_hash: null,
      renderer_version: null,
      panels: [],
      texts: [],
      warnings: [],
      receipts: [],
      error: done ? { code: "WORKER_ERROR", message: "The drawing service stopped answering while this page was being drawn." } : null,
      created_at: minutes(22),
      updated_at: minutes(1),
    },
  ];

  const allReceipts = [understandingReceipt, planReceipt, ...pageDocs.flatMap((p) => p.receipts)];
  const totals = {
    calls: allReceipts.length,
    failed_calls: allReceipts.filter((r) => r.state !== "SUCCEEDED").length,
    input_tokens: allReceipts.reduce((s, r) => s + r.tokens.input, 0),
    output_tokens: allReceipts.reduce((s, r) => s + r.tokens.output, 0),
    cache_read_tokens: allReceipts.reduce((s, r) => s + r.tokens.cache_read, 0),
    cache_write_tokens: 0,
    cost_usd: 0,
    model_ms: allReceipts.reduce((s, r) => s + r.latency_ms, 0),
  };

  const accepted = pageDocs.filter((p) => p.status === "accepted");
  const conveyed = [...new Set(accepted.flatMap((p) => (p.spec as MangaPageSpec).claims))].sort();
  const planned = new Map(pageDocs.flatMap((p) => p.claims.map((c) => [c, p.page_number] as const)));
  const coverage = done
    ? {
        claims_total: understanding.claims.length,
        conveyed,
        lost_to_failed_pages: [...planned.keys()].filter((c) => !conveyed.includes(c)).sort(),
        omitted_by_plan: OMITTED,
        not_planned: understanding.claims.map((c) => c.id).filter((c) => !planned.has(c) && !OMITTED.some((o) => o.claim === c)),
        core_not_conveyed: understanding.claims
          .filter((c) => c.importance === "core" && !conveyed.includes(c.id) && !OMITTED.some((o) => o.claim === c.id))
          .map((c) => c.id),
      }
    : {};

  const events = [
    { at: minutes(24), stage: "queued", message: "Waiting for the generator" },
    { at: minutes(23.5), stage: "understanding", message: "MiniMax is working on the understanding (attempt 1)" },
    { at: minutes(22.5), stage: "plan", message: "MiniMax is working on the plan (attempt 1)" },
    { at: minutes(22), stage: "drawing", message: "0 of 8 pages ready" },
    ...[1, 2, 3, 4, 5, 6].map((n) => ({ at: minutes(18 - n * 2), stage: "drawing", message: `Page ${n} is ready (${n} of 8)` })),
    { at: minutes(3), stage: "drawing", message: `Page 7 attempt 2 failed: ${failedError.message.slice(0, 200)}` },
  ];

  const jobStatus = done ? "completed_with_failures" : cancelled ? "cancelled" : "running";
  const generateJob = {
    _id: genJobId,
    kind: "generate",
    book_id: princeBookId,
    edition_id: editionId,
    status: jobStatus,
    stage: done ? "completed_with_failures" : cancelled ? "cancelled" : "drawing",
    done: 6,
    total: 8,
    message: done ? "6 of 8 pages accepted; 2 failed: pages 7, 8" : cancelled ? "Cancelled" : "Page 6 is ready (6 of 8)",
    error: null,
    cancel_requested: cancelled,
    // a far-future lease: a job runner started for upload tests never adopts this job
    lease_owner: done || cancelled ? null : "frontend-fixture",
    lease_expires_at: done || cancelled ? null : { $ahead: 10 * 365 * 86400 },
    attempts: 1,
    events: done
      ? [...events, { at: minutes(1), stage: "completed_with_failures", message: "6 of 8 pages accepted; 2 failed: pages 7, 8" }]
      : cancelled
        ? [...events, { at: minutes(1), stage: "cancelled", message: "Cancelled" }]
        : events,
    created_at: minutes(24),
    started_at: minutes(24),
    finished_at: done || cancelled ? minutes(1) : null,
  };

  const policy = {
    understanding_model: "MiniMax-M3",
    understanding_thinking: "low",
    plan_model: "MiniMax-M3",
    plan_thinking: "low",
    page_model: "MiniMax-M3",
    page_thinking: "low",
    page_vision: true,
    page_attempts: 2,
    harness: "apps/agent-worker (Pi sealed session) -> MiniMax",
    image_models: "none",
  };

  const edition = {
    _id: editionId,
    book_id: princeBookId,
    status: done ? "completed_with_failures" : cancelled ? "cancelled" : "drawing",
    job_id: genJobId,
    policy,
    understanding_id: understandingId,
    plan_id: planId,
    page_total: 8,
    // like the real runner: these two are written only by finalize()
    pages_accepted: done ? accepted.length : 0,
    pages_failed: done ? pageDocs.filter((p) => p.status === "failed").length : 0,
    coverage,
    totals,
    error: null,
    created_at: minutes(24),
    updated_at: minutes(1),
    finished_at: done ? minutes(1) : null,
  };

  const artifacts = [
    {
      _id: understandingId,
      edition_id: editionId,
      kind: "understanding",
      schema_id: "book-understanding.v1",
      content: understanding,
      content_hash: sha(understanding),
      receipt: understandingReceipt,
      created_at: minutes(23),
    },
    {
      _id: planId,
      edition_id: editionId,
      kind: "plan",
      schema_id: "adaptation-plan.v1",
      content: plan,
      content_hash: sha(plan),
      receipt: planReceipt,
      created_at: minutes(22),
    },
  ];

  const bookDoc = (id: string, parsed: Parsed, filename: string, created: number) => ({
    doc: {
      _id: id,
      title: parsed.source.title,
      author: parsed.source.author,
      original_filename: filename,
      status: "parsed",
      error: null,
      page_count: parsed.source.page_count,
      word_count: parsed.source.word_count,
      section_count: parsed.source.sections.length,
      parser: parsed.source.parser,
      parse_job_id: oid(`job:parse:${id}`),
      created_at: minutes(created),
      updated_at: minutes(created - 1),
    },
    source: {
      _id: oid(`source:${id}`),
      book_id: id,
      parser: parsed.source.parser,
      content_hash: parsed.source.content_hash,
      title: parsed.source.title,
      author: parsed.source.author,
      page_count: parsed.source.page_count,
      word_count: parsed.source.word_count,
      sections: parsed.source.sections,
      units: parsed.source.units,
      created_at: minutes(created - 1),
    },
  });
  const parseJob = (bookId: string, parsed: Parsed, created: number) => {
    const message = `Parsed ${parsed.source.page_count} pages into ${parsed.source.sections.length} sections and ${parsed.source.units.length} source units`;
    return {
      _id: oid(`job:parse:${bookId}`),
      kind: "parse",
      book_id: bookId,
      edition_id: null,
      status: "succeeded",
      stage: "parsed",
      done: 0,
      total: 0,
      message,
      error: null,
      cancel_requested: false,
      lease_owner: null,
      lease_expires_at: null,
      attempts: 1,
      events: [
        { at: minutes(created), stage: "parsing", message: "Reading the PDF" },
        { at: minutes(created - 0.5), stage: "parsed", message },
        { at: minutes(created - 0.5), stage: "succeeded", message },
      ],
      created_at: minutes(created),
      started_at: minutes(created),
      finished_at: minutes(created - 0.5),
    };
  };

  const payload = {
    storage_dir: path.resolve(storage),
    books: [
      // the shelf lists newest first: Civil Disobedience was added after
      { pdf_source: CIVIL_PDF, ...bookDoc(civilBookId, civil, "civil-disobedience.pdf", 30) },
      { pdf_source: HAPPY_PRINCE_PDF, ...bookDoc(princeBookId, prince, "happy-prince-and-other-tales.pdf", 60) },
    ],
    generation_jobs: [parseJob(princeBookId, prince, 60), parseJob(civilBookId, civil, 30), generateJob],
    editions: [edition],
    edition_artifacts: artifacts,
    edition_pages: pageDocs,
  };

  const out = JSON.parse(python(["insert"], JSON.stringify(payload)));
  const unitReport = [...unitPage.entries()].sort().map(([u, p]) => `${u}->p${p}/${realUnit(p)}`).join(" ");
  console.log(
    JSON.stringify(
      {
        ...out,
        state,
        books: { happy_prince: princeBookId, civil_disobedience: civilBookId },
        edition: editionId,
        pages: pageDocs.map((p) => `${p.page_number}:${p.status}`).join(" "),
        unit_pages: unitReport,
        warnings: rendered.reduce((s, r) => s + r.result.issues.filter((x) => x.severity === "warning").length, 0),
      },
      null,
      2,
    ),
  );
}

main();
