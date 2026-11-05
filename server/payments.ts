import { randomUUID, createHmac } from "node:crypto";
import { PRODUCTS } from "../shared/content";
import type { Game, Order } from "../shared/types";
import { GameError, need, owns } from "./game";
import { furniture } from "../shared/layout";
import type { Store } from "./store";
export function orderPayload(userId: string, orderId: string, secret: string) {
  const s = `${userId}~${orderId}`;
  return (
    s +
    "~" +
    createHmac("sha256", secret).update(s).digest("base64url").slice(0, 22)
  );
}
export function createOrder(
  g: Game,
  productId: string,
  key: string,
  secret: string,
  demo: boolean,
  now = Date.now(),
) {
  need(g.tutorial >= 6, "Магазин доступен после знакомства с кофейней.");
  need(/^[\w-]{12,100}$/.test(key), "Нужен идентификатор покупки.");
  const operation = `purchase_${key}`;
  const old = g.operations[operation];
  if (old) {
    need(
      old.hash === productId,
      "Идентификатор принадлежит другой покупке.",
      409,
    );
    return g.orders.find((o) => o.id === old.result)!;
  }
  const p = PRODUCTS.find((p) => p.id === productId);
  need(p, "Товар не найден.");
  need(
    p.duration > 0 || p.id === "support" || !owns(g, p.id),
    "Этот набор уже твой.",
  );
  const pending = g.orders.find(
    (o) => o.productId === productId && o.status === "pending",
  );
  if (pending) {
    g.operations[operation] = { hash: productId, result: pending.id };
    return pending;
  }
  const id = randomUUID();
  const o: Order = {
    id,
    productId,
    price: p.price,
    currency: "XTR",
    payload: orderPayload(g.id, id, secret),
    status: "pending",
    createdAt: now,
    demo,
    title: p.name,
  };
  g.orders.push(o);
  g.operations[operation] = { hash: productId, result: id };
  g.analytics.push({ name: "purchase_start", at: now, meta: id });
  return o;
}
export interface PaymentInput {
  owner: string;
  payload: string;
  amount: number;
  currency: string;
  chargeId?: string;
  demo: boolean;
}
export function checkPayment(g: Game, input: PaymentInput) {
  need(g.id === input.owner, "Владелец счёта не совпадает.", 403);
  const o = g.orders.find((o) => o.payload === input.payload);
  need(o, "Счёт не найден.");
  need(
    o.price === input.amount && o.currency === input.currency,
    "Сумма или валюта не совпадает.",
  );
  need(o.demo === input.demo, "Тестовая и настоящая оплаты разделены.");
  need(["pending", "paid"].includes(o.status), "Счёт уже закрыт.");
  need(
    o.productId === "plus" ||
      o.productId === "support" ||
      !owns(g, o.productId) ||
      o.status === "paid",
    "Набор уже получен по другому счёту.",
  );
  return o;
}
export function grantPayment(g: Game, input: PaymentInput, now = Date.now()) {
  const o = checkPayment(g, input);
  need(
    input.chargeId && input.chargeId.length < 256,
    "Нет идентификатора платежа.",
  );
  if (o.status === "paid") {
    need(
      o.chargeId === input.chargeId,
      "Счёт уже оплачен другим платежом.",
      409,
    );
    return o;
  }
  need(
    !g.orders.some((x) => x.chargeId === input.chargeId && x.id !== o.id),
    "Этот платёж уже обработан.",
    409,
  );
  o.status = "paid";
  o.chargeId = input.chargeId;
  g.entitlements.push({
    id: randomUUID(),
    source: o.id,
    productId: o.productId,
    at: now,
    revoked: false,
  });
  const type = { neon: "moon", loft: "vase", founder: "statue" }[o.productId];
  if (type) g.stored.push(furniture(`purchase-${o.id}`, type, 0, 0));
  g.journal.push({
    at: now,
    text: `${o.demo ? "Демо: " : ""}получен ${o.title}.`,
  });
  g.analytics.push({ name: "purchase_complete", at: now, meta: o.id });
  g.version++;
  return o;
}
export function revokeOrder(g: Game, orderId: string) {
  const o = g.orders.find((o) => o.id === orderId);
  need(o, "Заказ не найден.");
  if (o.status === "refunded") return;
  need(
    o.status === "paid" || o.status === "refund_pending",
    "Заказ не оплачен.",
  );
  o.status = "refunded";
  for (const e of g.entitlements.filter((e) => e.source === o.id))
    e.revoked = true;
  const furnitureId = `purchase-${o.id}`;
  g.layout = g.layout.filter((x) => x.id !== furnitureId);
  g.stored = g.stored.filter((x) => x.id !== furnitureId);
  if (g.skin === o.productId && !owns(g, o.productId)) g.skin = "original";
  g.version++;
}
export async function paymentWebhook(store: Store, body: any, demo = false) {
  const p = body.message?.successful_payment;
  need(p, "Нет успешной оплаты.");
  const owner = `tg:${body.message.from?.id}`;
  return store.run(owner, (g) =>
    grantPayment(g, {
      owner,
      payload: p.invoice_payload,
      amount: p.total_amount,
      currency: p.currency,
      chargeId: p.telegram_payment_charge_id,
      demo,
    }),
  );
}
export async function telegramAPI(
  method: string,
  body: Record<string, unknown>,
) {
  need(process.env.BOT_TOKEN, "Telegram ещё не настроен.", 503);
  const test = process.env.TELEGRAM_TEST === "true" ? "/test" : "";
  const response = await fetch(
    `https://api.telegram.org/bot${process.env.BOT_TOKEN}${test}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    },
  );
  const data = (await response.json()) as {
    ok: boolean;
    result: any;
    description?: string;
  };
  if (!data.ok)
    throw new GameError(
      `Telegram не подтвердил действие: ${(data.description || "недоступен").replace(/\d{6,}:[\w-]+/g, "[скрыто]")}`,
      502,
    );
  return data.result;
}
export async function invoiceFor(order: Order) {
  return telegramAPI("createInvoiceLink", {
    title: order.title,
    description: PRODUCTS.find((p) => p.id === order.productId)!.description,
    payload: order.payload,
    provider_token: "",
    currency: "XTR",
    prices: [{ label: order.title, amount: order.price }],
  });
}
export async function refundOrder(
  store: Store,
  owner: string,
  orderId: string,
  admin: string,
  reason: string,
) {
  need(reason.trim().length >= 5, "Укажи содержательную причину.");
  const o = await store.run(
    owner,
    (g) => {
      const order = g.orders.find((o) => o.id === orderId);
      need(
        order && ["paid", "refund_pending", "refunded"].includes(order.status),
        "Оплаченный заказ не найден.",
      );
      if (order.status !== "refunded") order.status = "refund_pending";
      return structuredClone(order);
    },
    {
      id: `refund-request:${orderId}`,
      at: Date.now(),
      adminId: admin,
      targetId: owner,
      action: "refund_requested",
      reason,
      payload: { orderId },
    },
  );
  if (o.status !== "refunded" && !o.demo) {
    try {
      await telegramAPI("refundStarPayment", {
        user_id: Number(owner.replace("tg:", "")),
        telegram_payment_charge_id: o.chargeId,
      });
    } catch (e) {
      if (
        !(e instanceof Error) ||
        !e.message.includes("CHARGE_ALREADY_REFUNDED")
      ) {
        await store.audit({
          id: randomUUID(),
          at: Date.now(),
          adminId: admin,
          targetId: owner,
          action: "refund_pending",
          reason,
          payload: { orderId },
        });
        throw e;
      }
    }
  }
  await store.run(owner, (g) => revokeOrder(g, orderId), {
    id: `refund:${orderId}`,
    at: Date.now(),
    adminId: admin,
    targetId: owner,
    action: "refund",
    reason,
    payload: { orderId },
  });
}
