/**
 * MiniMax experiment runner. Runs production goals IN-PROCESS through the same
 * sealed Pi harness the HTTP worker uses (executeDefinition → runGoal), on a
 * parsed book (backend/app/sources/pdf_source.py output), and writes every
 * artifact, trace and rendered page to --out.
 *
 *   tsx scripts/experiment.ts --book X.units.json --out DIR --stage understanding
 *   tsx scripts/experiment.ts --book X.units.json --out DIR --stage plan --understanding DIR/understanding.json
 *   tsx scripts/experiment.ts --book X.units.json --out DIR --stage pages --understanding U --plan P --pages 1-4 --model MiniMax-M3 --vision
 *   tsx scripts/experiment.ts --book X.units.json --out DIR --stage section --understanding U --plan P --section s1
 *
 * The key comes from MINIMAX_API_KEY in the environment (never printed).
 */
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";

import type { AllowedModel, ThinkingLevel } from "@scrollstack/agent-runtime";
import type { AdaptationPlan, BookUnderstanding } from "@panelsummary/manga-render";
import { svgToPng } from "@panelsummary/manga-render/raster";

import { egressSnapshot, installEgressRecorder } from "../src/egress.js";
import { GOALS } from "../src/goals/index.js";
import { mangaSectionGoal } from "../src/goals/manga-section.js";
import type { GoalDefinition } from "../src/goals/types.js";
import { executeDefinition, type GoalOutcome } from "../src/run-goal.js";

installEgressRecorder();

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : "true";
}

interface ParsedBook {
  title: string;
  author: string;
  page_count: number;
  sections: { id: string; title: string; page_start: number; page_end: number; unit_ids: string[] }[];
  units: { id: string; section_id: string; page_start: number; page_end: number; text: string }[];
}

