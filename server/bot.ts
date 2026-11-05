import { Bot, InlineKeyboard } from "grammy";
import { randomUUID } from "node:crypto";
import type { Store } from "./store";
import { checkPayment, grantPayment } from "./payments";
import { createGame } from "./game";
export function makeBot(store: Store) {
  const token = process.env.BOT_TOKEN;
  if (!token) return null;
  const bot = new Bot(
    token,
    process.env.TELEGRAM_TEST === "true"
      ? { client: { environment: "test" } }
      : {},
  );
  const keyboard = () =>
    new InlineKeyboard().webApp("Открыть IdeaLab", process.env.PUBLIC_URL!);
  bot.command("start", (ctx) =>
    ctx.match === "support"
      ? ctx.reply(
          "Напишите следующим сообщением, что произошло. Обращение сохранится для команды поддержки. Не присылайте токены и платёжные реквизиты.",
        )
      : ctx.reply(
          "IdeaLab\nТвоя идея. Твой бизнес. Твоя история.\nОткрой небольшую кофейню и стань частью района. Игровые монеты нельзя вывести.",
          { reply_markup: keyboard() },
        ),
  );
  bot.command("help", (ctx) =>
    ctx.reply(
      "Каждая смена длится 5 минут и завершится, даже если закрыть игру. Новую начинаешь только ты. /support — помощь, /paysupport — платежи, /terms — условия.",
      { reply_markup: keyboard() },
    ),
  );
  const support = async (ctx: any, payment = false) => {
    const url = process.env.SUPPORT_URL;
    await ctx.reply(
      `${payment ? "Помощь с платежом" : "Поддержка IdeaLab"}: ${url || "напишите сюда следующим сообщением; обращение попадёт в кабинет команды"}. Не отправляйте токены и платёжные реквизиты. Для заказа достаточно его номера из профиля.`,
    );
  };
  bot.command("support", (ctx) => support(ctx));
  bot.command("paysupport", (ctx) => support(ctx, true));
  bot.command("terms", (ctx) =>
    ctx.reply(
      "IdeaLab — развлекательная игра. Монеты не имеют денежной стоимости и не выводятся. Stars покупают только перечисленные цифровые товары. Plus действует 30 дней без автопродления. Покупки и помощь: " +
        (process.env.SUPPORT_URL || "напишите /paysupport") +
        "\nУсловия и политика: " +
        process.env.PUBLIC_URL +
        "/terms",
    ),
  );
  bot.on("pre_checkout_query", async (ctx) => {
    const q = ctx.preCheckoutQuery;
    try {
      await store.run(`tg:${q.from.id}`, (g) => {
        const o = checkPayment(g, {
          owner: g.id,
          payload: q.invoice_payload,
          amount: q.total_amount,
          currency: q.currency,
          demo: false,
        });
        if (o.status !== "pending") throw new Error("Счёт уже оплачен");
      });
      await ctx.answerPreCheckoutQuery(true);
    } catch {
      await ctx.answerPreCheckoutQuery(false, {
        error_message:
          "Не удалось подтвердить счёт. Вернитесь в магазин и обновите состояние.",
      });
    }
  });
  bot.on("message:successful_payment", async (ctx) => {
    const p = ctx.message.successful_payment;
    const fresh = await store.run(`tg:${ctx.from.id}`, (g) => {
      const prior = g.orders.some(
        (o) => o.chargeId === p.telegram_payment_charge_id,
      );
      grantPayment(g, {
        owner: g.id,
        payload: p.invoice_payload,
        amount: p.total_amount,
        currency: p.currency,
        chargeId: p.telegram_payment_charge_id,
        demo: false,
      });
      return !prior;
    });
    if (fresh)
      await ctx.reply("Покупка сохранена. Товар уже в кофейне.", {
        reply_markup: keyboard(),
      });
  });
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text.slice(0, 2000);
    if (text.startsWith("/")) return;
    const id = randomUUID();
    await store.run(`tg:${ctx.from.id}`, (g) => {
      g.supportTickets.push({ id, at: Date.now(), text, kind: "bot" });
    });
    await ctx.reply(
      "Обращение сохранено: " +
        id.slice(0, 8) +
        ". Команда увидит его в кабинете поддержки.",
    );
  });
  bot.catch((err) => {
    throw err.error;
  });
  return bot;
}
