import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import {
  previewEnvironment,
  tunnelUrl,
  menuBelongsToPreview,
  previewBot,
} from "../scripts/telegram-demo";
const info = {
  id: 123456,
  is_bot: true as const,
  first_name: "IdeaLab",
  username: "IdeaLabGame_bot",
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
};
test("Telegram demo server is isolated from real credentials, payments and database, including .env loading", () => {
  const env = previewEnvironment(
    {
      ...process.env,
      NODE_ENV: "production",
      DEMO_MODE: "false",
      BOT_TOKEN: "fixture-secret",
      DATABASE_URL: "postgresql://fixture",
      AI_API_KEY: "fixture-ai",
      ADMIN_TELEGRAM_IDS: "1",
    },
    3001,
  );
  assert.equal(env.NODE_ENV, "development");
  assert.equal(env.DEMO_MODE, "true");
  assert.equal(env.SERVE_BUILD, "true");
  assert.equal(env.BOT_TOKEN, "");
  assert.equal(env.DATABASE_URL, "");
  assert.equal(env.ADMIN_TELEGRAM_IDS, "");
  assert.equal(env.AI_API_KEY, "");
  assert.equal(env.DEMO_DATABASE, ".data/telegram-preview.sqlite");
  const dir = mkdtempSync(join(tmpdir(), "idealab-preview-"));
  try {
    const file = join(dir, ".env");
    writeFileSync(
      file,
      "BOT_TOKEN=fixture-from-env\nDATABASE_URL=postgresql://fixture\nDEMO_MODE=false\n",
    );
    const result = execFileSync(
      process.execPath,
      [
        "-e",
        `process.loadEnvFile(process.argv[1]);process.stdout.write(JSON.stringify({token:process.env.BOT_TOKEN,db:process.env.DATABASE_URL,demo:process.env.DEMO_MODE}))`,
        file,
      ],
      { env, encoding: "utf8" },
    );
    assert.deepEqual(JSON.parse(result), { token: "", db: "", demo: "true" });
  } finally {
    rmSync(dir, { recursive: true });
  }
});
test("Cloudflare logs select an HTTPS quick tunnel URL and reject other hosts", () => {
  assert.equal(
    tunnelUrl("Created https://calm-coffee-town.trycloudflare.com\n"),
    "https://calm-coffee-town.trycloudflare.com",
  );
  assert.equal(tunnelUrl("https://example.com"), null);
  assert.equal(tunnelUrl("http://coffee.trycloudflare.com"), null);
});
test("menu restoration only applies while it still points to this preview", () => {
  const url = "https://coffee.trycloudflare.com";
  assert.equal(
    menuBelongsToPreview(
      { type: "web_app", text: "demo", web_app: { url } },
      url,
    ),
    true,
  );
  assert.equal(menuBelongsToPreview({ type: "commands" }, url), false);
  assert.equal(
    menuBelongsToPreview(
      {
        type: "web_app",
        text: "new",
        web_app: { url: "https://other.trycloudflare.com" },
      },
      url,
    ),
    false,
  );
});
test("Telegram preview /start opens the demo and every real pre-checkout is declined", async () => {
  const url = "https://coffee.trycloudflare.com",
    bot = previewBot("123456:fixture-token", url, info),
    calls: { method: string; payload: any }[] = [];
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload });
    return { ok: true, result: true } as any;
  });
  await bot.handleUpdate({
    update_id: 1,
    message: {
      message_id: 1,
      date: 1000,
      chat: { id: 7, type: "private", first_name: "Test" },
      from: { id: 7, is_bot: false, first_name: "Test" },
      text: "/start",
      entities: [{ type: "bot_command", offset: 0, length: 6 }],
    },
  });
  const sent = calls.find((c) => c.method === "sendMessage");
  assert.ok(sent);
  assert.match(sent.payload.text, /Stars не списываются/);
  assert.equal(
    sent.payload.reply_markup.inline_keyboard[0][0].web_app.url,
    url,
  );
  await bot.handleUpdate({
    update_id: 2,
    pre_checkout_query: {
      id: "query",
      from: { id: 7, is_bot: false, first_name: "Test" },
      currency: "XTR",
      total_amount: 150,
      invoice_payload: "untrusted",
    },
  });
  const answer = calls.find((c) => c.method === "answerPreCheckoutQuery");
  assert.ok(answer);
  assert.equal(answer.payload.ok, false);
  assert.ok(
    !calls.some(
      (c) => c.method === "createInvoiceLink" || c.method === "sendInvoice",
    ),
  );
});
test("preview command refuses a production process before loading a token or starting services", () => {
  try {
    execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/telegram-demo.ts"],
      {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: "production" },
        stdio: "pipe",
      },
    );
    assert.fail("must refuse");
  } catch (e) {
    const error = e as { status?: number; stderr?: Buffer };
    assert.equal(error.status, 1);
    assert.match(error.stderr!.toString(), /NODE_ENV=production запрещён/);
  }
});
