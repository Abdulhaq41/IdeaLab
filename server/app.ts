import express from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Store } from "./store";
import { actionSchema } from "../shared/schemas";
import {
  EVENTS,
  UPGRADES,
  EMPLOYEES,
  PRODUCTS,
  MENU,
  STRATEGIES,
  ACHIEVEMENTS,
  CHARACTERS,
} from "../shared/content";
import {
  finalize,
  GameError,
  need,
  publicGame,
  runOperation,
  moneyChange,
  activeShift,
} from "./game";
import {
  validateInitData,
  readSession,
  signSession,
  demoId,
  equal,
} from "./auth";
import {
  createOrder,
  invoiceFor,
  grantPayment,
  refundOrder,
  telegramAPI,
} from "./payments";
import { makeBot } from "./bot";
export interface AppConfig {
  demo: boolean;
  production: boolean;
  sessionSecret: string;
  adminIds: string[];
  webhookSecret: string;
  publicUrl: string;
  supportUrl: string;
}
export function createApp(store: Store, c: AppConfig) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "24kb" }));
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("Cache-Control", "no-store");
    if (c.production)
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
    next();
  });
  const limits = new Map<string, { start: number; count: number }>();
  app.use("/api", (req, res, next) => {
    const key = req.ip || "unknown",
      now = Date.now();
    let item = limits.get(key);
    if (!item || now - item.start > 60000) {
      item = { start: now, count: 0 };
      limits.set(key, item);
    }
    if (++item.count > 180)
      return res
        .status(429)
        .json({ error: "Слишком много запросов. Подожди минуту." });
    if (limits.size > 10000)
      for (const [k, v] of limits) if (now - v.start > 60000) limits.delete(k);
    if (
      c.production &&
      req.method !== "GET" &&
      req.headers.origin !== new URL(c.publicUrl).origin
    )
      return res
        .status(403)
        .json({ error: "Открой игру с её официального адреса." });
    next();
  });
  const session = (req: express.Request) => {
    const cookies = Object.fromEntries(
      (req.headers.cookie || "").split(";").map((s) => s.trim().split("=")),
    );
    return readSession(cookies.idealab, c.sessionSecret);
  };
  const login = (res: express.Response, id: string) => {
    res.cookie("idealab", signSession(id, c.sessionSecret), {
      httpOnly: true,
      secure: c.production,
      sameSite: "strict",
      maxAge: 12 * 3600000,
      path: "/",
    });
  };
  app.get("/api/config", (_req, res) =>
    res.json({
      demo: c.demo,
      test: process.env.TELEGRAM_TEST === "true",
      supportUrl: c.supportUrl,
      catalog: {
        events: EVENTS,
        upgrades: UPGRADES,
        employees: EMPLOYEES,
        products: PRODUCTS,
        menu: MENU,
        strategies: STRATEGIES,
        achievements: ACHIEVEMENTS,
        characters: CHARACTERS,
      },
    }),
  );
  app.get("/health", (_req, res) =>
    res.json({ ok: true, mode: c.demo ? "demo" : "telegram" }),
  );
  app.post("/api/auth", async (req, res) => {
    let id: string;
    if (c.demo) {
      id = session(req) || demoId();
    } else {
      need(process.env.BOT_TOKEN, "Telegram не настроен.", 503);
      id = validateInitData(
        z.string().max(16000).parse(req.body.initData),
        process.env.BOT_TOKEN,
      );
    }
    login(res, id);
    const state = await store.run(id, (g) => {
      finalize(g, Date.now());
      g.lastSeen = Date.now();
      return publicGame(g);
    });
    res.json({ state, admin: c.adminIds.includes(id) });
  });
  app.use("/api", (req, res, next) => {
    const id = session(req);
    if (!id)
      return res
        .status(401)
        .json({ error: "Сеанс закончился. Открой игру заново." });
    res.locals.userId = id;
    next();
  });
  app.get("/api/state", async (_req, res) => {
    res.json(
      await store.run(res.locals.userId, (g) => {
        finalize(g, Date.now());
        return publicGame(g);
      }),
    );
  });
  app.get("/api/operation/:key", async (req, res) =>
    res.json(
      await store.run(res.locals.userId, (g) => ({
        completed: !!g.operations[req.params.key],
      })),
    ),
  );
  app.post("/api/action", async (req, res) => {
    const a = actionSchema.parse(req.body.action),
      key = z.string().parse(req.body.operationId);
    res.json(
      await store.run(res.locals.userId, (g) => {
        const result = runOperation(g, key, a);
        return { result, state: publicGame(g) };
      }),
    );
  });
  app.post("/api/order", async (req, res) => {
    const { productId, operationId } = z
      .object({
        productId: z.string().max(40),
        operationId: z.string().max(100),
      })
      .parse(req.body);
    let order = await store.run(res.locals.userId, (g) =>
      structuredClone(
        createOrder(g, productId, operationId, c.sessionSecret, c.demo),
      ),
    );
    if (!c.demo && order.status === "pending" && !order.invoice) {
      const link = await invoiceFor(order);
      order = await store.run(res.locals.userId, (g) => {
        const o = g.orders.find((o) => o.id === order.id)!;
        o.invoice = link;
        return structuredClone(o);
      });
    }
    res.json(order);
  });
  app.post("/api/demo-pay", async (req, res) => {
    need(c.demo && !c.production, "Демо-платежи недоступны.", 404);
    const id = z.string().uuid().parse(req.body.orderId);
    res.json(
      await store.run(res.locals.userId, (g) => {
        const o = g.orders.find((o) => o.id === id);
        need(o, "Счёт не найден.");
        grantPayment(g, {
          owner: g.id,
          payload: o.payload,
          amount: o.price,
          currency: "XTR",
          chargeId: "demo:" + o.id,
          demo: true,
        });
        return publicGame(g);
      }),
    );
  });
  app.post("/api/support", async (req, res) => {
    const text = z.string().trim().min(10).max(2000).parse(req.body.text);
    const id = randomUUID();
    await store.run(res.locals.userId, (g) => {
      need(
        g.supportTickets.filter((t) => Date.now() - t.at < 3600000).length < 5,
        "Не больше пяти обращений в час.",
      );
      g.supportTickets.push({ id, at: Date.now(), text, kind: "app" });
    });
    res.json({ id });
  });
  app.post("/api/mentor", async (_req, res) => {
    const state = await store.run(res.locals.userId, (g) => {
      finalize(g, Date.now());
      return {
        report: g.shifts.filter((s) => s.finalized).at(-1)?.report,
        requests: g.analytics.filter(
          (x) => x.name === "mentor" && Date.now() - x.at < 86400000,
        ).length,
      };
    });
    need(state.report, "Совет появится после первой смены.");
    need(
      state.requests < 3,
      "На сегодня достаточно трёх советов. Следующий доступен завтра.",
    );
    await store.run(res.locals.userId, (g) => {
      need(
        g.analytics.filter(
          (x) => x.name === "mentor" && Date.now() - x.at < 86400000,
        ).length < 3,
        "На сегодня советы закончились.",
      );
      g.analytics.push({ name: "mentor", at: Date.now() });
    });
    // AI is an optional explanation adapter. Only metrics go out; no identity, token or seed.
    let text = state.report.conclusion,
      source = "template";
    if (process.env.AI_API_KEY && process.env.AI_ENDPOINT) {
      const budget = await store.reserveAi(
        res.locals.userId,
        Math.max(
          0,
          Math.min(
            1000,
            Math.floor(Number(process.env.AI_DAILY_REQUEST_CAP ?? 20)) || 0,
          ),
        ),
        Date.now(),
      );
      if (budget) {
        try {
          const r = await fetch(process.env.AI_ENDPOINT, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.AI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: process.env.AI_MODEL || "gpt-4.1-mini",
              max_tokens: 160,
              temperature: 0,
              messages: [
                {
                  role: "system",
                  content:
                    "Объясни итог кофейной игры на русском в 2 коротких предложениях, до 350 символов. Только факты из метрик. Не обещай заработка. Не давай решений о платежах. Не добавляй числа, которых нет в данных.",
                },
                { role: "user", content: JSON.stringify(state.report) },
              ],
            }),
            signal: AbortSignal.timeout(4000),
          });
          const data = (await r.json()) as any;
          const reply = data.choices?.[0]?.message?.content;
          const allowed = new Set(
            Object.values(state.report)
              .filter((n) => typeof n === "number")
              .map(String),
          );
          const validNumbers =
            typeof reply === "string" &&
            [...reply.matchAll(/\d+/g)].every((m) => allowed.has(m[0]));
          if (
            r.ok &&
            typeof reply === "string" &&
            reply.length <= 450 &&
            validNumbers &&
            !/реальн.{0,15}(доход|заработ)|гарантир/i.test(reply)
          ) {
            text = reply;
            source = "ai";
          }
        } catch {}
      }
    }
    res.json({ text, source });
  });
  app.use("/api/admin", (req, res, next) => {
    if (!c.adminIds.includes(res.locals.userId))
      return res
        .status(403)
        .json({ error: "Кабинет доступен только администраторам." });
    next();
  });
  app.get("/api/admin", async (_req, res) => {
    const games = await store.list();
    res.json({
      users: games.map((g) => ({
        id: g.id,
        name: g.name,
        balance: g.balance,
        xp: g.xp,
        ledger: g.ledger,
        orders: g.orders,
        entitlements: g.entitlements,
        supportTickets: g.supportTickets,
        shiftCount: g.shifts.length,
      })),
      audit: await store.audits(),
      catalog: PRODUCTS,
      analytics: Object.fromEntries(
        [
          "tutorial_complete",
          "shift_start",
          "shift_complete",
          "shop_open",
          "purchase_start",
          "purchase_complete",
        ].map((n) => [
          n,
          games.flatMap((g) => g.analytics).filter((e) => e.name === n).length,
        ]),
      ),
      returningPlayers: games.filter((g) => g.lastSeen - g.createdAt > 86400000)
        .length,
      lossShifts: games
        .flatMap((g) => g.shifts)
        .filter((s) => s.finalized && (s.report?.profit || 0) < 0).length,
    });
  });
  app.post("/api/admin/balance", async (req, res) => {
    const a = z
      .object({
        userId: z.string().max(100),
        amount: z.number().int().min(-100000).max(100000),
        reason: z.string().trim().min(5).max(200),
        operationId: z.string().uuid(),
      })
      .parse(req.body);
    const admin = res.locals.userId;
    await store.run(
      a.userId,
      (g) => {
        const op = `admin:${a.operationId}`,
          hash = JSON.stringify({ amount: a.amount, reason: a.reason });
        if (g.operations[op])
          need(
            g.operations[op].hash === hash,
            "Этот идентификатор уже использован.",
            409,
          );
        else {
          const running = activeShift(g);
          if (running)
            need(
              g.balance + a.amount >= running.wages + running.rent,
              "Нельзя потратить резерв зарплаты и аренды текущей смены.",
            );

          moneyChange(
            g,
            a.amount,
            `Корректировка: ${a.reason}`,
            op,
            Date.now(),
          );
          g.operations[op] = { hash, result: true };
        }
        if (
          !g.journal.some(
            (j) => j.text === `Корректировка ${a.amount}: ${a.reason}.`,
          )
        )
          g.journal.push({
            at: Date.now(),
            text: `Корректировка ${a.amount}: ${a.reason}.`,
          });
      },
      {
        id: `balance:${a.operationId}`,
        at: Date.now(),
        adminId: admin,
        targetId: a.userId,
        action: "balance",
        reason: a.reason,
        payload: { amount: a.amount },
      },
    );
    res.json({ ok: true });
  });
  app.post("/api/admin/refund", async (req, res) => {
    const a = z
      .object({
        userId: z.string(),
        orderId: z.string().uuid(),
        reason: z.string().trim().min(5).max(200),
      })
      .parse(req.body);
    await refundOrder(store, a.userId, a.orderId, res.locals.userId, a.reason);
    res.json({ ok: true });
  });
  app.post("/api/admin/reply", async (req, res) => {
    const a = z
      .object({
        userId: z.string(),
        ticketId: z.string().uuid(),
        text: z.string().trim().min(5).max(1500),
      })
      .parse(req.body);
    await store.run(a.userId, (g) => {
      need(
        g.supportTickets.some((t) => t.id === a.ticketId),
        "Обращение не найдено.",
      );
    });
    if (a.userId.startsWith("tg:"))
      await telegramAPI("sendMessage", {
        chat_id: Number(a.userId.slice(3)),
        text: "IdeaLab · ответ поддержки\n" + a.text,
      });
    else
      await store.run(a.userId, (g) => {
        g.journal.push({ at: Date.now(), text: "Поддержка: " + a.text });
      });
    await store.audit({
      id: randomUUID(),
      at: Date.now(),
      adminId: res.locals.userId,
      targetId: a.userId,
      action: "support_reply",
      reason: a.text,
      payload: { ticketId: a.ticketId },
    });
    res.json({ ok: true });
  });
  const bot = makeBot(store);
  app.post("/telegram/webhook", async (req, res) => {
    need(bot, "Бот не настроен.", 503);
    need(
      equal(
        (req.headers["x-telegram-bot-api-secret-token"] as string) || "",
        c.webhookSecret,
      ),
      "Webhook отклонён.",
      403,
    );
    need(
      req.body && Number.isSafeInteger(req.body.update_id),
      "Неверное обновление.",
    );
    await bot.handleUpdate(req.body);
    res.json({ ok: true });
  });
  app.get("/terms", (_req, res) =>
    res
      .type("html")
      .send(
        '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Условия IdeaLab</title><body style="font:18px/1.7 system-ui;max-width:650px;margin:40px auto;padding:24px"><h1>IdeaLab · условия</h1><p>Это игра. Монеты не являются деньгами, их нельзя вывести. Для игры не нужны платные покупки.</p><p>Stars оплачивают цифровые товары с точным содержимым из магазина. Plus — доступ на 30 дней без автоматического списания. Схемы после окончания сохраняются, дополнительные слоты нельзя изменять. Постоянные покупки и игровой прогресс сохраняются.</p><p>Возврат: /paysupport в боте или раздел помощи в профиле. Возврат отзывает только права данного заказа. Источник каждого права сохраняется.</p><h2>Данные</h2><p>Храним Telegram ID, игровой прогресс, решения и историю покупок для работы игры. Не читаем ваши чаты. Для удаления данных обратитесь в поддержку через профиль. Тексты обращений видит администратор. Не присылайте секреты.</p><p>Демонстрация не списывает Stars и не переносит покупки в production. Правила и цены могут меняться для будущих заказов; созданный счёт имеет фиксированную цену.</p></body></html>',
      ),
  );
  app.use(
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const status =
        err instanceof GameError
          ? err.status
          : err instanceof z.ZodError
            ? 400
            : 500;
      if (status === 500)
        console.error("Request failed:", err.code || err.name || "unknown");
      res.status(status).json({
        error:
          status === 500
            ? "Не удалось сохранить действие. Обнови состояние перед повтором."
            : err instanceof z.ZodError
              ? "Проверь введённые данные."
              : err.message,
      });
    },
  );
  return app;
}
