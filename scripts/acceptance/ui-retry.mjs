import { chromium } from "playwright-core";
// Clicks "Retry failed pages" on the book page in Chrome and waits for the edition to finish.
// Usage: node scripts/acceptance/ui-retry.mjs BOOK_ID OUT_DIR [--web http://127.0.0.1:3100] [--api http://127.0.0.1:8000]
const argv = process.argv.slice(2);
function opt(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const WEB = opt("web", "http://127.0.0.1:3100").replace(/\/$/, "");
const API = opt("api", "http://127.0.0.1:8000").replace(/\/$/, "");
const [book, out] = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && ["--web", "--api"].includes(argv[i - 1])));
if (!book || !out) {
  console.error("usage: node scripts/acceptance/ui-retry.mjs BOOK_ID OUT_DIR [--web URL] [--api URL]");
  process.exit(2);
}
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
await page.goto(`${WEB}/books/${book}`);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/06-book-before-retry.png`, fullPage: true });
const before = await (await fetch(`${API}/books/${book}/editions`)).json();
const failed = (await (await fetch(`${API}/editions/${before[0].id}`)).json()).pages
  .filter((p) => p.status === "failed")
  .map((p) => p.page_number);
console.log("failed pages before retry:", failed.join(", ") || "none");
const btn = page.getByRole("button", { name: /retry failed pages/i });
console.log("retry buttons:", await btn.count());
await btn.first().click();
const t0 = Date.now();
for (;;) {
  const e = await (await fetch(`${API}/books/${book}/editions`)).json();
  const ed = await (await fetch(`${API}/editions/${e[0].id}`)).json();
  const retried = ed.pages.filter((p) => failed.includes(p.page_number)).map((p) => `${p.page_number}:${p.status}`);
  if (["complete", "completed_with_failures", "failed"].includes(ed.status) && Date.now() - t0 > 5000) {
    console.log("status", ed.status, "retried", retried.join(" "), "after", (Date.now() - t0) / 1000, "s", JSON.stringify(ed.totals));
    break;
  }
  await page.waitForTimeout(3000);
}
await page.reload();
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/07-book-after-retry.png`, fullPage: true });
await browser.close();
