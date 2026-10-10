/**
 * The replay worker answers a goal request from a saved run. No model is called, no key is read.
 * MANGA_PAGE: the saved page spec goes through the page goal's own submit tool (so today's checks and
 * today's renderer run), and the result has the shape the real worker returns.
 */
import { castCapabilities as _unused } from "@panelsummary/manga-render";
import { renderPage, validatePage } from "@panelsummary/manga-render";
import type { MangaPageSpec, RenderResult, ValidationIssue } from "@panelsummary/manga-render";

import { errorsOf } from "../goals/common.js";
import { mangaPageGoal, pageIssues } from "../goals/manga-page.js";
import { jitterSeconds, type ProviderKind, type ReplayOptions } from "./options.js";
import { describeMismatch, matchBook, savedCallFor, type ReplayPackage } from "./package.js";

void _unused;

export interface ReplayRequest {
  goal_type: string;
  run_id: string;
  input: unknown;
  model?: string;
  thinking?: string;
  vision?: boolean;
}

export interface ReplayError {
  code: string;
  message: string;
  provider_type?: string;
  provider_message?: string;
  http_status?: number;
}

export type ReplayOutcome =
  | { state: "SUCCEEDED"; result: unknown; trace: ReplayTrace }
  | { state: "FAILED" | "CANCELLED"; error: ReplayError; trace: ReplayTrace };

export interface ReplayTrace {
  goal_type: string;
  run_id: string;
  session_id: string;
  provider: "replay";
  model: string;
  thinking: string;
  thinking_sent: string;
  skill: { name: string; version: string; hash: string };
  tokens: { input: number; output: number; cache_read: number; cache_write: number; total: number };
  cost_usd: number;
  cost_basis: string;
  latency_ms: number;
  turns: number;
  tool_calls: { name: string; ok: boolean; ms: number; note?: string }[];
  submits: number;
  text_fallback_used: boolean;
  truncated_turns: number;
  nudges: number;
  stop_reason: string;
  error?: string;
  provider_error?: { code: string; type: string; http_status: number; message: string };
  replay: { package: string; note: string; warnings: string[] };
}

const LIMIT_TEXT = "Token Plan usage limit reached: Upgrade your Token Plan or purchase Credits for more usage. (2056)";
const REFUSALS: Record<ProviderKind, { code: string; type: string; status: number; text: string }> = {
  limit: { code: "PROVIDER_LIMIT", type: "rate_limit_error", status: 429, text: LIMIT_TEXT },
  unavailable: { code: "PROVIDER_UNAVAILABLE", type: "overloaded_error", status: 529, text: "Overloaded" },
  auth: { code: "PROVIDER_AUTH", type: "authentication_error", status: 401, text: "invalid api key" },
};

const DEFAULT_MODEL = "MiniMax-M3.1-Flash-Preview";
const NO_SKILL = { name: "replay", version: "0", hash: "replay" };

const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      signal.removeEventListener("abort", done);
      clearTimeout(timer);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });

/** The page number in "<edition>-page<N>-a<K>[-r<R>]"; the key of a page without its attempt. */
function pageKey(runId: string): string {
  return runId.replace(/-a\d+(-r\d+)?$/, "");
}

export class ReplayHandler {
  private readonly failedCalls = new Map<string, number>();
  private readonly refusedCalls = new Map<string, number>();

  constructor(
    private readonly pkg: ReplayPackage,
    private readonly options: ReplayOptions,
  ) {}

