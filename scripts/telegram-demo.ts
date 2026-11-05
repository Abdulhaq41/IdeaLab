import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { Bot, InlineKeyboard } from "grammy";
import type { UserFromGetMe, MenuButton } from "grammy/types";

class PreviewError extends Error {}
// grammY 1.x declares an older abort-controller interface; Node 24's native
// signal implements the runtime protocol used by node-fetch.
function telegramTimeout(ms: number) {
  return AbortSignal.timeout(ms) as unknown as NonNullable<
    Parameters<Bot["api"]["getMe"]>[0]
  >;
}
const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export function previewEnvironment(
  base: NodeJS.ProcessEnv,
  port = 3001,
): NodeJS.ProcessEnv {
  return {
    ...base,
    NODE_ENV: "development",
    DEMO_MODE: "true",
    SERVE_BUILD: "true",
    PORT: String(port),
    DEMO_DATABASE: ".data/telegram-preview.sqlite",
    BOT_TOKEN: "",
    DATABASE_URL: "",
    SESSION_SECRET: "",
    WEBHOOK_SECRET: "",
    ADMIN_TELEGRAM_IDS: "",
    PUBLIC_URL: "",
    SUPPORT_URL: "",
    AI_API_KEY: "",
    TELEGRAM_TEST: "false",
    IDEALAB_ENV_FILE: "",
  };
}
export function tunnelUrl(text: string): string | null {
  const matches = text.match(
    /https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com\b/g,
  );
  if (!matches) return null;
  const u = new URL(matches.at(-1)!);
  return u.protocol === "https:" && !u.username && !u.password && !u.port
    ? u.origin
    : null;
}
export function menuBelongsToPreview(menu: MenuButton, url: string) {
  return menu.type === "web_app" && menu.web_app.url === url;
}

export function previewBot(token: string, url: string, info?: UserFromGetMe) {
  const u = new URL(url);
  if (u.protocol !== "https:")
    throw new PreviewError("Для Telegram нужен HTTPS.");
  const bot = new Bot(token, info ? { botInfo: info } : {});
  // grammY start() normally calls deleteWebhook. A preview must never remove one.
  bot.api.config.use(async (prev, method, payload, signal) => {
    if (method === "deleteWebhook") {
      const current = await bot.api.getWebhookInfo(signal);
      if (current.url)
        throw new PreviewError(
          "Обнаружен webhook. Он сохранён, тестовая обработка не запущена.",
        );
      return { ok: true, result: true } as Awaited<ReturnType<typeof prev>>;
    }
    return prev(method, payload, signal);
  });
  const keyboard = () =>
    new InlineKeyboard().webApp("Открыть IdeaLab · демо", url);
  bot.command("start", (ctx) =>
    ctx.reply(
      "IdeaLab · тестовая кофейня\nОткрой игру кнопкой ниже. Покупки демонстрационные, Stars не списываются. Доступ работает, пока компьютер владельца и окно запуска включены.",
      { reply_markup: keyboard() },
    ),
  );
  bot.command("help", (ctx) =>
    ctx.reply(
      "Это тестовая версия IdeaLab. Смена длится 5 минут. Сохранение этой демонстрации хранится на компьютере владельца. Временный адрес меняется при новом запуске.",
      { reply_markup: keyboard() },
    ),
  );
  bot.command(["support", "paysupport"], (ctx) =>
    ctx.reply(
      "Это демонстрация без настоящих оплат. За помощью по тестовому запуску обратитесь к владельцу бота. Не отправляйте токены и реквизиты.",
    ),
  );
  bot.command("terms", (ctx) =>
    ctx.reply(
      "IdeaLab — игра. Монеты не выводятся. В этом тесте нет настоящих платежей или подписок. Условия: " +
        url +
        "/terms",
    ),
  );
  bot.on("pre_checkout_query", (ctx) =>
    ctx.answerPreCheckoutQuery(false, {
      error_message:
        "Включён демонстрационный режим. Настоящие платежи недоступны.",
    }),
  );
  bot.on("message:successful_payment", (ctx) =>
    ctx.reply(
      "Этот запуск предназначен только для демонстрации и не выдаёт покупки за Stars. По настоящему платежу обратитесь к владельцу бота.",
    ),
  );
  bot.catch(() => {
    console.error(
      "Не удалось обработать сообщение Telegram. Токен и данные авторизации не выводятся.",
    );
  });
  return bot;
}
async function hiddenToken() {
  if (!process.stdin.isTTY)
    throw new PreviewError(
      "Запустите команду в обычном терминале: токен вводится скрыто.",
    );
  process.stdout.write(
    "Вставьте токен бота из BotFather и нажмите Enter (символы скрыты): ",
  );
  const silent = new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });
  const rl = createInterface({
    input: process.stdin,
    output: silent,
    terminal: true,
    historySize: 0,
  });
  try {
    return await new Promise<string>((resolve, reject) => {
      rl.once("SIGINT", () => reject(new PreviewError("Ввод отменён.")));
      rl.question("", (answer) => resolve(answer.trim()));
    });
  } finally {
    rl.close();
    process.stdout.write("\n");
  }
}
async function portAvailable(port: number) {
  await new Promise<void>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", () =>
      reject(
        new PreviewError(
          `Порт ${port} занят. Закройте предыдущее окно telegram-demo или задайте IDEALAB_PREVIEW_PORT.`,
        ),
      ),
    );
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve()));
  });
}
async function ready(url: string, timeout = 30000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    try {
      const response = await fetch(url + "/health", {
        signal: AbortSignal.timeout(4000),
      });
      if (response.ok) {
        const body = (await response.json()) as { ok?: boolean; mode?: string };
        if (body.ok && body.mode === "demo") return;
      }
    } catch {}
    await delay(500);
  }
  throw new PreviewError(
    "Демонстрация не ответила. Проверьте соединение и сообщения сервера. Проверка HTTPS не отключалась.",
  );
}

