import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createGame,
  applyAction,
  runOperation,
  finalize,
  makeShift,
  calculateReport,
  plusUntil,
  publicGame,
} from "../server/game";
import { SQLiteStore, PostgresStore, type Store } from "../server/store";
import {
  createOrder,
  grantPayment,
  revokeOrder,
  checkPayment,
  refundOrder,
} from "../server/payments";
import {
  validateInitData,
  validateEnvironment,
  readSession,
  signSession,
} from "../server/auth";
import {
  furniture,
  initialLayout,
  validateLayout,
  pathfind,
  ROOM,
} from "../shared/layout";
import { EVENTS, UPGRADES, STRATEGIES } from "../shared/content";
import { createApp, type AppConfig } from "../server/app";
const ready = () => {
  const g = createGame("test:" + randomUUID(), 1000000);
  applyAction(g, { type: "skipTutorial" }, 1000000);
  return g;
};
const start = (g: ReturnType<typeof ready>, now = 1000000) =>
  applyAction(
    g,
    {
      type: "startShift",
      strategy: "balanced",
      menu: ["espresso", "cappuccino", "croissant"],
      prep: "welcome",
    },
    now,
  );
const key = () => randomUUID();
const input = (g: any, o: any, charge: string = key()) => ({
  owner: g.id,
  payload: o.payload,
  amount: o.price,
  currency: "XTR",
  chargeId: charge,
  demo: true,
});
test("Telegram initData: signed identity, tampering, age and duplicate fields", () => {
  const token = "test-only-token",
    now = Date.now();
  const p = new URLSearchParams({
    auth_date: String(Math.floor(now / 1000)),
    user: JSON.stringify({ id: 12345, first_name: "Игрок" }),
  });
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const check = [...p]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => k + "=" + v)
    .join("\n");
  p.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  assert.equal(validateInitData(p.toString(), token, now), "tg:12345");
  assert.throws(() =>
    validateInitData(p.toString().replace("12345", "98765"), token, now),
  );
  assert.throws(() => validateInitData(p.toString(), token, now + 3700000));
  assert.throws(() =>
    validateInitData(p.toString() + "&auth_date=0", token, now),
  );
});
test("production refuses demo auth and incomplete configuration", () => {
  assert.throws(() =>
    validateEnvironment({ NODE_ENV: "production", DEMO_MODE: "true" }),
  );
  assert.throws(() => validateEnvironment({ NODE_ENV: "production" }));
  const s = signSession("tg:1", "test");
  assert.equal(readSession(s, "test"), "tg:1");
  assert.equal(readSession(s + "x", "test"), null);
  assert.equal(readSession(s, "test", Date.now() + 13 * 3600000), null);
});
test("tutorial saves every step, cannot replay income, skip grants essentials", () => {
  const g = createGame("test");
  for (let step = 0; step < 6; step++) {
    runOperation(
      g,
      `tutorial-step-${step}`,
      { type: "tutorial", step, name: "После дождя" },
      1000 + step,
    );
    const balance = g.balance;
    runOperation(
      g,
      `tutorial-step-${step}`,
      { type: "tutorial", step, name: "После дождя" },
      1000 + step,
    );
    assert.equal(g.balance, balance);
    const restored = JSON.parse(JSON.stringify(g));
    assert.equal(restored.tutorial, Math.min(6, step + 1));
  }
  assert.equal(g.balance, 10150);
  assert.equal(g.layout.filter((i) => i.type === "machine").length, 1);
  assert.throws(() => applyAction(g, { type: "tutorial", step: 3 }));
  const a = createGame("skip");
  applyAction(a, { type: "skipTutorial" });
  applyAction(a, { type: "skipTutorial" });
  assert.equal(a.balance, 10000);
  assert.equal(a.layout.filter((i) => i.type === "machine").length, 1);
});
test("operation keys reject changed payload; upgrade is paid once", () => {
  const g = ready();
  runOperation(g, "purchase-upgrade-01", { type: "upgrade", id: "machine" });
  runOperation(g, "purchase-upgrade-01", { type: "upgrade", id: "machine" });
  assert.equal(g.balance, 8200);
  assert.equal(g.ledger.filter((l) => l.id === "upgrade:machine").length, 1);
  assert.throws(() =>
    runOperation(g, "purchase-upgrade-01", { type: "upgrade", id: "tables" }),
  );
  assert.throws(() =>
    runOperation(g, key(), { type: "upgrade", id: "machine" }),
  );
});
test("deterministic server seed, inventory and capacity limits", () => {
  const g = ready();
  const a = {
    type: "startShift" as const,
    menu: ["espresso" as const],
    strategy: "balanced" as const,
    prep: "welcome" as const,
  };
  const one = makeShift(g, a, 1000, "fixed-seed"),
    two = makeShift(g, a, 1000, "fixed-seed");
  assert.deepEqual(one.guests, two.guests);
  assert.deepEqual(calculateReport(one), calculateReport(two));
  g.inventory.beans = 2;
  const limited = makeShift(g, a, 1000, "fixed-seed");
  assert.equal(limited.guests.filter((a) => a.served).length, 2);
  assert.equal(
    calculateReport(limited).lostReasons["Закончились ингредиенты"],
    limited.guests.length - 2,
  );
  assert.ok(!JSON.stringify(publicGame(g)).includes("seed"));
});
test("finalization once, no rent between shifts, server restart recovery", async () => {
  const dir = mkdtempSync(join(tmpdir(), "idealab-"));
  let store = new SQLiteStore(join(dir, "state.db"));
  const id = "restart";
  await store.run(id, (g) => {
    applyAction(g, { type: "skipTutorial" }, 1000);
    start(g, 1000);
  });
  await store.close();
  store = new SQLiteStore(join(dir, "state.db"));
  await store.run(id, (g) => finalize(g, 301001));
  const first = await store.run(id, (g) => ({
    balance: g.balance,
    count: g.ledger.length,
    report: g.shifts[0].report,
  }));
  await store.run(id, (g) => finalize(g, 301001 + 86400000 * 90));
  const second = await store.run(id, (g) => ({
    balance: g.balance,
    count: g.ledger.length,
  }));
  assert.equal(second.balance, first.balance);
  assert.equal(second.count, first.count);
  assert.ok(first.report?.served);
  await store.close();
  rmSync(dir, { recursive: true });
});
test("choices apply only to future orders and cannot replay", () => {
  const g = ready();
  start(g);
  const s = g.shifts[0];
  applyAction(g, { type: "shiftDecision", choice: "care" }, s.start + 100000);
  const r = calculateReport(s);
  assert.equal(
    r.eventRevenue,
    s.guests.filter((a) => a.served && a.arrival > 100000).length * 10,
  );
  assert.throws(() =>
    applyAction(g, { type: "shiftDecision", choice: "care" }, s.start + 110000),
  );
  assert.ok(
    s.guests.filter((a) => a.arrival < 100000).every((a) => a.price > 0),
  );
});
test("placement validates collision, entrance, workstation, wall, rotation and owned items", () => {
  const g = ready();
  assert.equal(validateLayout(g.layout), null);
  assert.throws(() =>
    applyAction(g, { type: "move", id: "table-a", x: 4, y: 7, rotation: 0 }),
  );
  assert.throws(() =>
    applyAction(g, { type: "move", id: "table-a", x: 2, y: 2, rotation: 0 }),
  );
  assert.throws(() =>
    applyAction(g, { type: "move", id: "table-a", x: 6, y: 5, rotation: 0 }),
  );
  assert.throws(() =>
    applyAction(g, { type: "move", id: "not-mine", x: 3, y: 3, rotation: 0 }),
  );
  assert.throws(() =>
    applyAction(g, {
      type: "move",
      id: "first-machine",
      x: 8,
      y: 2,
      rotation: 0,
    }),
  );
  assert.ok(pathfind(ROOM.door, ROOM.work, g.layout).length);
  const blocked = [
    ...g.layout,
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((x) =>
      furniture("block" + x, "plant", x, 6),
    ),
  ];
  assert.equal(pathfind(ROOM.door, ROOM.work, blocked).length, 0);
  assert.notEqual(validateLayout(blocked), null);
});
test("furniture survives storing and saved layout load, plus expiry locks editing", () => {
  const g = ready();
  applyAction(g, { type: "saveLayout", slot: 0, name: "Мой зал" });
  applyAction(g, { type: "storeFurniture", id: "plant-a" });
  assert.ok(g.stored.some((i) => i.id === "plant-a"));
  applyAction(g, { type: "loadLayout", slot: 0 });
  assert.ok(g.layout.some((i) => i.id === "plant-a"));
  assert.throws(() =>
    applyAction(g, { type: "saveLayout", slot: 1, name: "Второй" }),
  );
});
test("free recovery cannot run at healthy balance or duplicate stock/income", () => {
  const g = ready();
  assert.throws(() =>
    applyAction(g, {
      type: "startShift",
      menu: ["espresso"],
      strategy: "balanced",
      prep: "welcome",
      recovery: true,
    }),
  );
  g.balance = 0;
  const k = key();
  runOperation(
    g,
    k,
    {
      type: "startShift",
      menu: ["espresso"],
      strategy: "balanced",
      prep: "welcome",
      recovery: true,
    },
    1000,
  );
  runOperation(
    g,
    k,
    {
      type: "startShift",
      menu: ["espresso"],
      strategy: "balanced",
      prep: "welcome",
      recovery: true,
    },
    1000,
  );
  assert.equal(g.shifts.length, 1);
  finalize(g, 301001);
  assert.equal(g.balance, 800);
  assert.throws(() =>
    applyAction(
      g,
      {
        type: "startShift",
        menu: ["espresso"],
        strategy: "balanced",
        prep: "welcome",
        recovery: true,
      },
      302000,
    ),
  );
});
test("30 unique events, valid chains and fixed effects; 12 meaningful upgrades", () => {
  assert.equal(EVENTS.length, 30);
  assert.equal(new Set(EVENTS.map((e) => e.id)).size, 30);
  for (const e of EVENTS) {
    assert.ok(e.choices.length >= 2);
    assert.equal(e.maxRepeats, 1);
    if (e.requires) assert.ok(EVENTS.some((p) => p.id === e.requires));
  }
  assert.equal(UPGRADES.length, 12);
  assert.ok(UPGRADES.every((u) => u.speed || u.quality || u.comfort || u.rep));
});
test("payment verifies owner, immutable amount/currency/payload; grants only once", () => {
  const g = ready();
  const o = createOrder(g, "loft", key(), "secret", true);
  for (const bad of [
    { amount: 1 },
    { currency: "USD" },
    { owner: "other" },
    { payload: "invalid" },
    { demo: false },
  ])
    assert.throws(() => checkPayment(g, { ...input(g, o), ...bad }));
  const p = input(g, o);
  grantPayment(g, p, 1000);
  grantPayment(g, p, 1001);
  assert.equal(g.entitlements.length, 1);
  assert.equal(g.stored.length, 1);
  assert.throws(() => grantPayment(g, { ...p, chargeId: "different" }));
  assert.throws(() => createOrder(g, "loft", key(), "secret", true));
});
test("parallel permanent checkout has one outstanding order", async () => {
  const s = new SQLiteStore(":memory:");
  await s.run("payments", (g) => applyAction(g, { type: "skipTutorial" }));
  const orders = await Promise.all(
    Array.from({ length: 10 }, () =>
      s.run("payments", (g) => createOrder(g, "neon", key(), "test", true)),
    ),
  );
  assert.equal(new Set(orders.map((o) => o.id)).size, 1);
  await Promise.all(
    orders.map((o) =>
      s.run("payments", (g) => grantPayment(g, input(g, o, "charge-one"))),
    ),
  );
  assert.equal(await s.run("payments", (g) => g.entitlements.length), 1);
  await s.close();
});
test("refund revokes only its source and preserves other paid duration", () => {
  const g = ready();
  const day = 86400000;
  const a = createOrder(g, "plus", key(), "secret", true, 1000);
  grantPayment(g, input(g, a), 1000);
  const b = createOrder(g, "plus", key(), "secret", true, 1000 + day);
  grantPayment(g, input(g, b), 1000 + day);
  assert.equal(plusUntil(g, 1000), 1000 + 60 * day);
  revokeOrder(g, a.id);
  assert.equal(plusUntil(g, 1000), 1000 + 31 * day);
  assert.equal(plusUntil(g, 1000 + 32 * day), 0);
  assert.equal(g.entitlements.filter((e) => !e.revoked).length, 1);
  revokeOrder(g, a.id);
  assert.equal(g.entitlements.filter((e) => !e.revoked).length, 1);
});
test("refunded cosmetics can be repurchased without losing the new entitlement", () => {
  const g = ready();
  const first = createOrder(g, "founder", key(), "s", true);
  grantPayment(g, input(g, first), 1000);
  revokeOrder(g, first.id);
  const second = createOrder(g, "founder", key(), "s", true);
  grantPayment(g, input(g, second), 2000);
  revokeOrder(g, first.id);
  assert.equal(g.entitlements.filter((e) => !e.revoked).length, 1);
  assert.ok(g.stored.some((i) => i.id === "purchase-" + second.id));
});
test("SQLite transactions: parallel upgrade charges once; failed mutations roll back", async () => {
  const s = new SQLiteStore(":memory:");
  await s.run("concurrent", (g) => applyAction(g, { type: "skipTutorial" }));
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, () =>
      s.run("concurrent", (g) =>
        runOperation(g, key(), { type: "upgrade", id: "machine" }),
      ),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await s.run("concurrent", (g) => g.balance), 8200);
  await assert.rejects(
    s.run("concurrent", (g) => {
      g.balance = 0;
      throw new Error("rollback");
    }),
  );
  assert.equal(await s.run("concurrent", (g) => g.balance), 8200);
  await s.close();
});
test("global Telegram charge ID cannot be claimed by a second user", async () => {
  const s = new SQLiteStore(":memory:");
  for (const id of ["a", "b"])
    await s.run(id, (g) => {
      applyAction(g, { type: "skipTutorial" });
      createOrder(g, "support", key(), "s", true);
    });
  await s.run("a", (g) =>
    grantPayment(g, input(g, g.orders[0], "same-telegram-charge")),
  );
  await assert.rejects(
    s.run("b", (g) =>
      grantPayment(g, input(g, g.orders[0], "same-telegram-charge")),
    ),
  );
  assert.equal(await s.run("b", (g) => g.entitlements.length), 0);
  await s.close();
});
test("HTTP isolated users, admin protection, forged payload, shop and support flow", async () => {
  const s = new SQLiteStore(":memory:");
  const config: AppConfig = {
    demo: true,
    production: false,
    sessionSecret: "test-only-secret",
    adminIds: [],
    webhookSecret: "webhook-test",
    publicUrl: "http://localhost",
    supportUrl: "",
  };
  const app = createApp(s, config);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.on("listening", resolve));
  const address = server.address() as any;
  const base = `http://127.0.0.1:${address.port}/api/`;
  const req = async (path: string, body?: unknown, cookie = "") => {
    const r = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", cookie },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      r,
      data: (await r.json()) as any,
      cookie: r.headers.get("set-cookie")?.split(";")[0] || "",
    };
  };
  try {
    const a = await req("auth", {}),
      b = await req("auth", {});
    assert.notEqual(a.data.state.id, b.data.state.id);
    assert.equal((await req("state")).r.status, 401);
    assert.equal((await req("admin", undefined, a.cookie)).r.status, 403);
    await req(
      "action",
      {
        operationId: key(),
        action: { type: "skipTutorial" },
        userId: b.data.state.id,
      },
      a.cookie,
    );
    assert.equal((await req("state", undefined, b.cookie)).data.tutorial, 0);
    assert.equal(
      (await req("demo-pay", { orderId: key() }, b.cookie)).r.status,
      400,
    );
    const o = await req(
      "order",
      { productId: "loft", price: 1, operationId: key() },
      a.cookie,
    );
    assert.equal(o.data.price, 150);
    assert.equal(
      (await req("demo-pay", { orderId: o.data.id }, b.cookie)).r.status,
      400,
    );
    await req("demo-pay", { orderId: o.data.id }, a.cookie);
    assert.equal(
      (await req("state", undefined, a.cookie)).data.entitlements.length,
      1,
    );
    const ticket = await req(
      "support",
      { text: "Нужна помощь с кофейней" },
      a.cookie,
    );
    assert.ok(ticket.data.id);
    config.adminIds.push(a.data.state.id);
    assert.equal((await req("admin", undefined, a.cookie)).r.status, 200);
    assert.equal((await req("admin", undefined, b.cookie)).r.status, 403);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await s.close();
  }
});
for (const factory of [
  {
    label: "PostgreSQL",
    make: () => new PostgresStore(),
    enabled: !!process.env.TEST_DATABASE_URL,
  },
])
  test(
    factory.label + " real transaction concurrency and payment uniqueness",
    { skip: !factory.enabled },
    async () => {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
      const s = factory.make();
      const id = "test-pg:" + key();
      await s.run(id, (g) => applyAction(g, { type: "skipTutorial" }));
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          s.run(id, (g) =>
            runOperation(g, key(), { type: "upgrade", id: "machine" }),
          ),
        ),
      );
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(await s.run(id, (g) => g.balance), 8200);
      const o = await s.run(id, (g) =>
        createOrder(g, "loft", key(), "test", true),
      );
      await Promise.all(
        Array.from({ length: 5 }, () =>
          s.run(id, (g) => grantPayment(g, input(g, o, "pg-charge-" + id))),
        ),
      );
      assert.equal(await s.run(id, (g) => g.entitlements.length), 1);
      await s.close();
    },
  );