  async execute(request: ReplayRequest, signal: AbortSignal): Promise<ReplayOutcome> {
    const started = Date.now();
    const page = request.goal_type === "MANGA_PAGE" ? Number((request.input as { page_number?: unknown } | undefined)?.page_number) : undefined;
    const stage = request.goal_type === "BOOK_UNDERSTANDING" ? "understanding" : request.goal_type === "ADAPTATION_PLAN" ? "plan" : "page";
    const range = this.options.delays[stage];
    await sleep(jitterSeconds(range, request.run_id.replace(/-a\d+.*$/, "") + stage + (page ?? "")) * 1000, signal);
    const finish = (extra: Partial<ReplayTrace> = {}, warnings: string[] = []) => this.trace(request, page, Date.now() - started, extra, warnings);
    if (signal.aborted) return { state: "CANCELLED", error: { code: "CANCELLED", message: "cancelled by backend" }, trace: finish({ stop_reason: "cancelled" }) };

    // A scripted provider refusal (D11): the same error shape the real worker returns after MiniMax refuses.
    const stop = this.options.providerStop;
    if (stop && stop.target.stage === stage && (stop.target.stage !== "page" || stop.target.page === page)) {
      const key = `${stage}:${page ?? ""}`;
      const seen = this.refusedCalls.get(key) ?? 0;
      if (seen < stop.times) {
        this.refusedCalls.set(key, seen + 1);
        const refusal = REFUSALS[stop.kind];
        const message = `${refusal.type}: ${refusal.text}`;
        return {
          state: "FAILED",
          error: { code: refusal.code, message, provider_type: refusal.type, provider_message: refusal.text, http_status: refusal.status },
          trace: finish({ stop_reason: "provider_error", provider_error: { code: refusal.code, type: refusal.type, http_status: refusal.status, message: refusal.text }, tokens: { input: 0, output: 0, cache_read: 0, cache_write: 0, total: 0 }, cost_usd: 0, submits: 0 }),
        };
      }
    }

    if (request.goal_type === "BOOK_UNDERSTANDING" || request.goal_type === "ADAPTATION_PLAN") {
      const book = (request.input as { book?: Parameters<typeof matchBook>[1] } | undefined)?.book ?? {};
      const match = matchBook(this.pkg, book);
      if (!match.ok) {
        return { state: "FAILED", error: { code: "REPLAY_BOOK_MISMATCH", message: describeMismatch(this.pkg, match) }, trace: finish({ stop_reason: "error", error: "book mismatch" }) };
      }
      const warnings = match.changedText.length ? [`the text of ${match.changedText.length} unit(s) differs from the saved run (${match.changedText.slice(0, 5).join(", ")})`] : [];
      if (request.goal_type === "BOOK_UNDERSTANDING") return { state: "SUCCEEDED", result: { understanding: this.pkg.understanding }, trace: finish({}, warnings) };
      const { page_budget, ...plan } = this.pkg.plan;
      return { state: "SUCCEEDED", result: { plan, page_budget }, trace: finish({}, warnings) };
    }
    if (request.goal_type === "MANGA_PAGE") return this.page(request, page, finish);
    return { state: "FAILED", error: { code: "UNKNOWN_GOAL", message: `unknown goal ${request.goal_type}` }, trace: finish({ stop_reason: "error" }) };
  }