export async function runPreview() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  process.chdir(root);
  if (process.env.NODE_ENV === "production")
    throw new PreviewError(
      "Тестовый запуск предназначен для локального компьютера, NODE_ENV=production запрещён.",
    );
  const port = Number(process.env.IDEALAB_PREVIEW_PORT || 3001);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new PreviewError(
      "IDEALAB_PREVIEW_PORT должен быть от 1024 до 65535.",
    );
  if (
    spawnSync("cloudflared", ["--version"], {
      stdio: "ignore",
      windowsHide: true,
    }).status !== 0
  )
    throw new PreviewError(
      "Сначала установите cloudflared: winget install --id Cloudflare.cloudflared -e\nЗатем откройте новое окно PowerShell и повторите запуск.",
    );
  await portAvailable(port);
  const localConfig = ".data/telegram-preview.env",
    newToken = process.argv.includes("--new-token");
  if (!newToken && !process.env.BOT_TOKEN) {
    for (const p of [localConfig, ".data/telegram.env", ".env"])
      if (existsSync(p)) {
        process.loadEnvFile(p);
        if (process.env.BOT_TOKEN) break;
      }
  }
  const token = newToken
    ? await hiddenToken()
    : process.env.BOT_TOKEN?.trim() || (await hiddenToken());
  if (!/^\d{5,}:[A-Za-z0-9_-]+$/.test(token))
    throw new PreviewError(
      "Формат токена не распознан. Вставьте только токен, без кавычек и обратных апострофов.",
    );
  const setup = new Bot(token);
  let me: UserFromGetMe;
  try {
    me = await setup.api.getMe(telegramTimeout(12000));
  } catch {
    throw new PreviewError(
      "Telegram не подтвердил токен. Проверьте сеть и ключ. Для нового ключа повторите команду с --new-token.",
    );
  }
  const expected = (
    process.env.IDEALAB_PREVIEW_BOT ||
    process.env.BOT_USERNAME ||
    "IdeaLabGame_bot"
  )
    .replace(/^@/, "")
    .toLowerCase();
  if (me.username?.toLowerCase() !== expected)
    throw new PreviewError(
      `Токен принадлежит @${me.username}, ожидался @${expected}. Настройки не изменены. Если нужен именно этот бот, задайте IDEALAB_PREVIEW_BOT с его username.`,
    );
  const webhook = await setup.api.getWebhookInfo(telegramTimeout(10000));
  if (webhook.url)
    throw new PreviewError(
      "У бота уже есть webhook. Он сохранён. Для теста используйте отдельного бота или сначала осознанно отключите старое подключение.",
    );
  mkdirSync(".data", { recursive: true });
  if (newToken || !existsSync(localConfig))
    writeFileSync(
      localConfig,
      `BOT_TOKEN=${token}\nBOT_USERNAME=${me.username}\n`,
      { mode: 0o600 },
    );
  console.log(`Бот проверен: @${me.username}. Собираю отдельную демоверсию…`);
  const env = previewEnvironment(process.env, port);
  let server: ChildProcess | undefined,
    tunnel: ChildProcess | undefined,
    build: ChildProcess | undefined,
    bot: Bot | undefined,
    originalMenu: MenuButton | undefined,
    url: string | undefined;
  let closing = false,
    cleanupPromise: Promise<void> | undefined;
  const cleanup = () =>
    (cleanupPromise ??= (async () => {
      closing = true;
      if (originalMenu && url) {
        try {
          const current = await setup.api.getChatMenuButton(
            {},
            telegramTimeout(5000),
          );
          if (menuBelongsToPreview(current, url))
            await setup.api.setChatMenuButton(
              { menu_button: originalMenu },
              telegramTimeout(5000),
            );
        } catch {
          console.error(
            "Не удалось вернуть прежнее меню. При необходимости сбросьте кнопку меню через BotFather.",
          );
        }
      }
      if (bot?.isRunning())
        try {
          await bot.stop();
        } catch {}
      for (const child of [build, tunnel, server])
        if (child && !child.killed && child.exitCode === null)
          child.kill("SIGTERM");
    })());
  const interrupt = () => {
    void cleanup().finally(() => process.exit(0));
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  const childFailed = (message: string) => {
    if (!closing) {
      console.error(message);
      void cleanup().finally(() => process.exit(1));
    }
  };
  try {
    await new Promise<void>((resolve, reject) => {
      build = spawn(
        process.platform === "win32" ? "npm.cmd" : "npm",
        ["run", "build"],
        {
          cwd: root,
          env,
          stdio: "inherit",
          shell: process.platform === "win32",
          windowsHide: true,
        },
      );
      build.once("error", () =>
        reject(
          new PreviewError(
            "Не удалось запустить npm run build. Проверьте установку Node.js.",
          ),
        ),
      );
      build.once("exit", (code) =>
        code === 0
          ? resolve()
          : reject(
              new PreviewError(
                "Сборка не прошла. Исправьте показанную ошибку и повторите запуск.",
              ),
            ),
      );
    });
    server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
      cwd: root,
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    server.once("error", () =>
      childFailed("Не удалось запустить сервер демонстрации."),
    );
    server.once("exit", () => childFailed("Сервер демонстрации остановился."));
    await ready(`http://127.0.0.1:${port}`);
    console.log("Демоверсия запущена. Получаю временный HTTPS-адрес…");
    const processTunnel = spawn(
      "cloudflared",
      [
        "tunnel",
        "--no-autoupdate",
        "--protocol",
        "http2",
        "--url",
        `http://127.0.0.1:${port}`,
      ],
      { cwd: root, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );
    tunnel = processTunnel;
    url = await new Promise<string>((resolve, reject) => {
      let buffer = "",
        settled = false;
      const timer = setTimeout(() => {
        settled = true;
        reject(
          new PreviewError(
            "cloudflared не выдал адрес за 60 секунд. Проверьте доступ к Cloudflare в вашей сети.",
          ),
        );
      }, 60000);
      const read = (chunk: Buffer) => {
        buffer = (buffer + chunk.toString()).slice(-12000);
        const found = tunnelUrl(buffer);
        if (found && !settled) {
          settled = true;
          clearTimeout(timer);
          resolve(found);
        }
      };
      processTunnel.stdout?.on("data", read);
      processTunnel.stderr?.on("data", read);
      processTunnel.once("error", () => {
        clearTimeout(timer);
        reject(
          new PreviewError(
            "Не удалось запустить cloudflared. Откройте новое окно PowerShell после установки.",
          ),
        );
      });
      processTunnel.once("exit", () => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(
            new PreviewError(
              "Туннель Cloudflare не запустился. Проверьте доступ в интернет.",
            ),
          );
        } else childFailed("Временный HTTPS-туннель остановился.");
      });
    });
    await ready(url, 40000);
    // Verify that opening the real UI and creating a demo session works through HTTPS.
    const config = (await fetch(url + "/api/config", {
      signal: AbortSignal.timeout(10000),
    }).then((r) => r.json())) as { demo?: boolean };
    if (config.demo !== true)
      throw new PreviewError(
        "Публичный адрес не подтвердил демонстрационный режим. Меню бота не изменено.",
      );
    const auth = await fetch(url + "/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(10000),
    });
    if (!auth.ok)
      throw new PreviewError(
        "Проверка входа в демоверсию не прошла. Меню бота не изменено.",
      );
    originalMenu = await setup.api.getChatMenuButton(
      {},
      telegramTimeout(10000),
    );
    await setup.api.setChatMenuButton(
      {
        menu_button: {
          type: "web_app",
          text: "IdeaLab · демо",
          web_app: { url },
        },
      },
      telegramTimeout(10000),
    );
    const current = await setup.api.getChatMenuButton(
      {},
      telegramTimeout(10000),
    );
    if (!menuBelongsToPreview(current, url))
      throw new PreviewError("Telegram не подтвердил кнопку открытия.");
    bot = previewBot(token, url, me);
    await bot.start({
      allowed_updates: ["message", "pre_checkout_query"],
      drop_pending_updates: false,
      onStart: () => {
        console.log(
          `\nГОТОВО: откройте https://t.me/${me.username} и отправьте /start.\nНажмите «Открыть IdeaLab · демо».\nВременный адрес: ${url}\nStars не списываются. Тест работает, пока компьютер и это окно включены.\nCtrl+C остановит тест и вернёт прежнюю кнопку меню.\n`,
        );
      },
    });
  } finally {
    await cleanup();
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runPreview().catch((error) => {
    console.error(
      error instanceof PreviewError
        ? error.message
        : "Не удалось завершить подключение. Проверьте интернет и повторите запуск; токен не выводится.",
    );
    process.exitCode = 1;
  });
}