test("first fifteen minutes: onboarding, three shifts, story, restock and improvement persist", async () => {
  const s = new SQLiteStore(":memory:");
  const id = "first-fifteen";
  let now = 1000000;
  for (let step = 0; step < 6; step++)
    await s.run(id, (g) =>
      runOperation(
        g,
        key(),
        { type: "tutorial", step, name: "Между строк" },
        now++,
      ),
    );
  for (let i = 0; i < 3; i++) {
    await s.run(id, (g) => {
      if (i === 1) applyAction(g, { type: "upgrade", id: "machine" }, now);
      if (i === 2) applyAction(g, { type: "restock" }, now);
      start(g, now);
    });
    await s.run(id, (g) =>
      applyAction(g, { type: "shiftDecision", choice: "neutral" }, now + 61000),
    );
    now += 300001;
    await s.run(id, (g) => finalize(g, now));
    await s.run(id, (g) =>
      applyAction(
        g,
        {
          type: "story",
          eventId: "regular" + (i + 1),
          choice: i === 0 ? "talk" : i === 1 ? "ask" : "share",
        },
        now,
      ),
    );
  }
  const g = await s.run(id, (g) => structuredClone(g));
  assert.equal(g.shifts.filter((s) => s.finalized).length, 3);
  assert.equal(g.tutorial, 6);
  assert.ok(g.achievements.includes("regular"));
  assert.ok(g.balance > 0);
  assert.ok(g.upgrades.includes("machine"));
  assert.equal(new Set(g.ledger.map((l) => l.id)).size, g.ledger.length);
  assert.equal(g.name, "Между строк");
  await s.close();
});
test("refund and balance correction are persisted with audit atomically", async () => {
  const s = new SQLiteStore(":memory:");
  const id = "audit";
  await s.run(id, (g) => applyAction(g, { type: "skipTutorial" }));
  const o = await s.run(id, (g) => createOrder(g, "loft", key(), "s", true));
  await s.run(id, (g) => grantPayment(g, input(g, o)));
  await refundOrder(s, id, o.id, "admin", "Проверка возврата");
  assert.equal(await s.run(id, (g) => g.orders[0].status), "refunded");
  assert.equal(
    (await s.audits()).filter((a) => a.action === "refund").length,
    1,
  );
  await refundOrder(s, id, o.id, "admin", "Повторная проверка");
  assert.equal(
    (await s.audits()).filter((a) => a.action === "refund").length,
    1,
  );
  const audit = {
    id: key(),
    adminId: "admin",
    action: "test",
    reason: "rollback test",
    targetId: id,
    at: Date.now(),
    payload: {},
  };
  await assert.rejects(
    s.run(
      id,
      (g) => {
        g.balance = 0;
        throw new Error("no commit");
      },
      audit,
    ),
  );
  assert.ok(!(await s.audits()).some((a) => a.id === audit.id));
  await s.close();
});
test("no soft lock with empty stocks and money below restock price; full categories do not block buying beans", () => {
  const g = ready();
  g.balance = 900;
  g.inventory = { beans: 0, milk: 300, flour: 0 };
  assert.equal(publicGame(g).canRecover, true);
  applyAction(
    g,
    {
      type: "startShift",
      menu: ["espresso"],
      strategy: "balanced",
      prep: "welcome",
      recovery: true,
    },
    1000,
  );
  finalize(g, 301001);
  assert.equal(publicGame(g).canRecover, false);
  g.inventory = { beans: 0, milk: 300, flour: 300 };
  const before = g.balance;
  applyAction(g, { type: "restock" }, 301002);
  assert.equal(before - g.balance, 480);
  assert.equal(g.inventory.beans, 60);
  assert.equal(g.inventory.milk, 300);
});
test("AI quota is atomic across parallel requests, bounded per user and globally", async () => {
  const s = new SQLiteStore(":memory:");
  const requests = await Promise.all(
    Array.from({ length: 10 }, () => s.reserveAi("same-player", 20, 1000000)),
  );
  assert.equal(requests.filter(Boolean).length, 3);
  const others = await Promise.all(
    Array.from({ length: 10 }, (_, i) => s.reserveAi("other-" + i, 5, 1000000)),
  );
  assert.equal(others.filter(Boolean).length, 2);
  assert.equal(await s.reserveAi("new", 0, 1000000), false);
  assert.equal(await s.reserveAi("same-player", 20, 1000000 + 86400001), true);
  await s.close();
});
test("Plus expiry preserves layouts but forbids new premium changes and evening light", () => {
  const g = ready(),
    day = 86400000;
  const o = createOrder(g, "plus", key(), "s", true, 1000);
  grantPayment(g, input(g, o), 1000);
  applyAction(g, { type: "saveLayout", slot: 2, name: "Любимый вечер" }, 2000);
  applyAction(g, { type: "settings", settings: { eveningLight: true } }, 2000);
  assert.throws(() =>
    applyAction(
      g,
      { type: "saveLayout", slot: 2, name: "Замена" },
      1001 + 30 * day,
    ),
  );
  assert.throws(() =>
    applyAction(
      g,
      { type: "settings", settings: { eveningLight: true } },
      1001 + 30 * day,
    ),
  );
  assert.equal(g.layouts[2].name, "Любимый вечер");
  assert.equal(g.balance, 10000);
});
test("new chapters unlock distinct later stories without changing or losing furniture", () => {
  const g = ready(),
    before = g.layout.map((i) => i.id);
  for (let i = 0; i < 10; i++)
    g.shifts.push({
      ...makeShift(
        g,
        {
          type: "startShift",
          menu: ["espresso"],
          strategy: "balanced",
          prep: "welcome",
        },
        1000,
        "stage" + i,
      ),
      finalized: true,
    });
  g.xp = 0;
  assert.ok(!publicGame(g).availableEventIds.includes("local"));
  g.xp = 900;
  assert.ok(publicGame(g).availableEventIds.includes("local"));
  assert.deepEqual(
    g.layout.map((i) => i.id),
    before,
  );
});
test("optional event cannot spend reserved wages and trap an unprofitable shift", () => {
  const g = ready();
  g.balance = 170;
  g.inventory = { beans: 60, milk: 0, flour: 0 };
  applyAction(
    g,
    {
      type: "startShift",
      menu: ["cookie"],
      strategy: "balanced",
      prep: "welcome",
    },
    1000,
  );
  assert.throws(() =>
    applyAction(g, { type: "shiftDecision", choice: "care" }, 62000),
  );
  applyAction(g, { type: "shiftDecision", choice: "neutral" }, 62000);
  finalize(g, 301001);
  assert.equal(g.shifts[0].finalized, true);
  assert.equal(g.balance, 0);
  assert.ok(publicGame(g).canRecover);
});
test("saved story choices change later authored dialogue and available decisions", () => {
  const g = ready();
  applyAction(g, { type: "story", eventId: "regular1", choice: "talk" }, 1000);
  g.shifts.push({
    ...makeShift(
      g,
      {
        type: "startShift",
        menu: ["espresso"],
        strategy: "balanced",
        prep: "welcome",
      },
      1000,
      "story",
    ),
    finalized: true,
  });
  assert.ok(
    publicGame(g)
      .storyVariants.find((e) => e.id === "regular2")!
      .intro.includes("рассказ"),
  );
  applyAction(
    g,
    { type: "story", eventId: "regular2", choice: "remember" },
    2000,
  );
  g.shifts.push({ ...g.shifts[0], id: "story2" });
  const e = publicGame(g).storyVariants.find((e) => e.id === "regular3")!;
  assert.ok(e.choices.some((c) => c.id === "personal"));
  assert.ok(!e.choices.some((c) => c.id === "tasting"));
  assert.throws(() =>
    applyAction(
      g,
      { type: "story", eventId: "regular3", choice: "tasting" },
      3000,
    ),
  );
  applyAction(
    g,
    { type: "story", eventId: "regular3", choice: "personal" },
    3000,
  );
  assert.ok(g.achievements.includes("regular"));
});
