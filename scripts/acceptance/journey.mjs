#!/usr/bin/env node
/**
 * Live acceptance journey (REAL MiniMax calls — it spends money).
 *
 * Drives a running stack (./start.sh) in Google Chrome: upload a PDF through
 * the UI, click Generate, read pages in the main reader (desktop page mode and
 * phone panel mode), then checks the persisted evidence. Exits non-zero if:
 *   - any model call did not go through the agent worker (receipts: provider,
 *     model allowlist, goal types) or the worker contacted a non-MiniMax host
 *     (so an image-generation endpoint was called);
 *   - the reader shows anything other than the persisted SVG of that page
 *     (element tree compared against the API's stored SVG; svg_hash verified);
 *   - authored panel geometry is missing from the page, or panel mode does not
 *     frame the stored panels;
 *   - a core/supporting claim is neither conveyed, nor omitted with a reason,
 *     nor listed as lost on a failed page; or the edition says "complete" with
 *     failed pages.
 *
 * Usage:
 *   node scripts/acceptance/journey.mjs --pdf book.pdf --out DIR [--web http://localhost:3100]
 *        [--api http://127.0.0.1:8000] [--pages 4] [--full] [--timeout-min 90]
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : "true";
}

const WEB = arg("web", "http://localhost:3100");
const API = arg("api", "http://127.0.0.1:8000");
const PDF = arg("pdf");
const OUT = arg("out");
const READ_PAGES = Number(arg("pages", "4"));
const FULL = arg("full") === "true";
const TIMEOUT_MS = Number(arg("timeout-min", "90")) * 60_000;
if ((!PDF && !process.argv.includes("--edition")) || !OUT) {
  console.error("usage: --pdf FILE --out DIR [--full]   |   --edition ID --out DIR");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const report = { started_at: new Date().toISOString(), web: WEB, api: API, pdf: PDF, checks: [], timings: {}, screenshots: [] };
const check = (name, ok, detail = "") => {
  report.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const api = async (p) => {
  const r = await fetch(`${API}${p}`);
  if (!r.ok) throw new Error(`${p} → HTTP ${r.status}`);
  return r.json();
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (page, name) => {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  report.screenshots.push(file);
};

/** In-page comparison: reader DOM vs the stored SVG re-parsed the same way. */
async function readerMatchesStored(page, editionId, pageNumber) {
  return page.evaluate(
    async ({ api, editionId, pageNumber }) => {
      const stored = await (await fetch(`${api}/editions/${editionId}/pages/${pageNumber}`)).json();
      const hosts = Array.from(document.querySelectorAll("div")).filter((d) => d.shadowRoot && d.shadowRoot.querySelector("svg"));
      // The page being read is the largest visible shadow-hosted SVG.
      const visible = hosts
        .map((h) => ({ h, r: h.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 50 && r.height > 50 && r.right > 0 && r.left < innerWidth)
        .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height);
      if (!visible.length || !stored.svg) return { ok: false, reason: "no page svg in the DOM or no stored svg" };
      const root = visible[0].h.shadowRoot.querySelector("svg");
      const t = document.createElement("template");
      t.innerHTML = stored.svg;
      const ref = t.content.querySelector("svg");
      const digest = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, "0")).join("");
      return {
        ok: root.innerHTML === ref.innerHTML,
        storedHashOk: (await digest(stored.svg)) === stored.svg_hash,
        panelGroups: root.querySelectorAll('g[role="group"]').length,
        storedPanels: stored.panels.length,
        viewBox: root.getAttribute("viewBox"),
        panels: stored.panels,
        renderer: stored.renderer_version,
      };
    },
    { api: API, editionId, pageNumber },
  );
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  await runJourney();
} catch (error) {
  check("journey ran to the end", false, error instanceof Error ? error.message.split("\n")[0] : String(error));
} finally {
  await browser.close();
  report.finished_at = new Date().toISOString();
  report.passed = report.checks.length > 0 && report.checks.every((c) => c.ok);
  writeFileSync(path.join(OUT, "journey-report.json"), JSON.stringify(report, null, 2));
  console.log(`\n${report.passed ? "JOURNEY PASSED" : "JOURNEY FAILED"} — report: ${path.join(OUT, "journey-report.json")}`);
  process.exitCode = report.passed ? 0 : 1;
}

