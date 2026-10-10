/**
 * Replay worker (track F1): option parsing, request to response mapping, HTTP contract, and the proof
 * that it reads no MiniMax key and makes no outbound request. No model is called.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { ReplayHandler, type ReplayRequest } from "../src/replay/handler.js";
import { jitterSeconds, OptionError, parseDelays, parseOptions, parsePageList, parseProviderStop, parseRange } from "../src/replay/options.js";
import { describeMismatch, loadPackage, matchBook } from "../src/replay/package.js";
import { buildReplayServer } from "../src/replay/server.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPLAYS = path.resolve(here, "../../../scripts/fixtures/replays");
const TOKEN = "r".repeat(40);
const AUTH = { authorization: `Bearer ${TOKEN}` };

function options(extra: Record<string, string> = {}, pkg = "happy-prince-two-tales") {
  return parseOptions([], { AGENT_WORKER_TOKEN: TOKEN, REPLAY_PACKAGE: path.join(REPLAYS, pkg), REPLAY_FAST: "1", ...extra });
}

function bookOf(pkg: ReturnType<typeof loadPackage>) {
  const sections = (pkg.understanding.sections as { id: string; title?: string; units?: string[] }[]).map((s) => ({ id: s.id, title: s.title ?? s.id, unit_ids: s.units ?? [] }));
  return { title: pkg.title, author: "", page_count: 40, sections, units: pkg.units.map((u) => ({ id: u.id, section_id: u.section_id, page_start: u.page_start, page_end: u.page_end, text: u.text })) };
}

function pageRequest(pkg: ReturnType<typeof loadPackage>, page: number, runId = `ed-page${page}-a1`): ReplayRequest {
  const byId = new Map(pkg.units.map((u) => [u.id, u]));
  const planned = pkg.plan.pages.find((p) => p.page_number === page) as unknown as { units: string[] };
  return {
    goal_type: "MANGA_PAGE",
    run_id: runId,
    model: "MiniMax-M3.1-Flash-Preview",
    thinking: "off",
    input: { book: { title: pkg.title, author: "" }, understanding: pkg.understanding, plan: { pages: pkg.plan.pages, omitted: [] }, page_number: page, units: planned.units.map((id) => byId.get(id)), previous: null },
  };
}

const signal = new AbortController().signal;

describe("options", () => {
  it("parses ranges and delay lists", () => {
    expect(parseRange("3-6", "x")).toEqual({ min: 3, max: 6 });
    expect(parseRange("8", "x")).toEqual({ min: 8, max: 8 });
    expect(() => parseRange("6-3", "x")).toThrow(OptionError);
    expect(() => parseRange("soon", "x")).toThrow(OptionError);
    expect(parseDelays("plan=1,page=0.5-1", false)).toEqual({ understanding: { min: 8, max: 8 }, plan: { min: 1, max: 1 }, page: { min: 0.5, max: 1 } });
    expect(parseDelays(undefined, false).page).toEqual({ min: 3, max: 6 });
    expect(parseDelays("plan=1", true).plan).toEqual({ min: 0, max: 0 });
    expect(() => parseDelays("pages=3", false)).toThrow(OptionError);
  });

  it("parses page lists and provider stops", () => {
    expect([...parsePageList("7, 12,14-15", "FAIL_PAGES")]).toEqual([7, 12, 14, 15]);
    expect(() => parsePageList("7,x", "FAIL_PAGES")).toThrow(/not a page number/);
    expect(parseProviderStop("limit@page=5")).toEqual({ kind: "limit", target: { stage: "page", page: 5 }, times: 1 });
    expect(parseProviderStop("auth@understanding")?.target).toEqual({ stage: "understanding" });
    expect(parseProviderStop("unavailable@plan")).toEqual({ kind: "unavailable", target: { stage: "plan" }, times: 2 });
    expect(parseProviderStop(undefined)).toBeUndefined();
    expect(() => parseProviderStop("broken@page=1")).toThrow(OptionError);
    expect(() => parseProviderStop("limit@page")).toThrow(OptionError);
  });

  it("reads the environment, lets a flag win, and demands a package and a token", () => {
    const given = parseOptions(["--fail-pages", "3"], { AGENT_WORKER_TOKEN: TOKEN, REPLAY_PACKAGE: "/p", FAIL_PAGES: "7", PROVIDER_STOP: "limit@page=5", AGENT_WORKER_PORT: "8880" });
    expect([...given.failPages]).toEqual([3]);
    expect(given.providerStop?.kind).toBe("limit");
    expect(given.port).toBe(8880);
    expect(given.failTimes).toBe(2);
    expect(given.costs).toBe("zero"); // a replay spends nothing, so its receipts say $0 unless asked
    expect(() => parseOptions([], { AGENT_WORKER_TOKEN: TOKEN })).toThrow(/replay package/);
    expect(() => parseOptions([], { REPLAY_PACKAGE: "/p" })).toThrow(/AGENT_WORKER_TOKEN/);
    expect(() => parseOptions([], { AGENT_WORKER_TOKEN: TOKEN, REPLAY_PACKAGE: "/p", REPLAY_COSTS: "free" })).toThrow(/saved or zero/);
  });

  it("jitters deterministically inside the range", () => {
    const range = { min: 3, max: 6 };
    expect(jitterSeconds(range, "page7")).toBe(jitterSeconds(range, "page7"));
    for (const key of ["a", "b", "page1", "page22"]) expect(jitterSeconds(range, key)).toBeGreaterThanOrEqual(3);
    for (const key of ["a", "b", "page1", "page22"]) expect(jitterSeconds(range, key)).toBeLessThanOrEqual(6);
    expect(jitterSeconds({ min: 4, max: 4 }, "x")).toBe(4);
  });
});

describe("package and book match", () => {
  const pkg = loadPackage(path.join(REPLAYS, "happy-prince-two-tales"));

  it("loads the saved run", () => {
    expect(pkg.plan.pages).toHaveLength(22);
    expect(pkg.specs.size).toBe(22);
    expect(pkg.units.length).toBeGreaterThan(5);
  });

  it("accepts the same book and names the ids that differ for another", () => {
    expect(matchBook(pkg, bookOf(pkg)).ok).toBe(true);
    const other = bookOf(pkg);
    other.units = other.units.slice(1).concat([{ id: "s9u9", section_id: "s9", page_start: 1, page_end: 1, text: "x" }]);
    const match = matchBook(pkg, other);
    expect(match.ok).toBe(false);
    expect(match.units.missing).toEqual([pkg.units[0].id]);
    expect(match.units.unexpected).toEqual(["s9u9"]);
    expect(describeMismatch(pkg, match)).toContain(pkg.units[0].id);
    expect(describeMismatch(pkg, match)).toContain("s9u9");
  });

  it("a package with a missing file fails clearly", () => {
    expect(() => loadPackage(path.join(REPLAYS, "does-not-exist"))).toThrow(/understanding\.json is missing/);
  });
});

describe("request to response", () => {
  const pkg = loadPackage(path.join(REPLAYS, "happy-prince-two-tales"));

  it("BOOK_UNDERSTANDING returns the saved understanding with a replay trace", async () => {
    const out = await new ReplayHandler(pkg, options()).execute({ goal_type: "BOOK_UNDERSTANDING", run_id: "ed-understanding-a1", model: "MiniMax-M3", thinking: "low", input: { book: bookOf(pkg) } }, signal);
    expect(out.state).toBe("SUCCEEDED");
    if (out.state !== "SUCCEEDED") return;
    expect((out.result as { understanding: unknown }).understanding).toBe(pkg.understanding);
    expect(out.trace.provider).toBe("replay");
    expect(out.trace.stop_reason).toBe("replay");
    expect(out.trace.model).toBe("MiniMax-M3");
    expect(out.trace.thinking).toBe("low");
    expect(out.trace.cost_basis).toMatch(/REPLAY/);
  });

  it("BOOK_UNDERSTANDING fails clearly for another book", async () => {
    const wrong = bookOf(pkg);
    wrong.sections = wrong.sections.slice(0, 1);
    const out = await new ReplayHandler(pkg, options()).execute({ goal_type: "BOOK_UNDERSTANDING", run_id: "r", input: { book: wrong } }, signal);
    expect(out.state).toBe("FAILED");
    if (out.state === "SUCCEEDED") return;
    expect(out.error.code).toBe("REPLAY_BOOK_MISMATCH");
    expect(out.error.message).toContain(pkg.understanding.sections[1].id);
  });

  it("ADAPTATION_PLAN returns the saved plan and the page budget", async () => {
    const out = await new ReplayHandler(pkg, options()).execute({ goal_type: "ADAPTATION_PLAN", run_id: "ed-plan-a1", input: { book: bookOf(pkg), understanding: pkg.understanding } }, signal);
    expect(out.state).toBe("SUCCEEDED");
    if (out.state !== "SUCCEEDED") return;
    const result = out.result as { plan: { pages: unknown[]; page_budget?: unknown }; page_budget: unknown };
    expect(result.plan.pages).toHaveLength(22);
    expect(result.plan.page_budget).toBeUndefined();
    expect(result.page_budget).toEqual(pkg.plan.page_budget);
  });

  it("MANGA_PAGE renders the saved spec now, with a consistent hash and a receipt marked replay", async () => {
    const out = await new ReplayHandler(pkg, options({ REPLAY_COSTS: "saved" })).execute(pageRequest(pkg, 1), signal);
    expect(out.state).toBe("SUCCEEDED");
    if (out.state !== "SUCCEEDED") return;
    const result = out.result as { spec: { page_number: number }; render: { svg: string; svg_hash: string; renderer_version: string; panels: unknown[]; texts: unknown[]; issues: unknown[] } };
    expect(result.spec.page_number).toBe(1);
    expect(result.render.svg.startsWith("<svg")).toBe(true);
    expect(result.render.svg_hash).toBe(createHash("sha256").update(result.render.svg).digest("hex"));
    expect(result.render.renderer_version).toMatch(/\S/);
    expect(result.render.panels.length).toBeGreaterThan(0);
    expect(out.trace.stop_reason).toBe("replay");
    expect(out.trace.cost_usd).toBeGreaterThan(0); // REPLAY_COSTS=saved copies it from the saved receipt
  });

  it("REPLAY_COSTS=zero puts zero cost and zero tokens on the receipt", async () => {
    const out = await new ReplayHandler(pkg, options({ REPLAY_COSTS: "zero" })).execute(pageRequest(pkg, 1), signal);
    expect(out.trace.cost_usd).toBe(0);
    expect(out.trace.tokens.total).toBe(0);
  });

  it("every saved page of the two-tale run renders (no page fails)", async () => {
    const handler = new ReplayHandler(pkg, options());
    const states: string[] = [];
    const drawnAnyway: number[] = [];
    const drawnWarnings: string[] = [];
    for (const planned of pkg.plan.pages) {
      const out = await handler.execute(pageRequest(pkg, planned.page_number), signal);
      states.push(out.state);
      if (out.trace.replay.warnings.length) { drawnAnyway.push(planned.page_number); drawnWarnings.push(...out.trace.replay.warnings); }
    }
    expect(states.filter((s) => s !== "SUCCEEDED")).toEqual([]);
    // Which saved pages today's checks reject depends on the renderer version: renderer 0.6.0 (Q1)
    // rejects pages 2 (TAIL_CROSSES_TEXT) and 7 (TEXT_DOES_NOT_FIT) of this run. A replay still draws
    // them and names the codes, so the run goes on as it did live.
    for (const w of drawnWarnings) expect(w).toMatch(/today's page checks reject the saved page \([A-Z_, ]+\); drawn anyway/);
  }, 120_000);

  it("a saved page that today's checks reject is still drawn, and the receipt says so", async () => {
    const edited = { ...pkg, specs: new Map(pkg.specs) };
    const spec = JSON.parse(JSON.stringify(pkg.specs.get(1))) as { panels: { text?: { fidelity?: string; text?: string }[] }[] };
    const line = spec.panels.flatMap((panel) => panel.text ?? []).find((t) => t.fidelity === "quote") ?? spec.panels.flatMap((panel) => panel.text ?? [])[0];
    line.fidelity = "quote";
    line.text = "zebra quartz wombat nonsense words that the book never says";
    edited.specs.set(1, spec as never);
    const out = await new ReplayHandler(edited, options()).execute(pageRequest(pkg, 1), signal);
    expect(out.state).toBe("SUCCEEDED");
    if (out.state !== "SUCCEEDED") return;
    expect(out.trace.replay.warnings.join(" ")).toMatch(/QUOTE_NOT_IN_SOURCE/);
    expect(out.trace.submits).toBe(2);
  });

  it("a page without a saved spec fails in plain words", async () => {
    const thin = { ...pkg, specs: new Map(pkg.specs) };
    thin.specs.delete(3);
    const out = await new ReplayHandler(thin, options()).execute(pageRequest(pkg, 3), signal);
    expect(out.state).toBe("FAILED");
    if (out.state === "SUCCEEDED") return;
    expect(out.error.code).toBe("REPLAY_NO_SPEC");
    expect(out.error.message).toMatch(/no saved page 3/);
  });

  it("FAIL_PAGES fails NO_SUBMISSION for FAIL_TIMES calls, then a retry succeeds", async () => {
    const handler = new ReplayHandler(pkg, options({ FAIL_PAGES: "7" }));
    const first = await handler.execute(pageRequest(pkg, 7, "ed-page7-a1"), signal);
    const second = await handler.execute(pageRequest(pkg, 7, "ed-page7-a2"), signal);
    expect([first.state, second.state]).toEqual(["FAILED", "FAILED"]);
    if (first.state !== "SUCCEEDED") expect(first.error.code).toBe("NO_SUBMISSION");
    expect((await handler.execute(pageRequest(pkg, 7, "ed-page7-a1"), signal)).state).toBe("SUCCEEDED");
    expect((await handler.execute(pageRequest(pkg, 8, "ed-page8-a1"), signal)).state).toBe("SUCCEEDED");
  });

  it("PROVIDER_STOP returns the shape of a real refusal once, then lets work continue", async () => {
    const handler = new ReplayHandler(pkg, options({ PROVIDER_STOP: "limit@page=5" }));
    const out = await handler.execute(pageRequest(pkg, 5, "ed-page5-a1"), signal);
    expect(out.state).toBe("FAILED");
    if (out.state === "SUCCEEDED") return;
    expect(out.error).toMatchObject({ code: "PROVIDER_LIMIT", provider_type: "rate_limit_error", http_status: 429 });
    expect(out.error.message).toContain("rate_limit_error");
    expect(out.trace.stop_reason).toBe("provider_error");
    expect(out.trace.provider_error).toMatchObject({ code: "PROVIDER_LIMIT", http_status: 429 });
    expect(out.trace.cost_usd).toBe(0);
    expect((await handler.execute(pageRequest(pkg, 4, "ed-page4-a1"), signal)).state).toBe("SUCCEEDED");
    expect((await handler.execute(pageRequest(pkg, 5, "ed-page5-a1-r1"), signal)).state).toBe("SUCCEEDED");
  });

  it("PROVIDER_STOP at the understanding or the plan, and unavailable twice", async () => {
    const handler = new ReplayHandler(pkg, options({ PROVIDER_STOP: "unavailable@plan" }));
    const call = () => handler.execute({ goal_type: "ADAPTATION_PLAN", run_id: "p", input: { book: bookOf(pkg), understanding: pkg.understanding } }, signal);
    const codes = [(await call()), (await call()), (await call())].map((o) => (o.state === "SUCCEEDED" ? "ok" : o.error.code));
    expect(codes).toEqual(["PROVIDER_UNAVAILABLE", "PROVIDER_UNAVAILABLE", "ok"]);
    const auth = await new ReplayHandler(pkg, options({ PROVIDER_STOP: "auth@understanding" })).execute({ goal_type: "BOOK_UNDERSTANDING", run_id: "u", input: { book: bookOf(pkg) } }, signal);
    expect(auth.state === "FAILED" && auth.error.code).toBe("PROVIDER_AUTH");
  });

  it("a cancelled call returns CANCELLED at once", async () => {
    const controller = new AbortController();
    const slow = new ReplayHandler(pkg, parseOptions([], { AGENT_WORKER_TOKEN: TOKEN, REPLAY_PACKAGE: path.join(REPLAYS, "happy-prince-two-tales"), REPLAY_DELAYS: "page=30" }));
    const started = Date.now();
    const pending = slow.execute(pageRequest(pkg, 2), controller.signal);
    setTimeout(() => controller.abort(), 20);
    const out = await pending;
    expect(out.state).toBe("CANCELLED");
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe("HTTP contract", () => {
  const pkg = loadPackage(path.join(REPLAYS, "happy-prince-two-tales"));
  const apps: ReturnType<typeof buildReplayServer>[] = [];
  const server = (extra: Record<string, string> = {}) => {
    const app = buildReplayServer({ token: TOKEN, handler: new ReplayHandler(pkg, options(extra)) });
    apps.push(app);
    return app;
  };
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("answers /healthz and /readyz without a key, and its egress is empty", async () => {
    const saved = process.env.MINIMAX_API_KEY;
    delete process.env.MINIMAX_API_KEY;
    try {
      const app = server();
      expect((await app.inject({ method: "GET", url: "/healthz" })).statusCode).toBe(200);
      const ready = await app.inject({ method: "GET", url: "/readyz" });
      expect(ready.statusCode).toBe(200);
      expect(ready.json()).toMatchObject({ ready: true, replay: true });
      const egress = await app.inject({ method: "GET", url: "/internal/v2/egress", headers: AUTH });
      expect(egress.json()).toEqual({ hosts: {} });
    } finally {
      if (saved !== undefined) process.env.MINIMAX_API_KEY = saved;
    }
  });

  it("checks the bearer token", async () => {
    const app = server();
    expect((await app.inject({ method: "POST", url: "/internal/v2/runs", payload: {} })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/internal/v2/egress", headers: { authorization: `Bearer ${"z".repeat(40)}` } })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/internal/v2/runs", headers: AUTH, payload: { run_id: "x", goal_type: "NOPE" } })).statusCode).toBe(400);
  });

  it("runs a page over HTTP with the shape the backend reads", async () => {
    const app = server();
    const res = await app.inject({ method: "POST", url: "/internal/v2/runs", headers: AUTH, payload: pageRequest(pkg, 1) });
    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.state).toBe("SUCCEEDED");
    expect(data.result.render.svg_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(data.trace.provider).toBe("replay");
    const again = await app.inject({ method: "POST", url: "/internal/v2/runs", headers: AUTH, payload: pageRequest(pkg, 1) });
    expect(again.json().result.render.svg_hash).toBe(data.result.render.svg_hash);
  });

  it("cancel stops a slow run", async () => {
    const app = buildReplayServer({ token: TOKEN, handler: new ReplayHandler(pkg, parseOptions([], { AGENT_WORKER_TOKEN: TOKEN, REPLAY_PACKAGE: path.join(REPLAYS, "happy-prince-two-tales"), REPLAY_DELAYS: "page=30" })) });
    apps.push(app);
    const running = app.inject({ method: "POST", url: "/internal/v2/runs", headers: AUTH, payload: pageRequest(pkg, 2, "slow-1") });
    await new Promise((r) => setTimeout(r, 50));
    const cancel = await app.inject({ method: "POST", url: "/internal/v2/runs/slow-1/cancel", headers: AUTH });
    expect(cancel.json().state).toBe("CANCELLED");
    expect((await running).json().state).toBe("CANCELLED");
    expect((await app.inject({ method: "POST", url: "/internal/v2/runs/none/cancel", headers: AUTH })).statusCode).toBe(404);
  });
});

describe("no key and no outbound request", () => {
  const files = [...readdirSync(path.resolve(here, "../src/replay")).map((f) => path.resolve(here, "../src/replay", f)), path.resolve(here, "../scripts/replay-worker.ts")].filter((f) => statSync(f).isFile());

  it("the replay sources never read a MiniMax key, the Keychain or the network", () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
    for (const file of files) {
      const code = readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join("\n");
      expect(code, file).not.toMatch(/MINIMAX_API_KEY|minimax_api_key|\bsecurity\b.*find-generic|backend\/\.env|dotenv/);
      expect(code, file).not.toMatch(/\bfetch\s*\(|node:https?|node:net|node:tls|node:child_process|undici|XMLHttpRequest|WebSocket|run-goal|goal-runtime|runGoal/);
    }
  });

  it("the packages hold no secret", () => {
    for (const name of readdirSync(REPLAYS)) {
      const all = readdirSync(path.join(REPLAYS, name), { recursive: true }) as string[];
      for (const file of all.filter((f) => f.endsWith(".json"))) {
        expect(readFileSync(path.join(REPLAYS, name, file), "utf8"), `${name}/${file}`).not.toMatch(/sk-[A-Za-z0-9]{16,}|eyJ[A-Za-z0-9_-]{20,}\.|Bearer [A-Za-z0-9]{16,}/);
      }
    }
  });
});
