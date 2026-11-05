import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createApp } from "./app";
import { validateEnvironment } from "./auth";
import { SQLiteStore, PostgresStore } from "./store";
import { finalize, activeShift } from "./game";
import { telegramAPI } from "./payments";
// Node 24 loads local env without a third-party parser. Existing injected values win.
if (existsSync(".env")) process.loadEnvFile(".env");
if (
  process.env.NODE_ENV !== "production" &&
  process.env.DEMO_MODE === undefined &&
  !process.env.BOT_TOKEN
)
  process.env.DEMO_MODE = "true";
const { demo, production } = validateEnvironment(process.env);
const store = demo
  ? new SQLiteStore(process.env.DEMO_DATABASE || ".data/idealab.sqlite")
  : new PostgresStore();
if (store instanceof PostgresStore) await store.seed();
mkdirSync(".data", { recursive: true });
if (demo && !process.env.SESSION_SECRET) {
  const path = ".data/demo-session.key";
  if (!existsSync(path))
    writeFileSync(path, randomBytes(32).toString("hex"), {
      mode: 0o600,
      flag: "wx",
    });
  process.env.SESSION_SECRET = readFileSync(path, "utf8");
}
const app = createApp(store, {
  demo,
  production,
  sessionSecret:
    process.env.SESSION_SECRET ||
    "local-demo-" + randomBytes(32).toString("hex"),
  adminIds: (process.env.ADMIN_TELEGRAM_IDS || "")
    .split(",")
    .filter(Boolean)
    .map((x) => "tg:" + x.trim()),
  webhookSecret: process.env.WEBHOOK_SECRET || "",
  publicUrl: process.env.PUBLIC_URL || "http://localhost:3000",
  supportUrl: process.env.SUPPORT_URL || "",
});
if (!production && !process.env.SERVE_BUILD) {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const express = (await import("express")).default;
  app.use(express.static(resolve("dist"), { maxAge: "1h", index: false }));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
}
const server = app.listen(Number(process.env.PORT || 3000), "0.0.0.0", () =>
  console.log(
    `IdeaLab listening on port ${process.env.PORT || 3000} (${demo ? "DEMO: no Stars charged" : "Telegram"})`,
  ),
);
let working = false;
const timer = setInterval(async () => {
  if (working) return;
  working = true;
  try {
    for (const entry of await store.list()) {
      if (
        !activeShift(entry) &&
        !entry.shifts.some((s) => s.finalized && !s.notified)
      )
        continue;
      const notification = await store.run(entry.id, (g) => {
        finalize(g, Date.now());
        const ready = g.shifts.filter((s) => s.finalized && !s.notified);
        for (const s of ready) s.notified = true;
        return g.settings.notifications && g.id.startsWith("tg:")
          ? ready.map((s) => ({
              id: s.id,
              text: `Смена в «${g.name}» закончилась. Гостей: ${s.report!.served}. Прибыль: ${s.report!.profit} монет. Новая смена ждёт твоего решения.`,
            }))
          : [];
      });
      for (const n of notification)
        try {
          await telegramAPI("sendMessage", {
            chat_id: Number(entry.id.slice(3)),
            text: n.text,
          });
        } catch {
          console.error(
            "Shift notification was not delivered; no automatic duplicate.",
          );
        }
    }
  } catch {
    console.error(
      "Background settlement unavailable; state requests will retry.",
    );
  } finally {
    working = false;
  }
}, 5000);
for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => {
    clearInterval(timer);
    server.close(() => {
      void store.close().then(() => process.exit(0));
    });
  });
