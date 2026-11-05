import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  ECONOMY,
  MENU,
  UPGRADES,
  EMPLOYEES,
  EVENTS,
  STRATEGIES,
  CUSTOMERS,
  contextualStory,
} from "../shared/content";
import {
  stageOf,
  levelOf,
  type Game,
  type Shift,
  type Guest,
  type CustomerKind,
  type Ingredient,
  type Report,
} from "../shared/types";
import {
  initialLayout,
  furniture,
  validateLayout,
  ROOM,
} from "../shared/layout";
import type { Action } from "../shared/schemas";
export class GameError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function need(
  condition: unknown,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) throw new GameError(message, status);
}
export function createGame(id: string, now = Date.now()): Game {
  return {
    id,
    version: 0,
    createdAt: now,
    lastSeen: now,
    name: "Точка тепла",
    balance: 10000,
    reputation: 10,
    xp: 0,
    mood: 75,
    tutorial: 0,
    inventory: { beans: 60, milk: 90, flour: 60 },
    upgrades: [],
    employees: [{ id: "timur", xp: 0, trained: 0, assigned: true }],
    layout: initialLayout(),
    stored: [],
    skin: "original",
    shifts: [],
    stories: [],
    achievements: [],
    journal: [
      { at: now, text: "Ключи от маленькой кофейни — начало большой истории." },
    ],
    ledger: [
      {
        id: "initial",
        at: now,
        amount: 10000,
        reason: "Стартовый капитал",
        balance: 10000,
      },
    ],
    orders: [],
    entitlements: [],
    operations: {},
    settings: {
      eveningLight: false,
      music: false,
      sound: true,
      haptics: true,
      reducedMotion: false,
      lowQuality: false,
      notifications: false,
    },
    layouts: [],
    analytics: [],
    recoveryUsedAt: 0,
    supportTickets: [],
  };
}
export function moneyChange(
  g: Game,
  amount: number,
  reason: string,
  id: string,
  now: number,
) {
  need(Number.isSafeInteger(amount), "Деньги должны быть целым числом");
  if (g.ledger.some((x) => x.id === id)) return;
  need(
    g.balance + amount >= 0,
    "Не хватает монет. Можно выбрать бесплатный вариант.",
  );
  g.balance += amount;
  g.ledger.push({ id, at: now, amount, reason, balance: g.balance });
}
function rng(seed: string) {
  let a = parseInt(
    createHash("sha256").update(seed).digest("hex").slice(0, 8),
    16,
  );
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function stats(g: Game) {
  const upgrades = UPGRADES.filter((u) => g.upgrades.includes(u.id)),
    team = g.employees.filter((e) => e.assigned);
  return {
    capacity:
      12 +
      (g.mood >= 90 ? 1 : g.mood < 40 ? -1 : 0) +
      upgrades.reduce((s, u) => s + (u.speed || 0), 0) +
      team.reduce(
        (s, e) =>
          s +
          (EMPLOYEES.find((a) => a.id === e.id)?.speed || 0) +
          e.trained * 2,
        0,
      ),
    comfort:
      5 +
      upgrades.reduce((s, u) => s + (u.comfort || 0), 0) +
      team.reduce(
        (s, e) =>
          s + ((EMPLOYEES.find((a) => a.id === e.id)?.care || 0) >= 6 ? 2 : 0),
        0,
      ),
    quality: upgrades.reduce((s, u) => s + (u.quality || 0), 0),
    attraction: upgrades.reduce((s, u) => s + (u.rep || 0), 0),
    wages: team.reduce(
      (s, e) => s + (EMPLOYEES.find((a) => a.id === e.id)?.wage || 0),
      0,
    ),
  };
}
export function canRecover(g: Game) {
  return (
    g.balance < 350 ||
    (g.inventory.beans + g.inventory.flour === 0 &&
      g.balance < ECONOMY.stockPrice) ||
    (g.balance < stats(g).wages + ECONOMY.rent[stageOf(g) - 1] &&
      g.balance < ECONOMY.stockPrice)
  );
}
export function activeShift(g: Game) {
  return g.shifts.find((s) => !s.finalized);
}
export function plusUntil(g: Game, now: number) {
  let end = 0;
  for (const e of g.entitlements
    .filter((e) => e.productId === "plus" && !e.revoked)
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)))
    end = Math.max(e.at, end) + 30 * 86400000;
  return end > now ? end : 0;
}
export function owns(g: Game, product: string) {
  return g.entitlements.some((e) => e.productId === product && !e.revoked);
}
export function availableEvents(g: Game) {
  const n = g.shifts.filter((s) => s.finalized).length;
  return EVENTS.map((e) => contextualStory(e, g.stories)).filter(
    (e) =>
      e.minShifts <= n &&
      e.minStage <= stageOf(g) &&
      g.stories.filter((s) => s.eventId === e.id).length < e.maxRepeats &&
      (!e.requires || g.stories.some((s) => s.eventId === e.requires)),
  );
}
export function makeShift(
  g: Game,
  a: Extract<Action, { type: "startShift" }>,
  now: number,
  seed = randomBytes(24).toString("hex"),
): Shift {
  const r = rng(seed),
    st = stats(g),
    strategy = STRATEGIES.find((s) => s.id === a.strategy)!;
  const demand = a.recovery
    ? 8
    : Math.max(
        8,
        Math.floor(
          (18 +
            g.reputation * 0.22 +
            st.attraction +
            Math.floor(st.comfort / 4) +
            (r() * 8 - 4) +
            (a.prep === "welcome" ? 3 : 0)) *
            strategy.demand,
        ),
      );
  const capacity = a.recovery
    ? 8
    : st.capacity + (a.prep === "practice" ? 2 : 0);
  const stock = { ...g.inventory },
    guests: Guest[] = [];
  const kinds = Object.keys(CUSTOMERS) as CustomerKind[];
  const menu = MENU.filter((m) => a.menu.some((id) => id === m.id));
  let served = 0,
    nextAvailable = 0;
  const serviceMs = Math.floor(240000 / capacity);
  const seats = Math.min(
      6,
      g.layout.filter((x) => x.type === "table").length * 2,
    ),
    seatUntil = Array(seats).fill(0);
  for (let i = 0; i < demand; i++) {
    const kind = kinds[Math.floor(r() * kinds.length)];
    const favourites: Record<CustomerKind, string[]> = {
      student: ["espresso", "cookie"],
      office: ["espresso", "cappuccino"],
      tourist: ["cappuccino", "croissant"],
      laptop: ["latte"],
      friends: ["croissant", "cookie"],
      regular: ["espresso"],
    };
    const preferred = menu.filter((m) => favourites[kind].includes(m.id));
    const options = preferred.length && r() < 0.7 ? preferred : menu;
    const product = options[Math.floor(r() * options.length)],
      arrival = Math.floor((i / demand) * 240000 + r() * 2500);
    let reason = "";
    const finish = Math.max(arrival + 9000, nextAvailable) + serviceMs;
    const wait = Math.max(0, nextAvailable - arrival - 9000);
    if (
      a.strategy === "premium" &&
      r() <
        {
          student: 0.3,
          office: 0.1,
          tourist: 0.04,
          laptop: 0.12,
          friends: 0.15,
          regular: 0.08,
        }[kind]
    )
      reason = "Цена выше ожиданий";
    else if (served >= capacity) reason = "Длинная очередь";
    else if (
      !a.recovery &&
      wait > CUSTOMERS[kind].patience * 1000 + st.comfort * 200
    )
      reason = "Не дождался в очереди";
    else if (finish > 285000) reason = "Не успеваем до конца смены";
    else if (
      !Object.entries(product.recipe).every(
        ([k, v]) => stock[k as Ingredient] >= v,
      )
    )
      reason = "Закончились ингредиенты";
    const freeSeat = seatUntil.findIndex((t) => t < finish + 5000);
    if (
      !reason &&
      freeSeat < 0 &&
      ["laptop", "friends", "regular"].includes(kind)
    )
      reason = "Все места заняты";
    const ok = !reason;
    if (ok) {
      served++;
      nextAvailable = finish;
      for (const [k, v] of Object.entries(product.recipe))
        stock[k as Ingredient] -= v;
      if (freeSeat >= 0) seatUntil[freeSeat] = finish + 28000;
    }
    guests.push({
      id: i,
      kind,
      arrival,
      finish,
      product: product.id,
      served: ok,
      ...(reason ? { lostReason: reason } : {}),
      price: Math.floor(
        (product.price *
          strategy.mult *
          (100 +
            (product.id === "croissant" || product.id === "cookie"
              ? 0
              : st.quality))) /
          10000,
      ),
      recipe: product.recipe,
      seat: freeSeat,
    });
  }
  return {
    id: randomUUID(),
    start: now,
    end: now + ECONOMY.duration,
    seed,
    strategy: a.strategy,
    menu: a.menu,
    guests,
    wages: a.recovery ? 0 : st.wages,
    rent: a.recovery ? 0 : ECONOMY.rent[stageOf(g) - 1],
    finalized: false,
    notified: false,
    recovery: !!a.recovery,
  };
}
export function calculateReport(s: Shift): Report {
  const served = s.guests.filter((a) => a.served);
  const ingredients = served.reduce(
    (sum, a) =>
      sum +
      Object.entries(a.recipe).reduce(
        (v, [k, n]) => v + n * ECONOMY.ingredientCost[k as Ingredient],
        0,
      ),
    0,
  );
  const eventRevenue = s.event
    ? served.filter((a) => s.start + a.arrival > s.event!.at).length *
      s.event.bonus
    : 0;
  const revenue = served.reduce((sum, a) => sum + a.price, 0) + eventRevenue,
    expenses = ingredients + s.wages + s.rent + (s.event?.cost || 0),
    lostReasons: Record<string, number> = {};
  for (const a of s.guests.filter((a) => !a.served))
    lostReasons[a.lostReason || "Нет заказа"] =
      (lostReasons[a.lostReason || "Нет заказа"] || 0) + 1;
  const lost = s.guests.length - served.length,
    main = Object.entries(lostReasons).sort((a, b) => b[1] - a[1])[0];
  let conclusion =
    lost === 0
      ? "Каждый гость получил свой заказ. Команда и запасы справились со спросом."
      : [
            "Длинная очередь",
            "Не дождался в очереди",
            "Не успеваем до конца смены",
          ].includes(main?.[0] || "")
        ? `Обслужено ${served.length} из ${s.guests.length} желающих. ${main[1]} ушли из очереди: ускорь кофемашину или назначь помощника.`
        : main?.[0] === "Цена выше ожиданий"
          ? `${main[1]} гостям не подошли цены. Соседская стратегия привлечёт больше чувствительных к цене гостей.`
          : main?.[0] === "Все места заняты"
            ? `${main[1]} гостям не хватило мест. Дополнительный столик поможет принимать компании.`
            : `${main?.[1] || 0} заказов потеряны из-за запасов. Проверь ингредиенты перед следующей сменой.`;
  return {
    revenue,
    expenses,
    profit: revenue - expenses,
    ingredients,
    wages: s.wages,
    rent: s.rent,
    eventCost: s.event?.cost || 0,
    eventRevenue,
    served: served.length,
    demand: s.guests.length,
    lost,
    conclusion,
    lostReasons,
  };
}
export function finalize(g: Game, now: number) {
  for (const s of g.shifts.filter((s) => !s.finalized && s.end <= now)) {
    const report = calculateReport(s);
    s.report = report;
    s.finalized = true;
    // Ingredient purchase is charged when restocking; consumption is a cost of goods, not a second cash debit.
    const cashIncome = report.revenue - report.wages - report.rent;
    moneyChange(g, cashIncome, "Итог смены", `shift:${s.id}`, s.end);
    g.xp += 40 + report.served * 2;
    g.reputation = Math.max(
      0,
      Math.min(
        100,
        g.reputation +
          (report.lost > report.served
            ? -1
            : s.strategy === "friendly"
              ? 4
              : s.strategy === "premium"
                ? 1
                : 2),
      ),
    );
    g.mood = Math.min(100, g.mood + 1);
    for (const e of g.employees.filter((e) => e.assigned))
      e.xp += report.served;
    const award = (id: string) => {
      if (!g.achievements.includes(id)) g.achievements.push(id);
    };
    if (report.profit > 0) award("profit");
    if (report.lost === 0) award("perfect");
    if (
      report.profit > 0 &&
      g.shifts.some(
        (x) => x.finalized && x.id !== s.id && (x.report?.profit || 0) < 0,
      )
    )
      award("comeback");
    if (g.shifts.filter((x) => x.finalized).length >= 10) award("ten");
    g.journal.push({
      at: s.end,
      text: `Смена завершена: ${report.served} гостей, прибыль ${report.profit} монет.`,
    });
    g.analytics.push({ name: "shift_complete", at: s.end, meta: s.id });
    g.version++;
  }
}
function between(g: Game) {
  need(!activeShift(g), "Дождись конца смены — команда сейчас работает.");
}
function completeTutorial(g: Game, now: number) {
  if (!g.layout.some((i) => i.id === "first-machine")) {
    g.layout = g.layout.filter((i) => i.id !== "counter");
    g.layout.push(furniture("first-machine", "machine", 1, 1));
  }
  if (!g.upgrades.includes("decor") && !g.upgrades.includes("lighting"))
    g.upgrades.push("decor");
  if (!g.layout.concat(g.stored).some((i) => i.id === "tutorial-gift"))
    g.layout.push(
      furniture(
        "tutorial-gift",
        g.upgrades.includes("lighting") ? "lamp" : "plant",
        0,
        3,
      ),
    );
  g.tutorial = 6;
  if (!g.analytics.some((a) => a.name === "tutorial_complete"))
    g.analytics.push({ name: "tutorial_complete", at: now });
}
export function applyAction(g: Game, a: Action, now = Date.now()) {
  finalize(g, now);
  switch (a.type) {
    case "tutorial": {
      need(a.step === g.tutorial, "Шаг уже выполнен. Обнови состояние.", 409);
      if (a.name) g.name = a.name;
      if (a.step === 1) {
        g.layout = g.layout.filter((x) => x.id !== "counter");
        g.layout.push(furniture("first-machine", "machine", 1, 1));
      }
      if (a.step === 3)
        moneyChange(g, 150, "Первая чашка", "tutorial:coffee", now);
      if (a.step === 4) {
        g.upgrades.push(a.gift || "decor");
        if (!g.layout.concat(g.stored).some((i) => i.id === "tutorial-gift"))
          g.layout.push(
            furniture(
              "tutorial-gift",
              a.gift === "lighting" ? "lamp" : "plant",
              0,
              3,
            ),
          );
        g.journal.push({
          at: now,
          text: "Первое улучшение: зелёный уголок от Амины.",
        });
      }
      g.tutorial = Math.min(6, g.tutorial + 1);
      if (g.tutorial === 6) completeTutorial(g, now);
      break;
    }
    case "skipTutorial":
      if (a.name) g.name = a.name;
      completeTutorial(g, now);
      break;
    case "startShift": {
      need(g.tutorial >= 6, "Сначала закончи знакомство с кофейней.");
      between(g);
      need(
        g.employees.some((x) => x.assigned),
        "Назначь хотя бы одного сотрудника.",
      );
      if (a.recovery) {
        need(
          canRecover(g),
          "Для обычной смены пока достаточно средств и запасов.",
        );
        need(
          g.recoveryUsedAt !== g.shifts.length + 1,
          "Восстановление уже запущено.",
        );
        g.recoveryUsedAt = g.shifts.length + 1;
      } else {
        need(
          g.balance >= stats(g).wages + ECONOMY.rent[stageOf(g) - 1],
          "На зарплату и аренду нужен небольшой резерв.",
        );
        need(
          g.inventory.beans + g.inventory.flour > 0,
          "Закупи ингредиенты перед сменой.",
        );
      }
      const startAction = a.recovery
        ? { ...a, menu: ["espresso" as const], strategy: "balanced" as const }
        : a;
      const s = makeShift(
        a.recovery ? { ...g, inventory: { beans: 8, milk: 0, flour: 0 } } : g,
        startAction,
        now,
      );
      for (const guest of s.guests.filter(
        (guest) => guest.served && !a.recovery,
      ))
        for (const [k, n] of Object.entries(guest.recipe))
          g.inventory[k as Ingredient] -= n;
      g.shifts.push(s);
      g.analytics.push({ name: "shift_start", at: now, meta: s.id });
      if (a.prep === "tidy") g.mood = Math.min(100, g.mood + 3);
      break;
    }
    case "shiftDecision": {
      const s = activeShift(g);
      need(s, "Смена уже закончилась.");
      need(
        now >= s.start + 60000 && now < s.start + 240000,
        "Событие доступно на второй–четвёртой минуте.",
      );
      need(!s.event, "Решение уже принято.");
      const cost = a.choice === "care" ? 30 : 0;
      need(
        g.balance - cost >= s.wages + s.rent,
        "Зарплата и аренда зарезервированы. Можно выбрать бесплатный обычный сервис.",
      );
      moneyChange(g, -cost, "Забота о гостях", `shift-event:${s.id}`, now);
      s.event = {
        choice: a.choice,
        at: now,
        cost,
        bonus: a.choice === "care" ? 10 : 0,
      };
      break;
    }
    case "upgrade": {
      between(g);
      const u = UPGRADES.find((u) => u.id === a.id);
      need(u, "Такого улучшения нет.");
      need(!g.upgrades.includes(u.id), "Улучшение уже куплено.");
      need(levelOf(g.xp) >= u.level, `Нужен уровень ${u.level}.`);
      moneyChange(g, -u.price, u.name, `upgrade:${u.id}`, now);
      g.upgrades.push(u.id);
      if (["plant", "table", "chair", "lamp"].includes(u.type)) {
        const item = furniture(`upgrade-${u.id}`, u.type, 0, 0);
        g.stored.push(item);
      }
      g.journal.push({ at: now, text: `Кофейня стала уютнее: ${u.name}.` });
      break;
    }
    case "restock": {
      between(g);
      const additions = Object.fromEntries(
        (["beans", "milk", "flour"] as Ingredient[]).map((k) => [
          k,
          Math.max(0, Math.min(ECONOMY.stockPack[k], 300 - g.inventory[k])),
        ]),
      ) as Record<Ingredient, number>;
      const cost = (Object.keys(additions) as Ingredient[]).reduce(
        (sum, k) => sum + additions[k] * ECONOMY.ingredientCost[k],
        0,
      );
      need(cost > 0, "На складе уже достаточно ингредиентов.");
      moneyChange(
        g,
        -cost,
        "Закупка ингредиентов",
        `stock:${randomUUID()}`,
        now,
      );
      for (const k of ["beans", "milk", "flour"] as Ingredient[])
        g.inventory[k] += additions[k];
      break;
    }
    case "hire": {
      between(g);
      const e = EMPLOYEES.find((e) => e.id === a.id);
      need(e, "Сотрудник не найден.");
      need(!g.employees.some((x) => x.id === a.id), "Сотрудник уже в команде.");
      moneyChange(g, -e.hire, `Найм: ${e.name}`, `hire:${e.id}`, now);
      g.employees.push({ id: e.id, xp: 0, trained: 0, assigned: false });
      break;
    }
    case "assign": {
      between(g);
      const e = g.employees.find((x) => x.id === a.id);
      need(e, "Сначала найми сотрудника.");
      need(
        !a.assigned ||
          g.employees.filter((e) => e.assigned).length < 3 ||
          e.assigned,
        "В этой кофейне три рабочих места.",
      );
      e.assigned = a.assigned;
      break;
    }
    case "train": {
      between(g);
      const e = g.employees.find((x) => x.id === a.id);
      need(e, "Сотрудник не найден.");
      need(e.trained < 3, "Все три курса уже пройдены.");
      moneyChange(
        g,
        -300 * (e.trained + 1),
        "Обучение сотрудника",
        `train:${e.id}:${e.trained}`,
        now,
      );
      e.trained++;
      break;
    }
    case "story": {
      between(g);
      const event = availableEvents(g).find((e) => e.id === a.eventId);
      need(event, "Эта история сейчас недоступна.");
      const choice = event.choices.find((c) => c.id === a.choice);
      need(choice, "Неизвестное решение.");
      moneyChange(g, -choice.cost, event.title, `story:${event.id}`, now);
      g.reputation = Math.min(100, g.reputation + choice.rep);
      g.mood = Math.min(100, g.mood + choice.mood);
      if (choice.stock) g.inventory.beans += choice.stock;
      g.stories.push({
        eventId: event.id,
        choice: choice.id,
        at: now,
        reply: choice.reply,
      });
      g.journal.push({ at: now, text: `${event.title}. ${choice.reply}` });
      if (event.id === "regular3" && !g.achievements.includes("regular"))
        g.achievements.push("regular");
      if (
        ["regular3", "timur3", "festival3"].includes(event.id) &&
        !g.achievements.includes("story")
      )
        g.achievements.push("story");
      break;
    }
    case "move":
    case "placeStored": {
      between(g);
      const source = a.type === "move" ? g.layout : g.stored;
      const item = source.find((x) => x.id === a.id);
      need(item, "Предмет не принадлежит кофейне.");
      const changed = furniture(item.id, item.type, a.x, a.y, a.rotation),
        layout = [...g.layout.filter((x) => x.id !== item.id), changed];
      const error = validateLayout(layout);
      need(!error, error || "Недопустимое размещение");
      g.layout = layout;
      if (a.type === "placeStored")
        g.stored = g.stored.filter((x) => x.id !== item.id);
      break;
    }
    case "storeFurniture": {
      between(g);
      const item = g.layout.find((x) => x.id === a.id);
      need(item, "Предмет не найден.");
      need(
        !["machine", "counter"].includes(item.type),
        "Рабочую стойку нужно оставить в зале.",
      );
      const layout = g.layout.filter((x) => x.id !== a.id);
      need(!validateLayout(layout), "Нельзя изменить проходы.");
      g.layout = layout;
      g.stored.push(item);
      break;
    }
    case "settings":
      if (a.settings.eveningLight)
        need(plusUntil(g, now), "Вечерний свет доступен с действующим Plus.");
      g.settings = { ...g.settings, ...a.settings };
      break;
    case "applySkin":
      need(
        a.skin === "original" || owns(g, a.skin),
        "Сначала получи этот набор.",
      );
      g.skin = a.skin;
      break;
    case "saveLayout": {
      between(g);
      need(
        a.slot === 0 || plusUntil(g, now),
        "Дополнительные схемы доступны с Plus.",
      );
      g.layouts[a.slot] = {
        id: String(a.slot),
        name: a.name,
        items: structuredClone(g.layout),
      };
      break;
    }
    case "loadLayout": {
      between(g);
      need(
        a.slot === 0 || plusUntil(g, now),
        "Дополнительные схемы сохранены, но для изменения нужен Plus.",
      );
      const saved = g.layouts[a.slot];
      need(saved, "Схема пока пуста.");
      const all = [...g.layout, ...g.stored];
      need(
        saved.items.every((i) => all.some((x) => x.id === i.id)),
        "В схеме есть недоступные предметы.",
      );
      need(!validateLayout(saved.items), "Схема перекрывает проход.");
      g.stored = all.filter((x) => !saved.items.some((y) => y.id === x.id));
      g.layout = structuredClone(saved.items);
      break;
    }
    case "track":
      g.analytics.push({ name: a.event, at: now });
      break;
  }
  g.version++;
  g.lastSeen = now;
  return { ok: true, version: g.version };
}
export function runOperation(
  g: Game,
  key: string,
  action: Action,
  now = Date.now(),
) {
  need(/^[a-zA-Z0-9_-]{12,100}$/.test(key), "Нужен идентификатор операции.");
  const hash = createHash("sha256")
    .update(JSON.stringify(action))
    .digest("hex");
  const old = g.operations[key];
  if (old) {
    need(
      old.hash === hash,
      "Этот идентификатор использован для другого действия.",
      409,
    );
    return old.result;
  }
  const result = applyAction(g, action, now);
  g.operations[key] = { hash, result };
  return result;
}
export function publicGame(g: Game, now = Date.now()) {
  const { operations, id, ...safe } = structuredClone(g);
  return {
    ...safe,
    id,
    shifts: safe.shifts.map(({ seed, ...s }) => ({
      ...s,
      guests: s.guests.map(({ recipe, ...a }) => a),
    })),
    serverNow: now,
    stage: stageOf(g),
    level: levelOf(g.xp),
    stats: stats(g),
    plusUntil: plusUntil(g, now),
    canRecover: canRecover(g),
    storyVariants: availableEvents(g),
    availableEventIds: availableEvents(g).map((e) => e.id),
  };
}
