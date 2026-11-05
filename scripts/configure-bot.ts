import { existsSync } from "node:fs";
import { telegramAPI } from "../server/payments";
if (existsSync(".env")) process.loadEnvFile(".env");
if (
  !process.env.PUBLIC_URL?.startsWith("https://") ||
  !process.env.WEBHOOK_SECRET ||
  process.env.WEBHOOK_SECRET.length < 32
)
  throw new Error(
    "Set PUBLIC_URL (HTTPS) and WEBHOOK_SECRET (32+ chars) securely",
  );
await telegramAPI("setMyCommands", {
  commands: [
    { command: "start", description: "Открыть кофейню" },
    { command: "help", description: "Как играть" },
    { command: "support", description: "Помощь" },
    { command: "paysupport", description: "Помощь с платежами" },
    { command: "terms", description: "Условия игры" },
  ],
});
await telegramAPI("setChatMenuButton", {
  menu_button: {
    type: "web_app",
    text: "Открыть IdeaLab",
    web_app: { url: process.env.PUBLIC_URL },
  },
});
await telegramAPI("setWebhook", {
  url: process.env.PUBLIC_URL + "/telegram/webhook",
  secret_token: process.env.WEBHOOK_SECRET,
  allowed_updates: ["message", "pre_checkout_query"],
  drop_pending_updates: false,
});
console.log(
  "Bot menu, commands and protected webhook configured. No token printed.",
);
