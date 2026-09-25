import { chromium } from "playwright-core";
// Clicks "Retry failed pages" on the book page in Chrome and waits for the edition to finish.
// Usage: node scripts/acceptance/ui-retry.mjs BOOK_ID OUT_DIR
const [book, out] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
await page.goto(`http://localhost:3100/books/${book}`);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/06-book-before-retry.png`, fullPage: true });
const btn = page.getByRole("button", { name: /retry failed pages/i });
console.log("retry buttons:", await btn.count());
await btn.first().click();
const t0 = Date.now();
for (;;) {
  const e = await (await fetch(`http://127.0.0.1:8000/books/${book}/editions`)).json();
  const ed = await (await fetch(`http://127.0.0.1:8000/editions/${e[0].id}`)).json();
  const p32 = ed.pages.find((p) => p.page_number === 32);
  if (["complete", "completed_with_failures", "failed"].includes(ed.status) && Date.now() - t0 > 5000) {
    console.log("status", ed.status, "page32", p32.status, "after", (Date.now() - t0) / 1000, "s", JSON.stringify(ed.totals));
    break;
  }
  await page.waitForTimeout(3000);
}
await page.reload();
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/07-book-after-retry.png`, fullPage: true });
await browser.close();