const bookPath = arg("book");
const out = arg("out");
const stage = arg("stage");
if (!bookPath || !out || !stage) {
  console.error("usage: --book X.units.json --out DIR --stage understanding|plan|pages|section [...]");
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const book = JSON.parse(readFileSync(bookPath, "utf8")) as ParsedBook;
const model = (arg("model") ?? "MiniMax-M3") as AllowedModel;
const thinking = (arg("thinking") ?? "low") as ThinkingLevel;
const vision = arg("vision") === "true";
const label = arg("label") ?? `${stage}-${model}-${thinking}${vision ? "-vision" : ""}`;
const concurrency = Number(arg("concurrency") ?? "3");

const bookInput = {
  title: book.title,
  author: book.author,
  page_count: book.page_count,
  sections: book.sections,
  units: book.units.map(({ id, section_id, page_start, page_end, text }) => ({ id, section_id, page_start, page_end, text })),
};

function record(kind: string, outcome: GoalOutcome, extra: Record<string, unknown> = {}) {
  const trace = "trace" in outcome ? outcome.trace : undefined;
  const line = {
    label,
    kind,
    state: outcome.state,
    error: "error" in outcome ? outcome.error : undefined,
    model: trace?.model,
    thinking: trace?.thinking,
    tokens: trace?.tokens,
    cost_usd: trace?.cost_usd,
    latency_ms: trace?.latency_ms,
    turns: trace?.turns,
    submits: trace?.submits,
    tool_calls: trace?.tool_calls,
    text_fallback_used: trace?.text_fallback_used,
    stop_reason: trace?.stop_reason,
    ...extra,
  };
  appendFileSync(path.join(out!, "traces.jsonl"), `${JSON.stringify(line)}\n`);
  const summary = `${kind} ${outcome.state} ${trace ? `${trace.latency_ms}ms in=${trace.tokens.input} out=${trace.tokens.output} cache=${trace.tokens.cache_read}/${trace.tokens.cache_write} $${trace.cost_usd} turns=${trace.turns} submits=${trace.submits}` : ""} ${"error" in outcome ? outcome.error.message.slice(0, 300) : ""}`;
  console.log(summary);
}

async function run(goal: GoalDefinition<unknown>, runId: string, input: unknown) {
  return executeDefinition(goal, { goal_type: goal.type, run_id: runId, input, model, thinking, vision });
}

function readJson<T>(name: string): T {
  const file = arg(name);
  if (!file) throw new Error(`--${name} is required for this stage`);
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

function pagesArg(plan: AdaptationPlan): number[] {
  const spec = arg("pages");
  if (!spec) return plan.pages.map((p) => p.page_number);
  const pages: number[] = [];
  for (const part of spec.split(",")) {
    const [a, b] = part.split("-").map(Number);
    for (let n = a; n <= (b ?? a); n += 1) pages.push(n);
  }
  return pages;
}

async function main() {
  if (stage === "understanding") {
    const outcome = await run(GOALS.BOOK_UNDERSTANDING, `exp-u-${label}`, { book: bookInput });
    record("understanding", outcome);
    if (outcome.state === "SUCCEEDED") writeFileSync(path.join(out!, "understanding.json"), JSON.stringify((outcome.result as { understanding: unknown }).understanding, null, 2));
  } else if (stage === "plan") {
    const understanding = readJson<BookUnderstanding>("understanding");
    const outcome = await run(GOALS.ADAPTATION_PLAN, `exp-p-${label}`, { book: bookInput, understanding });
    record("plan", outcome);
    if (outcome.state === "SUCCEEDED") writeFileSync(path.join(out!, "plan.json"), JSON.stringify(outcome.result, null, 2));
  } else if (stage === "pages") {
    const understanding = readJson<BookUnderstanding>("understanding");
    const planFile = readJson<{ plan: AdaptationPlan } | AdaptationPlan>("plan");
    const plan = "plan" in planFile ? planFile.plan : planFile;
    const queue = pagesArg(plan);
    const worker = async () => {
      for (;;) {
        const pageNumber = queue.shift();
        if (pageNumber === undefined) return;
        const planned = plan.pages.find((p) => p.page_number === pageNumber)!;
        const units = bookInput.units.filter((u) => planned.units.includes(u.id));
        const outcome = await run(GOALS.MANGA_PAGE, `exp-pg${pageNumber}-${label}`, {
          book: { title: book.title, author: book.author },
          understanding,
          plan,
          page_number: pageNumber,
          units,
        });
        record(`page ${pageNumber}`, outcome);
        if (outcome.state === "SUCCEEDED") {
          const result = outcome.result as unknown as { spec: unknown; render: { svg: string; issues: unknown[] } };
          writeFileSync(path.join(out!, `page-${pageNumber}.json`), JSON.stringify({ spec: result.spec, issues: result.render.issues }, null, 2));
          writeFileSync(path.join(out!, `page-${pageNumber}.svg`), result.render.svg);
          writeFileSync(path.join(out!, `page-${pageNumber}.png`), svgToPng(result.render.svg, { width: 1000 }));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  } else if (stage === "section") {
    const understanding = readJson<BookUnderstanding>("understanding");
    const planFile = readJson<{ plan: AdaptationPlan } | AdaptationPlan>("plan");
    const plan = "plan" in planFile ? planFile.plan : planFile;
    const sectionId = arg("section") ?? "s1";
    const pages = plan.pages.filter((p) => p.section_id === sectionId);
    const unitIds = new Set(pages.flatMap((p) => p.units));
    const units = bookInput.units.filter((u) => unitIds.has(u.id));
    const outcome = await run(mangaSectionGoal as GoalDefinition<unknown>, `exp-sec-${sectionId}-${label}`, { understanding, plan, section_id: sectionId, units });
    record(`section ${sectionId}`, outcome, { pages: pages.map((p) => p.page_number) });
    if (outcome.state === "SUCCEEDED") {
      const result = outcome.result as unknown as { pages: { spec: { page_number: number }; render: { svg: string; issues: unknown[] } }[] };
      for (const page of result.pages) {
        const n = page.spec.page_number;
        writeFileSync(path.join(out!, `page-${n}.json`), JSON.stringify({ spec: page.spec, issues: page.render.issues }, null, 2));
        writeFileSync(path.join(out!, `page-${n}.svg`), page.render.svg);
        writeFileSync(path.join(out!, `page-${n}.png`), svgToPng(page.render.svg, { width: 1000 }));
      }
    }
  } else {
    throw new Error(`unknown stage ${stage}`);
  }
  writeFileSync(path.join(out!, `egress-${label}.json`), JSON.stringify(egressSnapshot(), null, 2));
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exit(1);
  },
);
