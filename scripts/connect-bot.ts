import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { telegramAPI } from "../server/payments";
import { GameError, need } from "../server/game";

async function connect() {
  const path = process.env.IDEALAB_ENV_FILE || ".data/telegram.env";
  if (existsSync(path)) process.loadEnvFile(path);
  need(process.env.BOT_TOKEN, "Добавьте токен в защищённый локальный конфиг.");
  const me = await telegramAPI("getMe", {});
  const expected = process.env.BOT_USERNAME?.replace(/^@/, "").toLowerCase();
  need(
    !expected || me.username?.toLowerCase() === expected,
    "Токен принадлежит другому боту. Настройки не изменены.",
  );
  const status = await telegramAPI("getWebhookInfo", {});
  const metadataOnly = process.argv.includes("--metadata-only");
  if (!metadataOnly) {
    const url = process.env.PUBLIC_URL;
    need(
      url && url.startsWith("https://"),
      "Нужен публичный HTTPS-адрес игры. Для настройки только описания используйте --metadata-only.",
    );
    need(
      (process.env.WEBHOOK_SECRET || "").length >= 32,
      "Настройте постоянный WEBHOOK_SECRET длиной не меньше 32 символов.",
    );
    const health = await fetch(new URL("/health", url), {
      signal: AbortSignal.timeout(10000),
    });
    need(health.ok, "Публичный сервер пока не отвечает. Webhook не изменён.");
    const data = (await health.json()) as { ok?: boolean; mode?: string };
    need(
      data.ok && data.mode === "telegram",
      "По этому адресу не запущен сервер с Telegram-авторизацией. Webhook не изменён.",
    );
    need(
      !status.url ||
        status.url === url.replace(/\/$/, "") + "/telegram/webhook",
      "У бота уже установлен другой webhook. Он сохранён; сначала уточните действующий адрес.",
    );
  }
  await telegramAPI("setMyName", {
    name: "IdeaLab — кофейня с историей",
    language_code: "ru",
  });
  await telegramAPI("setMyShortDescription", {
    short_description:
      "Твоя идея. Твой бизнес. Твоя история. Уютная игра про свою кофейню.",
    language_code: "ru",
  });
  await telegramAPI("setMyDescription", {
    description:
      "Открой маленькую кофейню, познакомься с соседями и создай любимое место района. Развивай команду, украшай пространство и проживай свою историю. Игровые монеты не выводятся. Для игры не нужны покупки.",
    language_code: "ru",
  });
  await telegramAPI("setMyCommands", {
    commands: [
      { command: "start", description: "Открыть кофейню" },
      { command: "help", description: "Как играть" },
      { command: "support", description: "Помощь" },
      { command: "paysupport", description: "Помощь с платежами" },
      { command: "terms", description: "Условия игры" },
    ],
    language_code: "ru",
  });
  if (!metadataOnly) {
    const url = process.env.PUBLIC_URL!.replace(/\/$/, "");
    await telegramAPI("setChatMenuButton", {
      menu_button: {
        type: "web_app",
        text: "Открыть IdeaLab",
        web_app: { url },
      },
    });
    await telegramAPI("setWebhook", {
      url: url + "/telegram/webhook",
      secret_token: process.env.WEBHOOK_SECRET,
      allowed_updates: ["message", "pre_checkout_query"],
      drop_pending_updates: false,
    });
    const verified = await telegramAPI("getWebhookInfo", {});
    need(
      verified.url === url + "/telegram/webhook",
      "Telegram не подтвердил адрес webhook.",
    );
  }
  mkdirSync(".data", { recursive: true });
  writeFileSync(
    ".data/telegram-connection.json",
    JSON.stringify(
      {
        username: me.username,
        botId: me.id,
        checkedAt: new Date().toISOString(),
        metadataConfigured: true,
        webhookConfigured: !metadataOnly,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    metadataOnly
      ? `Настроены профиль и команды @${me.username}. Mini App ещё не опубликована.`
      : `@${me.username}: профиль, меню и webhook подключены. Проверка полного игрового цикла в Telegram ещё необходима.`,
  );
}
try {
  await connect();
} catch (e) {
  console.error(
    e instanceof GameError
      ? e.message
      : "Соединение с Telegram или публичным сервером недоступно. Проверьте сетевую политику и адрес; секреты в журнал не выведены.",
  );
  process.exitCode = 1;
}