async function runJourney() {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await desktop.newPage();

  const EXISTING = arg("edition");
  let bookId;
  let edition;
  const tGen = Date.now();
  if (EXISTING) {
    // Re-verify an existing edition (after a fix/redraw) without generating again.
    edition = await api(`/editions/${EXISTING}`);
    bookId = edition.book_id;
    report.book_id = bookId;
    report.reverified_existing_edition = true;
  } else {
    // 1. Upload through the UI.
    const t0 = Date.now();
    await page.goto(`${WEB}/upload`);
    await page.setInputFiles('input[type="file"]', PDF);
    await page.waitForURL(/\/books\/[0-9a-f]{24}/, { timeout: 5 * 60_000 });
    bookId = page.url().match(/books\/([0-9a-f]{24})/)[1];
    report.book_id = bookId;
    report.timings.upload_to_book_page_s = (Date.now() - t0) / 1000;
    await page.getByRole("button", { name: "Generate manga" }).waitFor({ timeout: 5 * 60_000 });
    await shot(page, "01-book-parsed");

    // 2. Generate.
    await page.getByRole("button", { name: "Generate manga" }).click();
    for (;;) {
      const list = await api(`/books/${bookId}/editions`);
      if (list.length) {
        edition = list[0];
        break;
      }
      await sleep(1000);
    }
  }
  report.edition_id = edition.id;
  report.job_id = edition.job_id;
  check("Generate created an edition with a generate job", Boolean(edition.id && edition.job_id));
  check("edition policy records the harness and no image models", edition.policy?.image_models === "none" && /agent-worker/.test(edition.policy?.harness ?? ""), JSON.stringify(edition.policy));

  // 3. Wait for page 1, then read while the rest are drawn.
  let firstPageAt = null;
  const stageLog = [];
  const deadline = Date.now() + TIMEOUT_MS;
  let state;
  for (;;) {
    state = await api(`/editions/${edition.id}`);
    const stage = `${state.status} ${state.job?.stage ?? ""} ${state.job?.done ?? 0}/${state.job?.total ?? 0}`;
    if (stageLog.at(-1)?.stage !== stage) stageLog.push({ t: (Date.now() - tGen) / 1000, stage });
    const accepted = state.pages.filter((p) => p.status === "accepted").map((p) => p.page_number);
    if (!firstPageAt && accepted.includes(1)) firstPageAt = Date.now();
    const readable = accepted.filter((n) => n <= READ_PAGES).length >= Math.min(READ_PAGES, state.page_total || READ_PAGES);
    const finished = ["complete", "completed_with_failures", "failed", "cancelled"].includes(state.status);
    if ((!FULL && readable) || finished || Date.now() > deadline) break;
    await sleep(3000);
  }
  report.stage_log = stageLog;
  report.timings.generate_to_first_page_s = firstPageAt ? (firstPageAt - tGen) / 1000 : null;
  check("page 1 was drawn", Boolean(firstPageAt) || EXISTING, EXISTING ? "existing edition" : `${report.timings.generate_to_first_page_s}s after Generate`);
  await page.reload();
  await shot(page, "02-book-progress");

  // 4. Desktop reader: consecutive pages, exact artifact, geometry.
  const readable = state.pages.filter((p) => p.status === "accepted").map((p) => p.page_number).slice(0, FULL ? 999 : READ_PAGES);
  for (const n of readable) {
    await page.goto(`${WEB}/books/${bookId}/read?edition=${edition.id}&page=${n}`);
    await page.waitForFunction(() => Array.from(document.querySelectorAll("div")).some((d) => d.shadowRoot?.querySelector("svg")), null, { timeout: 30_000 });
    await sleep(400);
    const m = await readerMatchesStored(page, edition.id, n);
    check(`page ${n}: reader shows the exact persisted SVG`, m.ok && m.storedHashOk, `renderer ${m.renderer}`);
    check(`page ${n}: authored panel geometry present`, m.panelGroups === m.storedPanels && m.storedPanels > 0, `${m.panelGroups} panel groups / ${m.storedPanels} stored panels`);
    await shot(page, `03-desktop-page-${String(n).padStart(2, "0")}`);
  }
  // Keyboard reading: → from the first page moves to the next page in the URL.
  await page.goto(`${WEB}/books/${bookId}/read?edition=${edition.id}&page=1`);
  await sleep(800);
  await page.keyboard.press("ArrowRight");
  await sleep(800);
  check("→ turns to the next page (URL keeps the page)", /[?&]page=2(\b|&|$)/.test(page.url()), page.url());
  // Failed pages are shown honestly, never blank or faked.
  for (const failed of state.pages.filter((p) => p.status === "failed")) {
    await page.goto(`${WEB}/books/${bookId}/read?edition=${edition.id}&page=${failed.page_number}`);
    await sleep(1200);
    const body = await page.locator("main, body").first().innerText();
    check(`failed page ${failed.page_number} is shown as failed with its reason`, /could not be drawn/i.test(body), failed.error ?? "");
    await shot(page, `03-desktop-failed-page-${failed.page_number}`);
  }
  // Sources drawer on the first page.
  await page.goto(`${WEB}/books/${bookId}/read?edition=${edition.id}&page=${readable[0] ?? 1}`);
  await sleep(800);
  const sourcesBtn = page.getByRole("button", { name: /sources/i }).first();
  if (await sourcesBtn.count()) {
    await sourcesBtn.click();
    await sleep(500);
    const drawer = await page.locator("#source-drawer").innerText().catch(() => "");
    check("sources drawer lists PDF pages and fidelity labels", /PDF page/i.test(drawer) && /(Quoted|Paraphrased|Dramatized|metaphor)/i.test(drawer));
    await shot(page, "04-desktop-sources");
  } else {
    check("sources drawer button exists", false);
  }

  // 5. Phone: panel mode frames the stored panels.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mp = await phone.newPage();
  await mp.goto(`${WEB}/books/${bookId}/read?edition=${edition.id}&page=${readable[0] ?? 1}`);
  await mp.waitForFunction(() => Array.from(document.querySelectorAll("div")).some((d) => d.shadowRoot?.querySelector("svg")), null, { timeout: 30_000 });
  await sleep(1500);
  const first = await readerMatchesStored(mp, edition.id, readable[0] ?? 1);
  const ordered = [...first.panels].sort((a, b) => a.order - b.order);
  for (let i = 0; i < Math.min(ordered.length, 5); i += 1) {
    const vb = (await readerMatchesStored(mp, edition.id, readable[0] ?? 1)).viewBox.split(/\s+/).map(Number);
    const b = ordered[i].bbox;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    // The stored panel is fully inside the camera, and the camera is tight on at least one axis.
    const inside = b.x >= vb[0] - 1 && b.y >= vb[1] - 1 && b.x + b.w <= vb[0] + vb[2] + 1 && b.y + b.h <= vb[1] + vb[3] + 1;
    const tight = vb[2] <= b.w * 1.15 + 60 || vb[3] <= b.h * 1.15 + 60;
    const frames = inside && tight && cx >= vb[0] && cy >= vb[1];
    check(`phone panel mode frames stored panel ${i + 1}`, frames, `viewBox ${vb.map((v) => Math.round(v)).join(" ")}`);
    await shot(mp, `05-phone-panel-${i + 1}`);
    await mp.mouse.click(360, 420); // right third: next panel
    await sleep(1500); // let the camera finish its move before measuring
  }

  // 6. Finish: wait for the whole book when asked, then audit the evidence.
  if (FULL) {
    while (!["complete", "completed_with_failures", "failed", "cancelled"].includes(state.status) && Date.now() < deadline) {
      await sleep(5000);
      state = await api(`/editions/${edition.id}`);
    }
    report.timings.generate_to_finished_s = (Date.now() - tGen) / 1000;
  }
  const receipts = await api(`/editions/${edition.id}/receipts`);
  const allowedModels = new Set(["MiniMax-M3", "MiniMax-M2.7-highspeed", "MiniMax-M2.7"]);
  const goals = new Set(["BOOK_UNDERSTANDING", "ADAPTATION_PLAN", "MANGA_PAGE"]);
  check("every model call is a receipted harness goal on an allowed MiniMax model", receipts.calls.length > 0 && receipts.calls.every((c) => c.provider === "minimax" && allowedModels.has(c.model) && goals.has(c.goal_type)), `${receipts.calls.length} calls`);
  const egressHosts = Object.keys(receipts.worker_egress ?? {});
  check("worker egress: only the MiniMax API (zero image-model calls)", egressHosts.length > 0 && egressHosts.every((h) => h.startsWith("api.minimax.io/")), JSON.stringify(receipts.worker_egress));
  const accepted = state.pages.filter((p) => p.status === "accepted").length;
  const failed = state.pages.filter((p) => p.status === "failed").length;
  const pageCalls = receipts.calls.filter((c) => c.goal_type === "MANGA_PAGE" && c.state === "SUCCEEDED").length;
  check("every accepted page has a successful MANGA_PAGE receipt", pageCalls >= accepted, `${pageCalls} successful page calls, ${accepted} accepted pages`);
  if (["complete", "completed_with_failures"].includes(state.status)) {
    const cov = state.coverage;
    check("edition status is honest", state.status === "complete" ? failed === 0 && cov.lost_to_failed_pages.length === 0 : failed > 0 || cov.core_not_conveyed.length > 0, `${state.status}, ${accepted} accepted, ${failed} failed`);
    check("no required claim silently lost (every core/supporting claim planned or omitted with a reason)", Array.isArray(cov.required_not_planned) && cov.required_not_planned.length === 0 && cov.omitted_by_plan.every((o) => (o.reason ?? "").trim().length > 0), `conveyed ${cov.conveyed.length}/${cov.claims_total}, omitted ${cov.omitted_by_plan.length}, lost ${cov.lost_to_failed_pages.length}, required not planned ${cov.required_not_planned?.length}`);
    check("every core claim conveyed or accounted for", cov.core_not_conveyed.every((c) => cov.lost_to_failed_pages.includes(c)), `core not conveyed: ${cov.core_not_conveyed.join(",") || "none"}`);
  }
  report.edition = { status: state.status, page_total: state.page_total, accepted, failed, totals: state.totals, coverage: state.coverage, policy: state.policy };
  report.receipts_summary = {
    calls: receipts.calls.length,
    by_goal: receipts.calls.reduce((acc, c) => ({ ...acc, [c.goal_type]: (acc[c.goal_type] ?? 0) + 1 }), {}),
    totals: receipts.totals,
    worker_egress: receipts.worker_egress,
  };
}
