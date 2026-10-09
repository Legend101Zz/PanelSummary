/**
 * Replay one planned page (or the plan) of a finished export through the real worker code path.
 *
 *   MINIMAX_API_KEY=... tsx scripts/replay-page.ts --export DIR --page 12 --out DIR2 \
 *     --model MiniMax-M3 --thinking off --label before-m3-off
 *   tsx scripts/replay-page.ts --export DIR --stage plan --out DIR2 ...
 *
 * DIR holds understanding.json, plan.json and units.json (the book export). Writes
 * <label>.trace.json (receipt fields), <label>.calls.jsonl (every tool call: a summary of the
 * candidate and the full reply the model received), and for an accepted page <label>.page.json,
 * .svg and .png. The key is read from MINIMAX_API_KEY and never printed.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { ALLOWED_MODELS, type AllowedModel, type ThinkingLevel } from "@panelsummary/agent-runtime";
import { svgToPng } from "@panelsummary/manga-render/raster";

import { GOALS } from "../src/goals/index.js";
import type { GoalDefinition } from "../src/goals/types.js";
import { executeDefinition } from "../src/run-goal.js";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : "true";
}

const dir = arg("export");
const out = arg("out");
if (!dir || !out) {
  console.error("usage: --export DIR --out DIR2 [--stage page|plan] [--page N] [--model M] [--thinking T] [--label L]");
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const stage = arg("stage", "page")!;
const model = (arg("model") ?? "MiniMax-M3") as AllowedModel;
if (!ALLOWED_MODELS.includes(model)) throw new Error(`model ${model} not allowed`);
const thinking = (arg("thinking") ?? "off") as ThinkingLevel;
const pageNumber = Number(arg("page") ?? "12");
const label = arg("label") ?? `${stage}${stage === "page" ? pageNumber : ""}-${model}-${thinking}`;
const read = <T>(name: string): T => JSON.parse(readFileSync(path.join(dir, name), "utf8")) as T;

const understanding = read<{ title?: string; author?: string }>("understanding.json");
const planFile = read<{ pages?: { page_number: number; units: string[] }[]; plan?: { pages: { page_number: number; units: string[] }[] } }>("plan.json");
const plan = (planFile.plan ?? planFile) as { pages: { page_number: number; units: string[] }[] };
const units = read<{ id: string; section_id: string; page_start: number; page_end: number; text: string }[]>("units.json");
const callsFile = path.join(out, `${label}.calls.jsonl`);

/** Wrap a goal so every tool call and its full reply is logged. */
function logged(goal: GoalDefinition<unknown>): GoalDefinition<unknown> {
  return {
    ...goal,
    prepare(input, options) {
      const prepared = goal.prepare(input, options);
      const tools = prepared.tools.map((tool) => ({
        ...tool,
        async execute(args: Record<string, unknown>, ...rest: unknown[]) {
          const started = Date.now();
          const result = await (tool.execute as (a: Record<string, unknown>, ...r: unknown[]) => Promise<{ text: string; note?: string }>)(args, ...rest);
          let summary: Record<string, unknown> = {};
          try {
            const spec = JSON.parse(String(args.candidate_json ?? "{}")) as { layout?: { template?: string }; panels?: { text?: { text: string }[] }[] };
            const texts = (spec.panels ?? []).flatMap((p) => p.text ?? []);
            summary = { template: spec.layout?.template, panels: spec.panels?.length, texts: texts.length, words: texts.reduce((n, t) => n + String(t.text).split(/\s+/).length, 0) };
          } catch {
            summary = { unparsed: true };
          }
          appendFileSync(callsFile, `${JSON.stringify({ tool: tool.name, ms: Date.now() - started, note: result.note, summary, reply: result.text })}\n`);
          return result;
        },
      }));
      return { ...prepared, tools } as typeof prepared;
    },
  } as GoalDefinition<unknown>;
}

async function main() {
  const common = { model, thinking, vision: false };
  let outcome;
  if (stage === "plan") {
    const bookPath = arg("book");
    if (!bookPath) throw new Error("--book (ParsedBook JSON) is required for --stage plan");
    const book = JSON.parse(readFileSync(bookPath, "utf8"));
    outcome = await executeDefinition(logged(GOALS.ADAPTATION_PLAN), { goal_type: "ADAPTATION_PLAN", run_id: `replay-${label}`, input: { book, understanding }, ...common });
  } else {
    const planned = plan.pages.find((p) => p.page_number === pageNumber);
    if (!planned) throw new Error(`page ${pageNumber} not in plan`);
    const byId = new Map(units.map((u) => [u.id, u]));
    const input = {
      book: { title: understanding.title, author: understanding.author },
      understanding,
      plan,
      page_number: pageNumber,
      units: planned.units.map((id) => byId.get(id)).filter(Boolean),
    };
    outcome = await executeDefinition(logged(GOALS.MANGA_PAGE), { goal_type: "MANGA_PAGE", run_id: `replay-${label}`, input, ...common });
  }
  const trace = "trace" in outcome ? outcome.trace : undefined;
  const summary = {
    label, model, thinking, state: outcome.state, error: "error" in outcome ? outcome.error : undefined,
    thinking_sent: trace?.thinking_sent, tokens: trace?.tokens, cost_usd: trace?.cost_usd, latency_ms: trace?.latency_ms,
    turns: trace?.turns, submits: trace?.submits, nudges: trace?.nudges, truncated_turns: trace?.truncated_turns,
    stop_reason: trace?.stop_reason, last_output_excerpt: trace?.last_output_excerpt, tool_calls: trace?.tool_calls, skill: trace?.skill,
  };
  writeFileSync(path.join(out, `${label}.trace.json`), JSON.stringify(summary, null, 2));
  if (outcome.state === "SUCCEEDED" && stage === "page") {
    const result = outcome.result as unknown as { spec: unknown; render: { svg: string; issues: unknown[] } };
    writeFileSync(path.join(out, `${label}.page.json`), JSON.stringify({ spec: result.spec, issues: result.render.issues }, null, 2));
    writeFileSync(path.join(out, `${label}.svg`), result.render.svg);
    writeFileSync(path.join(out, `${label}.png`), svgToPng(result.render.svg, { width: 1000 }));
  }
  if (outcome.state === "SUCCEEDED" && stage === "plan") writeFileSync(path.join(out, `${label}.plan.json`), JSON.stringify(outcome.result, null, 2));
  console.log(JSON.stringify({ ...summary, tool_calls: undefined, skill: undefined }));
}

main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.stack : e); process.exit(1); });
