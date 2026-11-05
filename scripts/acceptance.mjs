import { createRequire } from "node:module";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
const require = createRequire(import.meta.url),
  { chromium } = require("playwright");
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ||
    (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-webgl"],
});
const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  }),
  page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
mkdirSync("artifacts", { recursive: true });
try {
  await page.goto("http://127.0.0.1:3000");
  await page.getByRole("button", { name: "Пропустить подсказки" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Подтвердить" })
    .click();
  await page.getByRole("button", { name: "Открыть кофейню" }).waitFor();
  const navigate = async (name) => {
    await page
      .locator(".bottom-nav")
      .getByRole("button", { name, exact: true })
      .click();
  };
  await navigate("Развитие");
  const machine = page
    .locator(".upgrade-card")
    .filter({ has: page.getByRole("heading", { name: "Кофемашина «Утро»" }) });
  await machine.getByRole("button").click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Подтвердить" })
    .click();
  await machine.getByRole("button", { name: "Радует гостей" }).waitFor();
  await page.getByRole("button", { name: /Наша команда/ }).click();
  await page
    .locator(".employee-card")
    .filter({ has: page.getByRole("heading", { name: "Лола", exact: true }) })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Нанять/ })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Подтвердить" })
    .click();
  await page
    .locator(".employee-card")
    .filter({ has: page.getByRole("heading", { name: "Лола", exact: true }) })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Назначить на смену" })
    .click();
  await navigate("История");
  await page
    .getByRole("heading", { name: "Место у окна", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Рассказать о кофейне/ })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Подтвердить" })
    .click();
  await page.getByRole("button", { name: "Продолжить историю" }).click();
  await navigate("Магазин");
  await page
    .locator(".product-loft")
    .getByRole("button", { name: "Подробнее" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Примерить" })
    .click();
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await navigate("Магазин");
  await page
    .locator(".product-loft")
    .getByRole("button", { name: "150" })
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "150" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Подтвердить" })
    .click();
  await page.getByRole("button", { name: "Подтвердить демо-покупку" }).click();
  await page
    .locator(".product-loft")
    .getByRole("button", { name: "Примерить" })
    .click();
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  await page.getByRole("button", { name: "Оформление", exact: true }).click();
  await page
    .locator(".inventory-strip button")
    .filter({ has: page.locator('img[src="/art/vase.svg"]') })
    .click();
  await page.getByRole("spinbutton", { name: "Клетка X" }).fill("5");
  await page.getByRole("spinbutton", { name: "Клетка Y" }).fill("8");
  if (
    !(await page
      .getByRole("button", { name: "Поставить", exact: true })
      .isDisabled())
  )
    throw new Error("Door placement must be invalid");
  await page.getByRole("spinbutton", { name: "Клетка X" }).fill("9");
  await page.getByRole("spinbutton", { name: "Клетка Y" }).fill("4");
  await page.getByRole("button", { name: "Поставить", exact: true }).click();
  await page.getByRole("button", { name: "Оформление", exact: true }).click();
  await page.screenshot({
    path: "artifacts/acceptance-loft.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Открыть кофейню" }).click();
  await page.getByRole("heading", { name: "Кофейня в своём ритме" }).waitFor();
  console.log(
    "PASS tutorial, upgrade, hire, assignment, story, preview, demo purchase, apply, invalid/valid placement, shift start. Waiting for real 5-minute shift.",
  );
  await page.reload();
  await page.getByRole("heading", { name: "Кофейня в своём ритме" }).waitFor();
  await page
    .getByRole("button", { name: /Последняя смена/ })
    .waitFor({ timeout: 330000 });
  await page.getByRole("button", { name: /Последняя смена/ }).click();
  await page
    .getByRole("heading", { name: "Хорошая работа. Смена завершена" })
    .waitFor();
  await page.screenshot({ path: "artifacts/acceptance-report.png" });
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "PASS real 5-minute shift, reload persistence and financial report.",
  );
  writeFileSync(
    "artifacts/acceptance-result.json",
    JSON.stringify({ ok: true, realShiftSeconds: 300, errors }, null, 2),
  );
} catch (e) {
  await page.screenshot({
    path: "artifacts/acceptance-failure.png",
    fullPage: true,
  });
  throw e;
} finally {
  await browser.close();
}
