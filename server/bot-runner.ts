import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
import { PostgresStore } from "./store";
import { makeBot } from "./bot";
const store = new PostgresStore();
const bot = makeBot(store);
if (!bot) throw new Error("BOT_TOKEN не задан");
await bot.api.deleteWebhook();
await bot.start();
