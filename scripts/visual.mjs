import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require("/opt/codex/cua_node/lib/node_modules/playwright"));
}
mkdirSync("artifacts", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROMIUM_PATH ||
    (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-webgl",
  ],
});
const errors = [];
for (const [width, height] of [
  [1440, 1100],
  [390, 844],
  [360, 800],
  [768, 1024],
]) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(r.status() + " " + r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.goto(process.env.APP_URL || "http://127.0.0.1:3000");
  await page
    .getByRole("heading", { name: "Точка тепла", exact: true })
    .waitFor();
  await page.locator("canvas").waitFor();
  await page.waitForTimeout(2500);
  await page.screenshot({
    path: `artifacts/cafe-${width}.png`,
    fullPage: true,
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  if (overflow) errors.push(`Horizontal overflow at ${width}`);
  if (width === 390) {
    await page.getByRole("button", { name: "Это моя кофейня" }).click();
    await page.getByRole("button", { name: "Установить кофемашину" }).click();
    await page.getByRole("button", { name: "Встретить гостя" }).click();
    await page.getByRole("button", { name: "Приготовить эспрессо" }).click();
    await page
      .getByRole("button", { name: "Зелёный уголок", exact: true })
      .click();
    await page.getByRole("button", { name: "Начать свою историю" }).click();
    await page.getByRole("button", { name: "Открыть кофейню" }).click();
    await page
      .getByRole("heading", { name: "Кофейня в своём ритме" })
      .waitFor();
    await page.screenshot({
      path: "artifacts/shift-mobile.png",
      fullPage: true,
    });
    await page.reload();
    await page
      .getByRole("heading", { name: "Кофейня в своём ритме" })
      .waitFor();
    for (const title of ["Развитие", "История", "Магазин", "Профиль"]) {
      await page
        .locator(".bottom-nav")
        .getByRole("button", { name: title, exact: true })
        .click();
      await page.waitForTimeout(300);
      await page.screenshot({
        path: `artifacts/page-${title}.png`,
        fullPage: true,
      });
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )
      )
        errors.push("Overflow " + title);
    }
  }
  await context.close();
}
console.log(JSON.stringify({ errors }, null, 2));
await browser.close();
if (errors.length) process.exitCode = 1;
