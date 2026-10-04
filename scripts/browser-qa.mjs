import { chromium } from "playwright";
import fs from "node:fs";
fs.mkdirSync("artifacts", { recursive: true });
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || undefined,
  headless: true,
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1150 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(process.env.PREVIEW_URL || "http://127.0.0.1:5173/");
await page.waitForSelector(".hex");
await page.evaluate(() => document.fonts.ready);
const count = await page.locator(".hex").count();
if (count !== 1000) throw new Error("Grid must have 1,000 cells");
await page.screenshot({ path: "artifacts/desktop.png", fullPage: true });
const currentRow = page
  .locator(".player-stats>div")
  .filter({ hasText: "This round" });
const beforeCurrent = await currentRow.locator("dd").textContent();
const beforeNext = parseFloat(
  await page.locator(".next-round-odds dd").textContent(),
);
await page.locator("#amount").fill("0.1");
await page
  .getByRole("button", { name: "Preview protection", exact: true })
  .click();
await page.getByRole("status").waitFor();
const afterNext = parseFloat(
  await page.locator(".next-round-odds dd").textContent(),
);
if (!(afterNext < beforeNext))
  throw new Error("Next-round odds did not decrease after deposit");
if ((await currentRow.locator("dd").textContent()) !== beforeCurrent)
  throw new Error("Active snapshot odds changed");
console.log(
  JSON.stringify({ beforeNext, afterNext, currentOdds: beforeCurrent }),
);
await page.screenshot({ path: "artifacts/odds-updated.png", fullPage: true });
if (
  !(await page
    .getByRole("status")
    .textContent()
    .then((t) => t.includes("No ETH moved")))
)
  throw new Error("Missing preview disclosure");
await page.getByRole("button", { name: "Simulate elimination" }).click();
await page
  .getByRole("button", { name: "Elimination log", exact: true })
  .click();
await page.waitForSelector(".activity-list");
await page.getByRole("button", { name: "The arena", exact: true }).click();
await page.getByRole("button", { name: "The rules", exact: false }).click();
await page.getByRole("dialog").waitFor();
await page.keyboard.press("Escape");
if (await page.getByRole("dialog").count())
  throw new Error("Escape did not close dialog");
await page.getByRole("button", { name: "Go on-chain", exact: false }).click();
await page.getByRole("dialog").waitFor();
await page.getByRole("button", { name: "Close dialog" }).click();
await page.getByRole("textbox", { name: "Find player by number" }).fill("800");
await page.getByRole("button", { name: "Find player", exact: true }).click();
if (!(await page.getByRole("heading", { name: "Player #800" }).count()))
  throw new Error("Search failed");
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: "artifacts/mobile.png", fullPage: true });
if (
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
)
  throw new Error("Mobile page overflows");
await browser.close();
if (errors.length) throw new Error(errors.join("\n"));
console.log(
  JSON.stringify({
    gridCells: count,
    checks: [
      "next-round odds decrease while current odds stay fixed",
      "elimination",
      "log",
      "rules",
      "deployment modal",
      "search",
      "mobile width",
    ],
    consoleErrors: errors,
  }),
);