  private async page(request: ReplayRequest, page: number | undefined, finish: (extra?: Partial<ReplayTrace>, warnings?: string[]) => ReplayTrace): Promise<ReplayOutcome> {
    if (page === undefined || !Number.isInteger(page)) return { state: "FAILED", error: { code: "BAD_INPUT", message: "input.page_number is required" }, trace: finish({ stop_reason: "error" }) };
    // A failing page fails its first FAIL_TIMES calls (default 2 = both attempts of one Generate), then it succeeds: Retry works.
    if (this.options.failPages.has(page)) {
      const key = pageKey(request.run_id);
      const seen = this.failedCalls.get(key) ?? 0;
      if (seen < this.options.failTimes) {
        this.failedCalls.set(key, seen + 1);
        return { state: "FAILED", error: { code: "NO_SUBMISSION", message: `replay: page ${page} is set to fail (FAIL_PAGES), call ${seen + 1} of ${this.options.failTimes}` }, trace: finish({ stop_reason: "no_submission", submits: 0 }) };
      }
    }
    const spec = this.pkg.specs.get(page);
    if (!spec) return { state: "FAILED", error: { code: "REPLAY_NO_SPEC", message: `The replay package has no saved page ${page} (it failed or is missing in the saved run).` }, trace: finish({ stop_reason: "error", error: "no saved spec" }) };

    let input;
    try {
      input = mangaPageGoal.parseInput(request.input);
    } catch (error) {
      return { state: "FAILED", error: { code: "BAD_INPUT", message: error instanceof Error ? error.message : String(error) }, trace: finish({ stop_reason: "error" }) };
    }
    const prepared = mangaPageGoal.prepare(input, { model: (request.model ?? DEFAULT_MODEL) as never, thinking: (request.thinking ?? "off") as never, vision: false });
    const submit = prepared.tools.find((tool) => tool.name === prepared.submitTool)!;
    // The page goal rejects the first full-check submit once for "repair_once" issues (repair-once.ts). A writer
    // then sends the page again: do the same, with the saved spec unchanged. The notes go in the receipt.
    const calls: ReplayTrace["tool_calls"] = [];
    let reply = await submit.execute({ candidate_json: JSON.stringify(spec) }, undefined);
    calls.push({ name: submit.name, ok: reply.accepted !== undefined, ms: 0, note: reply.note });
    if (reply.accepted === undefined) {
      reply = await submit.execute({ candidate_json: JSON.stringify(spec) }, undefined);
      calls.push({ name: submit.name, ok: reply.accepted !== undefined, ms: 0, note: reply.note });
    }
    if (reply.accepted !== undefined) {
      return { state: "SUCCEEDED", result: prepared.finalize(reply.accepted as never), trace: finish({ tool_calls: calls, submits: calls.length }, []) };
    }
    // Today's checks reject this yesterday-page. Keep the journey going when the page is structurally valid:
    // render it with today's renderer and keep today's issues on the record, marked in the receipt.
    const bookRefs = { cast: input.cast, locations: input.locations };
    const structural = validatePage(spec, bookRefs, { ...input.page, cast: [...input.page.cast, ...input.minor.map((m) => m.id)] });
    if (errorsOf(structural).length > 0) {
      const codes = [...new Set(errorsOf(structural).map((issue) => issue.code))].join(", ");
      return { state: "FAILED", error: { code: "REPLAY_INVALID_SPEC", message: `The saved page ${page} is no longer valid for the current page contract: ${codes}.` }, trace: finish({ stop_reason: "error", error: codes }) };
    }
    const render: RenderResult = renderPage(spec as MangaPageSpec, bookRefs, { idPrefix: `pg${page}-` });
    const issues: ValidationIssue[] = pageIssues(spec as MangaPageSpec, input, [...structural, ...render.issues]);
    const codes = [...new Set(errorsOf(issues).map((issue) => issue.code))];
    const note = `replay: today's page checks reject the saved page (${codes.join(", ") || "none named"}); drawn anyway`;
    return { state: "SUCCEEDED", result: { spec, render: { ...render, issues } }, trace: finish({ tool_calls: calls, submits: calls.length }, [note]) };
  }

  private trace(request: ReplayRequest, page: number | undefined, latencyMs: number, extra: Partial<ReplayTrace>, warnings: string[]): ReplayTrace {
    const saved = savedCallFor(this.pkg, request.goal_type, page);
    const copy = this.options.costs === "saved" && saved !== undefined;
    const tokens = copy && saved.tokens ? { input: saved.tokens.input, output: saved.tokens.output, cache_read: saved.tokens.cache_read, cache_write: saved.tokens.cache_write, total: saved.tokens.total ?? saved.tokens.input + saved.tokens.output } : { input: 0, output: 0, cache_read: 0, cache_write: 0, total: 0 };
    return {
      goal_type: request.goal_type,
      run_id: request.run_id,
      session_id: `replay-${request.run_id}`,
      provider: "replay",
      model: request.model ?? DEFAULT_MODEL,
      thinking: request.thinking ?? "off",
      thinking_sent: "replay",
      skill: saved?.skill ?? NO_SKILL,
      tokens,
      cost_usd: copy ? Number(saved.cost_usd ?? 0) : 0,
      cost_basis: copy ? "REPLAY: tokens and cost are copied from the saved run; nothing was spent now" : "REPLAY: no model call; nothing was spent",
      latency_ms: latencyMs,
      turns: copy ? Number(saved.turns ?? 1) : 1,
      tool_calls: [],
      submits: 1,
      text_fallback_used: false,
      truncated_turns: 0,
      nudges: 0,
      stop_reason: "replay",
      replay: { package: this.pkg.dir, note: "answered from a saved run; no model was called", warnings },
      ...extra,
    };
  }
}
