import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { Scene, type Selection } from "./Scene";
import { Icon } from "./Icon";
import { api, mutate, operationId, loadTelegramSDK, type State } from "./api";
import { unlockAudio, sound, music, stopAudio } from "./audio";
import {
  MENU,
  UPGRADES,
  EMPLOYEES,
  EVENTS,
  PRODUCTS,
  CUSTOMERS,
  ACHIEVEMENTS,
  STRATEGIES,
  CHARACTERS,
} from "../../shared/content";
import {
  money,
  type Furniture,
  type CustomerKind,
  type Order,
} from "../../shared/types";
import { furniture, validateLayout } from "../../shared/layout";
import type { Action } from "../../shared/schemas";
import "./style.css";
type Tab = "cafe" | "grow" | "story" | "shop" | "profile";
const nav = [
  ["cafe", "Кофейня"],
  ["grow", "Развитие"],
  ["story", "История"],
  ["shop", "Магазин"],
  ["profile", "Профиль"],
] as const;
const date = (at: number) =>
  new Date(at).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const compact = (n: number) =>
  n >= 1000000
    ? (n / 1000000).toFixed(1) + " млн"
    : n >= 10000
      ? (n / 1000).toFixed(1) + " тыс."
      : money(n);
const atlasNames = [
  "timur",
  "lola",
  "kamol",
  "sara",
  "aziz",
  "vera",
  "amina",
  "rustam",
];
function Art({
  id,
  className = "",
  portrait = false,
}: {
  id: string;
  className?: string;
  portrait?: boolean;
}) {
  const at = atlasNames.indexOf(id);
  if (portrait && at >= 0)
    return (
      <span className={"art portrait-art " + className}>
        <img
          src="/art/characters-atlas.png"
          alt=""
          style={{
            width: "800%",
            left: -((at % 4) * 200 + 50) + "%",
            top: -(Math.floor(at / 4) * 237 + 4) + "%",
          }}
        />
      </span>
    );
  return (
    <img
      className={"art " + className}
      src={`/art/${id}${portrait ? "-portrait" : ""}.svg`}
      alt=""
      onError={(e) => {
        e.currentTarget.src = "/art/plant.svg";
      }}
    />
  );
}

function App() {
  const [state, setState] = useState<State | null>(null),
    [config, setConfig] = useState<any>(null),
    [admin, setAdmin] = useState(false),
    [tab, setTab] = useState<Tab>("cafe"),
    [sheet, setSheet] = useState<{ title: string; body: ReactNode } | null>(
      null,
    ),
    [notice, setNotice] = useState(""),
    [online, setOnline] = useState(true),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(Date.now()),
    [edit, setEdit] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [draft, setDraft] = useState<Furniture | null>(null),
    [preview, setPreview] = useState<string | null>(null),
    [name, setName] = useState("Точка тепла"),
    [strategy, setStrategy] = useState<"friendly" | "balanced" | "premium">(
      "balanced",
    ),
    [menu, setMenu] = useState(MENU.map((m) => m.id) as any),
    [prep, setPrep] = useState<"welcome" | "practice" | "tidy">("welcome"),
    [growTab, setGrowTab] = useState("upgrades"),
    [historyTab, setHistoryTab] = useState("stories"),
    [initialError, setInitialError] = useState(""),
    [pending, setPending] = useState<{ action: Action; key: string } | null>(
      null,
    ),
    [ready, setReady] = useState(false),
    [adminData, setAdminData] = useState<any>(null);
  const completedCount = useRef<number | null>(null);
  useEffect(() => {
    if (!state) return;
    const count = state.shifts.filter((s) => s.finalized).length;
    if (completedCount.current !== null && count > completedCount.current) {
      sound("finish", state.settings.sound);
      setNotice("Смена завершена. Финансовый отчёт сохранён.");
    }
    completedCount.current = count;
  }, [state?.shifts.filter((s) => s.finalized).length]);
  const current = useRef(state),
    busyRef = useRef(false),
    serverClock = useRef(0);
  current.current = state;
  const save = useCallback((s: State) => {
    serverClock.current = s.serverNow - Date.now();
    setState(s);
    setOnline(true);
    localStorage.setItem("idealab-snapshot", JSON.stringify(s));
  }, []);
  const refresh = useCallback(async () => {
    try {
      save(await api<State>("state"));
    } catch {
      setOnline(false);
    }
  }, [save]);
  useEffect(() => {
    const boot = async () => {
      try {
        const c = await api("config");
        setConfig(c);
        if (!c.demo) await loadTelegramSDK();
        const tg = window.Telegram?.WebApp;
        tg?.ready();
        tg?.expand();
        tg?.setHeaderColor?.("#f5f0e8");
        const result = await api("auth", { initData: tg?.initData || "" });
        save(result.state);
        setAdmin(result.admin);
        setName(result.state.name);
        const p = localStorage.getItem("idealab-pending:" + result.state.id);
        if (p) setPending(JSON.parse(p));
        setReady(true);
      } catch (e) {
        const cached = localStorage.getItem("idealab-snapshot");
        if (cached) {
          try {
            setState(JSON.parse(cached));
            setOnline(false);
          } catch {}
        }
        setInitialError((e as Error).message);
      }
    };
    void boot();
  }, [save]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 15000);
    const visible = () => {
      if (document.hidden) {
        stopAudio();
      } else {
        void refresh();
        music(current.current?.settings.music || false);
      }
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", refresh);
    };
  }, [ready, refresh]);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 6000);
      return () => clearTimeout(t);
    }
  }, [notice]);
  useEffect(() => {
    music(state?.settings.music || false);
    return () => stopAudio();
  }, [state?.settings.music]);
  const close = useCallback(() => {
    if (sheet) setSheet(null);
    else if (preview) setPreview(null);
    else if (edit) {
      setEdit(false);
      setDraft(null);
    } else setTab("cafe");
  }, [sheet, preview, edit]);
  useEffect(() => {
    const back = window.Telegram?.WebApp?.BackButton;
    if (!back) return;
    if (sheet || tab !== "cafe" || edit || preview) back.show();
    else back.hide();
    back.onClick(close);
    return () => back.offClick(close);
  }, [sheet, tab, edit, preview, close]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);
  const act = async (
    action: Action,
    key: string = operationId(),
    retry = false,
  ) => {
    if (busyRef.current || !online || (pending && !retry)) return false;
    busyRef.current = true;
    setBusy(true);
    unlockAudio();
    try {
      if (retry) {
        const result = await api("operation/" + key);
        if (result.completed) {
          await refresh();
          setPending(null);
          localStorage.removeItem("idealab-pending:" + current.current!.id);
          return true;
        }
      }
      const result = await mutate(action, key);
      save(result.state);
      if (action.type === "tutorial" && action.step === 3)
        setNotice("Первая чашка готова. +150 учебных монет!");
      setPending(null);
      localStorage.removeItem("idealab-pending:" + result.state.id);
      sound(
        action.type === "startShift" ? "coffee" : "confirm",
        result.state.settings.sound,
      );
      if (result.state.settings.haptics)
        window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light");
      return true;
    } catch (e) {
      const message = (e as Error).message;
      if (
        (e as Error).name === "TimeoutError" ||
        (e as Error).name === "TypeError"
      ) {
        const p = { action, key };
        setPending(p);
        localStorage.setItem(
          "idealab-pending:" + current.current!.id,
          JSON.stringify(p),
        );
        setOnline(false);
        setNotice("Ответ не получен. Проверим статус перед повтором.");
      } else {
        setNotice(message);
        void refresh();
      }
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const confirm = (
    title: string,
    text: ReactNode,
    action: () => Promise<unknown>,
  ) =>
    setSheet({
      title,
      body: (
        <div className="confirm-body">
          {text}
          <div className="button-row">
            <button className="button secondary" onClick={() => setSheet(null)}>
              Отмена
            </button>
            <button
              className="button"
              onClick={async () => {
                setSheet(null);
                await action();
              }}
            >
              Подтвердить <Icon name="check" size={18} />
            </button>
          </div>
        </div>
      ),
    });
  const changeTab = (t: Tab) => {
    setTab(t);
    setSheet(null);
    setEdit(false);
    setDraft(null);
    setPreview(null);
    if (t === "shop" && state && state.tutorial >= 6)
      void act({ type: "track", event: "shop_open" });
  };
  if (!state)
    return (
      <div className="loading">
        <img src="/art/logo.svg" alt="IdeaLab" />
        <h1>Здесь рождается твоя история</h1>
        <p>{initialError || "Открываем двери кофейни…"}</p>
        {initialError && (
          <button className="button" onClick={() => location.reload()}>
            Попробовать снова
          </button>
        )}
      </div>
    );
  const g = state,
    shift = g.shifts.find((s) => !s.finalized),
    lastReport = g.shifts.filter((s) => s.finalized).at(-1),
    offset = serverClock.current,
    serverTime = now + offset,
    remaining = shift
      ? Math.min(300, Math.max(0, Math.ceil((shift.end - serverTime) / 1000)))
      : 0;
  const eventIds = g.availableEventIds,
    storyEvent = g.storyVariants[0],
    disabled = busy || !online || !!pending,
    plus = !!g.plusUntil && g.plusUntil > now;
  const restock = {
      beans: Math.max(0, Math.min(60, 300 - g.inventory.beans)),
      milk: Math.max(0, Math.min(60, 300 - g.inventory.milk)),
      flour: Math.max(0, Math.min(40, 300 - g.inventory.flour)),
    },
    stockCost = restock.beans * 8 + restock.milk * 5 + restock.flour * 10;
  const pageTitle = {
    cafe: g.name,
    grow: "Место для больших идей",
    story: "У каждой чашки — история",
    shop: "Особенное для своего места",
    profile: "Твоя история в IdeaLab",
  }[tab];
  const openReport = (s = lastReport) => {
    if (!s?.report) return;
    const r = s.report;
    setSheet({
      title: "Хорошая работа. Смена завершена",
      body: (
        <div className="report">
          <div className="report-hero">
            <Icon name="leaf" size={34} />
            <span>ПРИБЫЛЬ ЗА СМЕНУ</span>
            <strong className={r.profit < 0 ? "negative" : ""}>
              {r.profit > 0 ? "+" : ""}
              {money(r.profit)} <small>монет</small>
            </strong>
          </div>
          <div className="report-numbers">
            <div>
              <span>Выручка</span>
              <b>{money(r.revenue)}</b>
            </div>
            <div>
              <span>Расходы</span>
              <b>{money(r.expenses)}</b>
            </div>
            <div>
              <span>Гостей</span>
              <b>
                {r.served} / {r.demand}
              </b>
            </div>
          </div>
          <div className="mentor-line">
            <Art id="amina" portrait />
            <p>{r.conclusion}</p>
          </div>
          <details>
            <summary>Посмотреть точный расчёт</summary>
            <div className="detail-rows">
              {[
                ["Ингредиенты (из запасов)", r.ingredients],
                ["Зарплата", r.wages],
                ["Аренда", r.rent],
                ["Расходы на событие", r.eventCost],
                ["Дополнительная выручка события", r.eventRevenue],
              ].map(([l, v]) => (
                <div key={l}>
                  <span>{l}</span>
                  <b>{money(Number(v))}</b>
                </div>
              ))}
              {Object.entries(r.lostReasons).map(([k, v]) => (
                <div key={k}>
                  <span>{k}</span>
                  <b>{v} гостей</b>
                </div>
              ))}
            </div>
            <p className="small muted">
              Ингредиенты оплачены при закупке. В балансе отражено движение
              денег, а в прибыли — стоимость израсходованных запасов. Повторного
              списания нет.
            </p>
          </details>
          <button
            className="button full"
            onClick={() => {
              setSheet(null);
              setTab("grow");
            }}
          >
            Посмотреть улучшения <Icon name="arrow" size={18} />
          </button>
        </div>
      ),
    });
  };
  const teamCard = (id: string) => {
    const e = EMPLOYEES.find((x) => x.id === id);
    if (!e) return;
    const hired = g.employees.find((x) => x.id === id);
    setSheet({
      title: e.name,
      body: (
        <>
          <div className="character-card">
            <Art id={id} portrait />
            <div>
              <span className="eyebrow">{e.role}</span>
              <p>{e.bio}</p>
              <span className="tag">{e.trait}</span>
            </div>
          </div>
          <div className="stat-pair">
            <span>
              Скорость <b>{e.speed}</b>
            </span>
            <span>
              Внимание <b>{e.care}</b>
            </span>
          </div>
          <p>
            Зарплата: <b>{e.wage} монет за смену</b>. Списывается только за
            начатую смену.
          </p>
          {hired ? (
            <>
              <p>
                Опыт: {hired.xp} · Обучение: {hired.trained}/3
              </p>
              <button
                className="button full"
                disabled={!!shift || disabled}
                onClick={async () => {
                  setSheet(null);
                  await act({ type: "assign", id, assigned: !hired.assigned });
                }}
              >
                {hired.assigned ? "Снять со смены" : "Назначить на смену"}
              </button>
              {hired.trained < 3 && (
                <button
                  className="button secondary full"
                  disabled={!!shift || disabled}
                  onClick={() =>
                    confirm(
                      "Курс для " + e.name,
                      <p>
                        Цена {300 * (hired.trained + 1)} монет. Навык увеличит
                        пропускную способность на 2 гостя за смену.
                      </p>,
                      () => act({ type: "train", id }),
                    )
                  }
                >
                  Обучить · {300 * (hired.trained + 1)} монет
                </button>
              )}
            </>
          ) : (
            <button
              className="button full"
              disabled={disabled}
              onClick={() =>
                confirm(
                  "Пригласить в команду?",
                  <p>
                    {e.name}: найм {money(e.hire)} монет, зарплата {e.wage} за
                    смену. Назначение — отдельно.
                  </p>,
                  () => act({ type: "hire", id }),
                )
              }
            >
              Нанять · {money(e.hire)}
            </button>
          )}
        </>
      ),
    });
  };
  const select = (s: Selection) => {
    if (s.kind === "employee") {
      teamCard(s.id);
      return;
    }
    if (s.kind === "guest") {
      const guest = shift?.guests.find((g) => String(g.id) === s.id),
        kind = guest?.kind || "regular",
        c = CUSTOMERS[kind];
      setSheet({
        title: c.name,
        body: (
          <div className="character-card">
            <Art id={kind} portrait />
            <div>
              <span className="eyebrow">
                {kind === "regular" ? "Знакомое лицо" : "Гость кофейни"}
              </span>
              <p>{c.note}</p>
              <p className="small muted">
                {guest
                  ? `Заказ: ${MENU.find((m) => m.id === guest.product)?.name}.`
                  : "«Здесь хорошо начинать утро». Сначала познакомимся."}
              </p>
            </div>
          </div>
        ),
      });
      return;
    }
    if (s.id.startsWith("catalog:")) {
      const u = UPGRADES.find((u) => u.id === s.id.slice(8));
      if (u)
        setSheet({
          title: u.name,
          body: (
            <div className="item-intro">
              <Art id={u.type} />
              <div>
                <p>{u.effect}</p>
                <small>{u.visual}</small>
              </div>
            </div>
          ),
        });
      return;
    }
    const item = g.layout.find((x) => x.id === s.id);
    if (!item) return;
    if (edit) {
      setSelected(item.id);
      setDraft({ ...item });
      return;
    }
    setSheet({
      title:
        {
          machine: "Кофемашина «Первый глоток»",
          counter: "Дубовая стойка",
          table: "Столик для разговоров",
          chair: "Любимое кресло",
          plant: "Зелёный сосед",
          lamp: "Тёплая лампа",
          moon: "Тихая луна",
          vase: "Керамическая ваза",
          statue: "Росток основателя",
        }[item.type] || "Предмет кофейни",
      body: (
        <>
          <div className="item-intro">
            <Art id={item.type} />
            <p>
              Место: {item.x + 1}, {item.y + 1}
              <br />
              Размер: {item.w} × {item.h}
              <br />
              {item.type === "machine"
                ? "Здесь команда превращает зёрна в маленькие радости."
                : "Часть твоего уютного пространства."}
            </p>
          </div>
          <button
            className="button secondary full"
            disabled={!!shift}
            onClick={() => {
              setSheet(null);
              setEdit(true);
              setSelected(item.id);
              setDraft({ ...item });
            }}
          >
            Переставить <Icon name="edit" size={18} />
          </button>
        </>
      ),
    });
  };
  const openStory = (id: string) => {
    const e =
      g.storyVariants.find((e) => e.id === id) ||
      EVENTS.find((e) => e.id === id)!;
    setSheet({
      title: e.title,
      body: (
        <div className="story-detail">
          <img
            className="story-illustration"
            src={`/art/event-${e.id}.svg`}
            alt="Тёплый день в кофейне"
          />
          <div className="byline">
            <Art id={e.character} portrait />
            <span>
              {EMPLOYEES.find((p) => p.id === e.character)?.name ||
                CHARACTERS.find((p) => p.id === e.character)?.name}{" "}
              · {e.category}
            </span>
          </div>
          <p>{e.intro}</p>
          {e.choices.map((c) => (
            <button
              className="choice"
              disabled={disabled || !!shift}
              key={c.id}
              onClick={() =>
                confirm(
                  c.label,
                  <>
                    <p>
                      {c.cost ? `${c.cost} монет` : "Бесплатно"} · Репутация +
                      {c.rep} · Настроение +{c.mood}
                      {c.stock ? ` · Зёрна +${c.stock}` : ""}
                    </p>
                    <p className="small muted">{e.uncertainty}</p>
                  </>,
                  async () => {
                    if (
                      await act({ type: "story", eventId: e.id, choice: c.id })
                    ) {
                      setSheet({
                        title: "Новая строчка в истории",
                        body: (
                          <div className="story-reply">
                            <Art id={e.character} portrait />
                            <p>{c.reply}</p>
                            <button
                              className="button full"
                              onClick={() => setSheet(null)}
                            >
                              Продолжить историю
                            </button>
                          </div>
                        ),
                      });
                    }
                  },
                )
              }
            >
              <span>
                <b>{c.label}</b>
                <small>
                  {c.cost ? `${c.cost} монет` : "Бесплатно"} · репутация +
                  {c.rep} · команда +{c.mood}
                </small>
              </span>
              <Icon name="arrow" size={20} />
            </button>
          ))}
          {!!shift && (
            <p className="small">Эта история подождёт конца смены.</p>
          )}
        </div>
      ),
    });
  };
  const purchase = async (id: string) => {
    if (disabled) return;
    setBusy(true);
    try {
      const o = await api<Order>("order", {
        productId: id,
        operationId: operationId(),
      });
      if (o.status === "paid") {
        await refresh();
        setNotice("Товар уже сохранён.");
        return;
      }
      if (config.demo) {
        setSheet({
          title: "Демонстрационный счёт",
          body: (
            <div className="confirm-body">
              <Art id={"product-" + id} className="product-large" />
              <p>
                <b>
                  {o.title} · {o.price} Stars
                </b>
              </p>
              <p>
                Это тест механики покупки. Stars не списываются. Права
                сохраняются только в этой демобазе и не переносятся в Telegram.
              </p>
              <button
                className="button full"
                onClick={async () => {
                  try {
                    save(await api<State>("demo-pay", { orderId: o.id }));
                    setSheet(null);
                    setNotice(
                      "Демо-покупка сохранена. Набор доступен в оформлении.",
                    );
                  } catch (e) {
                    setNotice((e as Error).message);
                  }
                }}
              >
                Подтвердить демо-покупку
              </button>
            </div>
          ),
        });
      } else if (o.invoice && window.Telegram?.WebApp?.openInvoice) {
        window.Telegram.WebApp.openInvoice(o.invoice, () => {
          void refresh();
          setNotice(
            "Проверяем оплату на сервере. Товар выдаётся после подтверждения Telegram.",
          );
        });
      } else setNotice("Для настоящей оплаты открой игру в Telegram.");
    } catch (e) {
      await refresh();
      setNotice((e as Error).message + " Статус покупки доступен в профиле.");
    } finally {
      setBusy(false);
    }
  };
  const openShopProduct = (id: string) => {
    const p = PRODUCTS.find((p) => p.id === id)!;
    setSheet({
      title: p.name,
      body: (
        <>
          <Art id={"product-" + id} className="product-large" />
          <p>{p.description}</p>
          <ul className="contents">
            {p.items.map((item) => (
              <li key={item}>
                <Icon name="check" size={16} />
                {item}
              </li>
            ))}
          </ul>
          {p.duration > 0 && (
            <p className="small muted">
              30 дней без автосписания. Повторная покупка продлевает доступ.
              После окончания схемы сохраняются, дополнительные слоты нельзя
              изменять.
            </p>
          )}
          <div className="button-row">
            {p.skin && (
              <button
                className="button secondary"
                onClick={() => {
                  setSheet(null);
                  setPreview(p.skin);
                  setTab("cafe");
                }}
              >
                Примерить
              </button>
            )}
            <button
              className="button"
              disabled={disabled}
              onClick={() => {
                setSheet(null);
                confirm(
                  config.demo
                    ? "Проверить демо-покупку?"
                    : "Открыть счёт Telegram?",
                  <p>
                    {p.name}. Цена — {p.price} Stars.{" "}
                    {config.demo
                      ? "Демонстрация: без списания Stars."
                      : "Предоставление товара — после подтверждения платежа Telegram."}
                  </p>,
                  () => purchase(p.id),
                );
              }}
            >
              {p.price} <Icon name="star" size={17} />
            </button>
          </div>
        </>
      ),
    });
  };
  const openSupport = () =>
    setSheet({
      title: "Мы рядом",
      body: (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const text = new FormData(e.currentTarget).get("text");
            try {
              const r = await api("support", { text });
              setSheet({
                title: "Обращение сохранено",
                body: (
                  <p>
                    Номер {r.id}. Команда увидит его в кабинете поддержки.
                    {config?.supportUrl && (
                      <>
                        {" "}
                        Также можно обратиться по{" "}
                        <a
                          href={config.supportUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          настроенному адресу
                        </a>
                        .
                      </>
                    )}
                  </p>
                ),
              });
            } catch (err) {
              setNotice((err as Error).message);
            }
          }}
        >
          <p>
            Расскажи, что произошло. Для платежа укажи номер заказа из истории
            покупок. Не присылай токены и реквизиты.
          </p>
          <textarea
            name="text"
            required
            minLength={10}
            maxLength={2000}
            placeholder="Что нам нужно знать?"
          />
          <button className="button full">Отправить обращение</button>
        </form>
      ),
    });
  const tutorialText = [
    [
      "Привет. Это твоё место.",
      "Я Амина. Помогу открыть первую кофейню — шаг за шагом. Как её назовём?",
    ],
    [
      "Начнём с первой чашки",
      "Кофемашина уже ждёт. Поставим её на стойку — место оставлено специально для неё.",
    ],
    [
      "Кажется, к нам гость",
      "Это Даврон, наш сосед. Он любит эспрессо и места у окна. Давай встретим его.",
    ],
    [
      "Маленькое кофейное чудо",
      "Тимур готовит первый напиток. Чашка эспрессо принесёт 150 учебных монет.",
    ],
    [
      "Добавим немного уюта",
      "Первое улучшение — мой подарок. Выбери, что тебе ближе. Оба варианта бесплатные.",
    ],
    [
      "Готово. Двери открыты.",
      "Теперь выбери меню, подготовь команду и начни пяти минутную смену. Она закончится и без тебя.",
    ],
  ];
  const openAdmin = async () => {
    try {
      setAdminData(await api("admin"));
      setSheet(null);
      setTab("profile");
    } catch (e) {
      setNotice((e as Error).message);
    }
  };
  return (
    <div
      className={"app " + (g.settings.reducedMotion ? "reduced-motion" : "")}
      onPointerDown={() => unlockAudio()}
    >
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            changeTab("cafe");
          }}
        >
          <img src="/art/logo.svg" alt="" />
          <span>
            idea<span>lab</span>
            <small>МЕСТО ДЛЯ ТВОИХ ИДЕЙ</small>
          </span>
        </a>
        <nav>
          {nav.map(([id, label]) => (
            <button
              className={tab === id ? "active" : ""}
              onClick={() => changeTab(id)}
              key={id}
            >
              <Icon name={id} />
              <span>{label}</span>
              {id === "story" && eventIds.length > 0 && (
                <i>{eventIds.length}</i>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <Icon name="leaf" size={27} />
          <p>
            Большие истории
            <br />
            начинаются с малого.
          </p>
          <span>
            Твоя идея. Твой бизнес.
            <br />
            Твоя история.
          </span>
        </div>
        <button className="support-link" onClick={openSupport}>
          <Icon name="info" size={18} /> Нужна помощь?
        </button>
        <span className="version">IDEALAB · ПЕРВАЯ ГЛАВА</span>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="mobile-brand">
            <img src="/art/logo.svg" alt="" />
            <b>
              idea<span>lab</span>
            </b>
          </div>
          <div className="breadcrumb">
            <Icon name="cafe" size={17} />
            <span>Твоя кофейня</span>
            <i>/</i>
            <b>
              {
                [
                  "Маленькая кофейня",
                  "Районное заведение",
                  "Авторская кофейня",
                ][g.stage - 1]
              }
            </b>
          </div>
          <div className="wallet">
            <button
              title={`Точный баланс: ${money(g.balance)} монет`}
              onClick={() =>
                setSheet({
                  title: "Деньги кофейни",
                  body: (
                    <>
                      <h2>{money(g.balance)} монет</h2>
                      <p className="muted">
                        Игровая валюта. Не выводится в реальные деньги.
                      </p>
                      <div className="detail-rows">
                        {g.ledger
                          .slice(-12)
                          .reverse()
                          .map((l) => (
                            <div key={l.id}>
                              <span>
                                {l.reason}
                                <small>{date(l.at)}</small>
                              </span>
                              <b>
                                {l.amount > 0 ? "+" : ""}
                                {money(l.amount)}
                              </b>
                            </div>
                          ))}
                      </div>
                    </>
                  ),
                })
              }
            >
              <span className="coin-mark">
                <Icon name="coin" size={19} />
              </span>
              <b>{compact(g.balance)}</b>
              <span className="desktop-only">монет</span>
            </button>
            <div className="level-badge" title={`${g.xp} опыта`}>
              <Icon name="star" size={16} />
              <b>{g.level}</b>
              <span>ур.</span>
            </div>
          </div>
        </header>
        {config?.demo && (
          <div className="demo-strip">
            <span>ДЕМО</span> Прогресс сохраняется на сервере · покупки без
            списания Stars
          </div>
        )}
        {!online && (
          <div className="offline-banner">
            Нет связи. Показано последнее подтверждённое сохранение.{" "}
            <button onClick={refresh}>Проверить сеть</button>
          </div>
        )}
        {pending && (
          <div className="offline-banner">
            Проверим результат последнего действия.{" "}
            <button
              disabled={!online || busy}
              onClick={() => act(pending.action, pending.key, true)}
            >
              Проверить и повторить
            </button>
          </div>
        )}
        <main>
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {tab === "cafe"
                  ? "ГЛАВА " + g.stage + " · НАЧАЛО СВОЕЙ ИСТОРИИ"
                  : {
                      grow: "ШАГ ЗА ШАГОМ",
                      story: "ЛЮДИ, КОТОРЫЕ РЯДОМ",
                      shop: "КОСМЕТИКА И ПОДДЕРЖКА",
                      profile: "ТВОЁ МАЛЕНЬКОЕ ДЕЛО",
                    }[tab]}
              </span>
              <h1>{pageTitle}</h1>
              <p>
                {tab === "cafe"
                  ? "Вкусный кофе. Знакомые лица. И место, в которое хочется вернуться."
                  : tab === "grow"
                    ? "Не спеши стать больше. Становись ближе к своей мечте."
                    : tab === "story"
                      ? "Всё, что превращает кофейню в любимое место."
                      : tab === "shop"
                        ? "Никаких преимуществ в экономике. Только больше характера."
                        : "Уют складывается из твоих решений."}
              </p>
            </div>
            {tab === "cafe" && (
              <span className="weather">
                <Icon name="sun" size={25} />
                <span>
                  Тёплый день<small>Хорошее время для кофе</small>
                </span>
              </span>
            )}
          </div>
          {tab === "cafe" && (
            <div className="cafe-layout">
              <section className="cafe-main">
                <div className="scene-card">
                  <div className="scene-top">
                    <span>
                      <span className="live-dot" />
                      {shift ? "Смена идёт" : "Двери скоро откроются"}
                    </span>
                    <div>
                      <button
                        aria-label="Команда"
                        onClick={() => {
                          setTab("grow");
                          setGrowTab("team");
                        }}
                      >
                        <Icon name="team" size={20} />
                        <span>Команда</span>
                      </button>
                      <button
                        aria-label="Оформление"
                        className={edit ? "active" : ""}
                        disabled={!!shift || g.tutorial < 6}
                        onClick={() => {
                          setEdit(!edit);
                          setSelected(null);
                          setDraft(null);
                        }}
                      >
                        <Icon name="edit" size={19} />
                        <span>{edit ? "Готово" : "Оформить"}</span>
                      </button>
                    </div>
                  </div>
                  <Scene
                    game={g}
                    edit={edit}
                    selected={selected}
                    draft={draft}
                    skin={preview || g.skin}
                    onSelect={select}
                    onCell={(x, y) => {
                      if (draft)
                        setDraft(
                          furniture(draft.id, draft.type, x, y, draft.rotation),
                        );
                    }}
                    onTeam={() => {
                      setTab("grow");
                      setGrowTab("team");
                    }}
                  />
                  <div className="scene-bottom">
                    <div>
                      <Icon name="leaf" size={17} />
                      <span>
                        Комфорт <b>{g.stats.comfort}</b>
                      </span>
                    </div>
                    <div>
                      <Icon name="star" size={17} />
                      <span>
                        Репутация <b>{g.reputation}</b>
                      </span>
                    </div>
                    <div>
                      <Icon name="team" size={17} />
                      <span>
                        Команда <b>{g.mood}%</b>
                      </span>
                    </div>
                  </div>
                </div>
                {preview && (
                  <div className="preview-bar">
                    <span>
                      <b>
                        Примерка ·{" "}
                        {PRODUCTS.find((p) => p.skin === preview)?.name}
                      </b>
                      <small>Оформление пока не сохранено</small>
                    </span>
                    <button
                      className="button secondary"
                      onClick={() => setPreview(null)}
                    >
                      Отмена
                    </button>
                    {g.entitlements.some(
                      (e) => e.productId === preview && !e.revoked,
                    ) ? (
                      <button
                        className="button"
                        disabled={disabled}
                        onClick={async () => {
                          if (
                            await act({
                              type: "applySkin",
                              skin: preview as any,
                            })
                          )
                            setPreview(null);
                        }}
                      >
                        Применить
                      </button>
                    ) : (
                      <button
                        className="button"
                        onClick={() => openShopProduct(preview)}
                      >
                        О наборе
                      </button>
                    )}
                  </div>
                )}
                {edit && (
                  <section className="panel edit-panel">
                    <div className="section-title">
                      <h3>Каждой вещи — своё место</h3>
                      <span className="tag">Оформление</span>
                    </div>
                    {draft ? (
                      <>
                        <p className="small">
                          Коснись клетки или укажи координаты.{" "}
                          {validateLayout([
                            ...g.layout.filter((i) => i.id !== draft.id),
                            draft,
                          ]) || "Проход свободен. Можно поставить."}
                        </p>
                        <div className="placement-inputs">
                          <label>
                            Клетка X
                            <input
                              type="number"
                              min="1"
                              max="9"
                              value={draft.x + 1}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  x: Number(e.target.value) - 1,
                                })
                              }
                            />
                          </label>
                          <label>
                            Клетка Y
                            <input
                              type="number"
                              min="1"
                              max="8"
                              value={draft.y + 1}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  y: Number(e.target.value) - 1,
                                })
                              }
                            />
                          </label>
                          <button
                            className="button secondary"
                            onClick={() =>
                              setDraft(
                                furniture(
                                  draft.id,
                                  draft.type,
                                  draft.x,
                                  draft.y,
                                  draft.rotation ? 0 : 1,
                                ),
                              )
                            }
                          >
                            Повернуть
                          </button>
                        </div>
                        <div className="button-row">
                          <button
                            className="button secondary"
                            onClick={() => {
                              setDraft(null);
                              setSelected(null);
                            }}
                          >
                            Отмена
                          </button>
                          <button
                            className="button"
                            disabled={
                              disabled ||
                              !!validateLayout([
                                ...g.layout.filter((i) => i.id !== draft.id),
                                draft,
                              ])
                            }
                            onClick={async () => {
                              if (
                                await act({
                                  type: g.stored.some((i) => i.id === draft.id)
                                    ? "placeStored"
                                    : "move",
                                  id: draft.id,
                                  x: draft.x,
                                  y: draft.y,
                                  rotation: draft.rotation,
                                })
                              ) {
                                setDraft(null);
                                setSelected(null);
                              }
                            }}
                          >
                            Поставить <Icon name="check" size={17} />
                          </button>
                          {g.layout.some((i) => i.id === draft.id) &&
                            !["machine", "counter"].includes(draft.type) && (
                              <button
                                className="text-button"
                                onClick={async () => {
                                  if (
                                    await act({
                                      type: "storeFurniture",
                                      id: draft.id,
                                    })
                                  ) {
                                    setDraft(null);
                                    setSelected(null);
                                  }
                                }}
                              >
                                На склад
                              </button>
                            )}
                        </div>
                      </>
                    ) : (
                      <p className="muted small">
                        Выбери предмет в сцене или на складе. Зелёная клетка —
                        можно, красная — нельзя.
                      </p>
                    )}
                    <div className="inventory-strip">
                      {g.layout.concat(g.stored).map((item) => (
                        <button
                          className={selected === item.id ? "selected" : ""}
                          key={item.id}
                          onClick={() => {
                            setSelected(item.id);
                            setDraft({ ...item });
                          }}
                        >
                          <Art id={item.type} />
                          <small>
                            {g.stored.some((i) => i.id === item.id)
                              ? "На складе"
                              : "В зале"}
                          </small>
                        </button>
                      ))}
                    </div>
                    <details>
                      <summary>
                        Сохранённые схемы · {plus ? "5" : "1"} слот
                      </summary>
                      <div className="layout-slots">
                        {Array.from({ length: 5 }, (_, i) => (
                          <div key={i}>
                            <span>
                              {g.layouts[i]?.name || `Схема ${i + 1}`}
                              {i > 0 && !plus ? " · Plus" : ""}
                            </span>
                            <button
                              disabled={disabled || (i > 0 && !plus)}
                              onClick={() =>
                                g.layouts[i]
                                  ? confirm(
                                      "Заменить сохранённую схему?",
                                      <p>
                                        Сохраним текущую расстановку вместо «
                                        {g.layouts[i].name}». Мебель останется
                                        твоей.
                                      </p>,
                                      () =>
                                        act({
                                          type: "saveLayout",
                                          slot: i,
                                          name: "Расстановка " + (i + 1),
                                        }),
                                    )
                                  : act({
                                      type: "saveLayout",
                                      slot: i,
                                      name: "Расстановка " + (i + 1),
                                    })
                              }
                            >
                              Сохранить
                            </button>
                            <button
                              disabled={
                                disabled || !g.layouts[i] || (i > 0 && !plus)
                              }
                              onClick={() =>
                                act({ type: "loadLayout", slot: i })
                              }
                            >
                              Загрузить
                            </button>
                          </div>
                        ))}
                      </div>
                    </details>
                  </section>
                )}
                {g.tutorial < 6 ? (
                  <section className="tutorial panel">
                    <div className="mentor-heading">
                      <Art id="amina" portrait />
                      <div>
                        <span className="eyebrow">АМИНА · ТВОЯ НАСТАВНИЦА</span>
                        <h2>{tutorialText[g.tutorial]?.[0]}</h2>
                      </div>
                      <span className="step-counter">{g.tutorial + 1} / 6</span>
                    </div>
                    <p>{tutorialText[g.tutorial]?.[1]}</p>
                    {g.tutorial === 0 && (
                      <label className="name-input">
                        <span>Название кофейни</span>
                        <input
                          value={name}
                          minLength={2}
                          maxLength={28}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Точка тепла"
                        />
                        <div className="name-options">
                          {["Точка тепла", "После дождя", "Между строк"].map(
                            (n) => (
                              <button key={n} onClick={() => setName(n)}>
                                {n}
                              </button>
                            ),
                          )}
                        </div>
                      </label>
                    )}
                    <div className="button-row">
                      {g.tutorial === 4 ? (
                        <>
                          <button
                            className="button"
                            disabled={disabled}
                            onClick={() =>
                              act({ type: "tutorial", step: 4, gift: "decor" })
                            }
                          >
                            <Icon name="leaf" size={18} /> Зелёный уголок
                          </button>
                          <button
                            className="button secondary"
                            disabled={disabled}
                            onClick={() =>
                              act({
                                type: "tutorial",
                                step: 4,
                                gift: "lighting",
                              })
                            }
                          >
                            Тёплый свет
                          </button>
                        </>
                      ) : (
                        <button
                          className="button"
                          disabled={disabled || name.trim().length < 2}
                          onClick={async () => {
                            if (g.tutorial === 3) {
                              sound("coffee", g.settings.sound);
                            }
                            await act({
                              type: "tutorial",
                              step: g.tutorial,
                              ...(g.tutorial === 0 ? { name } : {}),
                            });
                          }}
                        >
                          {
                            [
                              "Это моя кофейня",
                              "Установить кофемашину",
                              "Встретить гостя",
                              "Приготовить эспрессо",
                              "Выбрать подарок",
                              "Начать свою историю",
                            ][g.tutorial]
                          }{" "}
                          <Icon name="arrow" size={18} />
                        </button>
                      )}
                      <button
                        className="text-button"
                        disabled={disabled}
                        onClick={() =>
                          confirm(
                            "Уже умеешь варить кофе?",
                            <p>
                              Пропустим объяснения. Кофемашина, команда, запасы
                              и подарок сохранятся бесплатно.
                            </p>,
                            () => act({ type: "skipTutorial", name }),
                          )
                        }
                      >
                        Пропустить подсказки
                      </button>
                    </div>
                    <div className="step-dots">
                      {Array.from({ length: 6 }, (_, i) => (
                        <i className={i <= g.tutorial ? "done" : ""} key={i} />
                      ))}
                    </div>
                  </section>
                ) : shift ? (
                  <section className="panel shift-panel">
                    <div className="section-title">
                      <div>
                        <span className="eyebrow">
                          СМЕНА #{g.shifts.length}
                        </span>
                        <h2>Кофейня в своём ритме</h2>
                      </div>
                      <span className="time-pill">
                        <Icon name="clock" size={19} />
                        {Math.floor(remaining / 60)}:
                        {String(remaining % 60).padStart(2, "0")}
                      </span>
                    </div>
                    <div className="progress">
                      <i style={{ width: `${100 - remaining / 3}%` }} />
                    </div>
                    <p className="muted small">
                      Можно закрыть приложение. Завершим эту смену и сохраним
                      отчёт. Следующую начнёшь ты.
                    </p>
                    <div className="shift-metrics">
                      <span>
                        Подано{" "}
                        <b>
                          {
                            shift.guests.filter(
                              (a) =>
                                a.served && shift.start + a.finish < serverTime,
                            ).length
                          }{" "}
                          чашек
                        </b>
                      </span>
                      <span>
                        Цены{" "}
                        <b>
                          {
                            STRATEGIES.find((s) => s.id === shift.strategy)
                              ?.name
                          }
                        </b>
                      </span>
                    </div>
                    {remaining === 0 && (
                      <button className="button full" onClick={refresh}>
                        Получить сохранённый отчёт
                      </button>
                    )}
                    {remaining <= 240 && remaining > 60 && !shift.event && (
                      <div className="operation-event">
                        <Icon name="info" />
                        <div>
                          <b>У входа прохладно</b>
                          <p className="small">
                            Предложить гостям дополнительную заботу? 30 монет
                            сейчас, +10 к выручке каждого будущего заказа. Уже
                            сделанные заказы не меняются.
                          </p>
                          <div className="button-row">
                            <button
                              className="button small-button"
                              disabled={disabled}
                              onClick={() =>
                                act({ type: "shiftDecision", choice: "care" })
                              }
                            >
                              Позаботиться · 30
                            </button>
                            <button
                              className="text-button"
                              disabled={disabled}
                              onClick={() =>
                                act({
                                  type: "shiftDecision",
                                  choice: "neutral",
                                })
                              }
                            >
                              Обычный сервис
                            </button>
                          </div>
                          <small className="muted">
                            Если уйти, продолжим обычный сервис без штрафа.
                          </small>
                        </div>
                      </div>
                    )}
                  </section>
                ) : (
                  <section className="panel prep-panel">
                    <div className="section-title">
                      <div>
                        <span className="eyebrow">НОВАЯ СМЕНА · 5 МИНУТ</span>
                        <h2>Что сегодня в меню?</h2>
                      </div>
                      <span className="tag">Всё начинается с чашки</span>
                    </div>
                    <div className="menu-options">
                      {MENU.map((m) => (
                        <button
                          className={menu.includes(m.id) ? "selected" : ""}
                          key={m.id}
                          onClick={() =>
                            setMenu((old: string[]) =>
                              old.includes(m.id)
                                ? old.length > 1
                                  ? old.filter((id) => id !== m.id)
                                  : old
                                : [...old, m.id],
                            )
                          }
                        >
                          <span className="checkbox">
                            {menu.includes(m.id) && (
                              <Icon name="check" size={12} />
                            )}
                          </span>
                          {m.name}
                          <small>{m.price} м.</small>
                        </button>
                      ))}
                    </div>
                    <div className="prep-columns">
                      <label>
                        Ценовая стратегия
                        <select
                          value={strategy}
                          onChange={(e) => setStrategy(e.target.value as any)}
                        >
                          {STRATEGIES.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                        <small>
                          {
                            STRATEGIES.find((s) => s.id === strategy)
                              ?.description
                          }
                        </small>
                      </label>
                      <label>
                        Маленькое решение
                        <select
                          value={prep}
                          onChange={(e) => setPrep(e.target.value as any)}
                        >
                          <option value="welcome">
                            Встретить соседей · +3 желающих
                          </option>
                          <option value="practice">
                            Репетиция · +2 гостя к скорости
                          </option>
                          <option value="tidy">
                            Навести уют · настроение +3
                          </option>
                        </select>
                        <small>Бесплатно · действует на эту смену</small>
                      </label>
                    </div>
                    <div className="forecast">
                      <Icon name="info" size={18} />
                      <span>
                        Ожидаем{" "}
                        <b>
                          {Math.max(
                            8,
                            Math.floor(
                              (18 +
                                g.reputation * 0.22 +
                                g.stats.attraction +
                                Math.floor(g.stats.comfort / 4) -
                                4 +
                                (prep === "welcome" ? 3 : 0)) *
                                STRATEGIES.find((s) => s.id === strategy)!
                                  .demand,
                            ),
                          )}
                          –
                          {Math.floor(
                            (18 +
                              g.reputation * 0.22 +
                              g.stats.attraction +
                              Math.floor(g.stats.comfort / 4) +
                              4 +
                              (prep === "welcome" ? 3 : 0)) *
                              STRATEGIES.find((s) => s.id === strategy)!.demand,
                          )}
                        </b>{" "}
                        гостей. Команда обслужит до{" "}
                        <b>
                          {g.stats.capacity + (prep === "practice" ? 2 : 0)}
                        </b>
                        . Запасы и свободные места тоже влияют.
                      </span>
                    </div>
                    <div className="launch-row">
                      <span>
                        <b>
                          {g.employees.filter((e) => e.assigned).length} в
                          команде
                        </b>
                        <small>
                          Зарплата {g.stats.wages} · аренда{" "}
                          {[60, 95, 130][g.stage - 1]} / смена
                        </small>
                      </span>
                      <button
                        className="button"
                        disabled={disabled || edit}
                        onClick={() =>
                          act({ type: "startShift", menu, strategy, prep })
                        }
                      >
                        Открыть кофейню <Icon name="arrow" size={19} />
                      </button>
                    </div>
                    {g.canRecover && (
                      <div className="recovery">
                        <b>Начнём спокойно</b>
                        <p>
                          Бесплатная смена: базовая машина, 8 порций эспрессо,
                          без аренды и зарплаты. Доступно, когда средств или
                          запасов для обычной смены недостаточно.
                        </p>
                        <button
                          className="button secondary"
                          disabled={disabled}
                          onClick={() =>
                            act({
                              type: "startShift",
                              menu: ["espresso"],
                              strategy: "balanced",
                              prep: "welcome",
                              recovery: true,
                            })
                          }
                        >
                          Восстановить кофейню
                        </button>
                      </div>
                    )}
                  </section>
                )}
              </section>
              <aside className="right-column">
                <section className="goal-card">
                  <span className="eyebrow">
                    <Icon name="spark" size={15} /> ТВОЯ БЛИЖАЙШАЯ ЦЕЛЬ
                  </span>
                  <h3>
                    {g.tutorial < 6
                      ? "Первая чашка — начало истории"
                      : g.shifts.filter((s) => s.finalized).length < 1
                        ? "Первая настоящая смена"
                        : g.stage === 1
                          ? "Стать любимым местом района"
                          : g.stage === 2
                            ? "Найти свой авторский стиль"
                            : "Сохранить тепло своего места"}
                  </h3>
                  <p>
                    {g.tutorial < 6
                      ? "Познакомься с кофейней вместе с Аминой."
                      : g.stage === 1
                        ? "Набери 250 опыта. Новая глава изменит кофейню и откроет истории соседей."
                        : g.stage === 2
                          ? "Набери 900 опыта, чтобы начать третью главу."
                          : "Знакомься с гостями, развивай команду и пробуй новое."}
                  </p>
                  <div className="progress">
                    <i
                      style={{
                        width: `${g.tutorial < 6 ? (g.tutorial / 6) * 100 : g.stage === 1 ? Math.min(100, (g.xp / 250) * 100) : g.stage === 2 ? ((g.xp - 250) / 650) * 100 : 100}%`,
                      }}
                    />
                  </div>
                  <div className="goal-footer">
                    <span>
                      {g.tutorial < 6
                        ? `${g.tutorial} из 6 шагов`
                        : `${g.xp} / ${g.stage === 1 ? 250 : g.stage === 2 ? 900 : g.xp} опыта`}
                    </span>
                    <Icon name="leaf" size={19} />
                  </div>
                </section>
                <section className="panel stock-card">
                  <div className="section-title">
                    <h3>На нашей кухне</h3>
                    <Icon name="box" size={19} />
                  </div>
                  {(
                    [
                      ["beans", "Кофейные зёрна", 120],
                      ["milk", "Молоко", 150],
                      ["flour", "Для выпечки", 100],
                    ] as const
                  ).map(([k, l, max]) => (
                    <div className="stock" key={k}>
                      <div>
                        <span>{l}</span>
                        <b>
                          {g.inventory[k]} <small>порц.</small>
                        </b>
                      </div>
                      <div className="stock-track">
                        <i
                          style={{
                            width: `${Math.min(100, (g.inventory[k] / max) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  <button
                    className="button secondary full"
                    disabled={disabled || !!shift}
                    onClick={() =>
                      confirm(
                        "Пополнить запасы?",
                        <p>
                          {money(stockCost)} монет: {restock.beans} порций
                          зёрен, {restock.milk} молока, {restock.flour} для
                          выпечки. Покупка пополняет запас; ингредиенты не
                          списываются за дни отсутствия.
                        </p>,
                        () => act({ type: "restock" }),
                      )
                    }
                  >
                    Закупить · {money(stockCost)} <Icon name="coin" size={16} />
                  </button>
                </section>
                {lastReport && (
                  <button
                    className="report-short panel"
                    onClick={() => openReport()}
                  >
                    <span className="report-icon">
                      <Icon name="grow" />
                    </span>
                    <div>
                      <small>Последняя смена</small>
                      <b
                        className={
                          (lastReport.report?.profit || 0) < 0 ? "negative" : ""
                        }
                      >
                        {(lastReport.report?.profit || 0) > 0 ? "+" : ""}
                        {money(lastReport.report?.profit || 0)} монет
                      </b>
                      <small>
                        {lastReport.report?.served} гостей · посмотреть отчёт
                      </small>
                    </div>
                    <Icon name="arrow" size={20} />
                  </button>
                )}
                {storyEvent && (
                  <section className="story-teaser">
                    <div className="teaser-art">
                      <img src="/art/cafe-story.png" alt="Кофейня и её гости" />
                      <span>НОВАЯ ИСТОРИЯ</span>
                    </div>
                    <div>
                      <span className="eyebrow">{storyEvent.category}</span>
                      <h3>{storyEvent.title}</h3>
                      <p>{storyEvent.intro}</p>
                      <button
                        className="text-button"
                        disabled={g.tutorial < 6}
                        onClick={() => openStory(storyEvent.id)}
                      >
                        Узнать историю <Icon name="arrow" size={17} />
                      </button>
                    </div>
                  </section>
                )}
                <div className="quiet-note">
                  <Icon name="leaf" size={19} />
                  <p>
                    Кофейня умеет ждать.
                    <br />
                    Никаких расходов за дни, когда тебя нет.
                  </p>
                </div>
              </aside>
            </div>
          )}
          {tab === "grow" && (
            <>
              <div className="tabs">
                <button
                  className={growTab === "upgrades" ? "active" : ""}
                  onClick={() => setGrowTab("upgrades")}
                >
                  Улучшения <span>12</span>
                </button>
                <button
                  className={growTab === "team" ? "active" : ""}
                  onClick={() => setGrowTab("team")}
                >
                  Наша команда <span>{g.employees.length}</span>
                </button>
                <button
                  className={growTab === "chapters" ? "active" : ""}
                  onClick={() => setGrowTab("chapters")}
                >
                  Новые главы
                </button>
              </div>
              {!!shift && (
                <p className="info-banner">
                  Во время смены команда работает. Покупки и перестановки станут
                  доступны после её завершения.
                </p>
              )}
              {growTab === "upgrades" && (
                <div className="upgrade-grid">
                  {UPGRADES.map((u) => {
                    const owned = g.upgrades.includes(u.id),
                      locked = g.level < u.level;
                    return (
                      <article
                        className={
                          "upgrade-card panel " + (owned ? "owned" : "")
                        }
                        key={u.id}
                      >
                        <div className="upgrade-art">
                          <Art id={u.type} />
                          {owned ? (
                            <span className="owned-tag">
                              <Icon name="check" size={14} /> Уже в кофейне
                            </span>
                          ) : locked ? (
                            <span className="tag">С уровня {u.level}</span>
                          ) : null}
                        </div>
                        <div className="card-body">
                          <span className="eyebrow">
                            ДЛЯ{" "}
                            {[
                              "machine",
                              "grinder",
                              "fridge",
                              "display",
                              "counter",
                            ].includes(u.id)
                              ? "ВКУСНОГО КОФЕ"
                              : "БОЛЬШЕГО УЮТА"}
                          </span>
                          <h3>{u.name}</h3>
                          <p>{u.effect}</p>
                          <small>{u.visual}</small>
                          <button
                            className={
                              "button full " + (owned ? "secondary" : "")
                            }
                            disabled={disabled || owned || locked || !!shift}
                            onClick={() =>
                              confirm(
                                u.name,
                                <>
                                  <div className="item-intro">
                                    <Art id={u.type} />
                                    <div>
                                      <b>{money(u.price)} монет</b>
                                      <p>{u.effect}</p>
                                      <small>{u.visual}</small>
                                    </div>
                                  </div>
                                  <p className="small muted">
                                    Улучшение постоянно. Мебель появится на
                                    складе оформления; остальные предметы сразу
                                    изменят сцену.
                                  </p>
                                </>,
                                () => act({ type: "upgrade", id: u.id }),
                              )
                            }
                          >
                            {owned ? (
                              "Радует гостей"
                            ) : locked ? (
                              "Откроется позже"
                            ) : (
                              <>
                                {money(u.price)} <Icon name="coin" size={17} />
                              </>
                            )}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
              {growTab === "team" && (
                <>
                  <p className="muted">
                    Три рабочих места. Назначенные сотрудники получают зарплату
                    только за начатую смену.
                  </p>
                  <div className="employee-grid">
                    {EMPLOYEES.map((e) => {
                      const hired = g.employees.find((x) => x.id === e.id);
                      return (
                        <button
                          className="employee-card panel"
                          disabled={busy}
                          key={e.id}
                          onClick={() => teamCard(e.id)}
                        >
                          <Art id={e.id} portrait />
                          <div>
                            <span className="eyebrow">{e.role}</span>
                            <h3>{e.name}</h3>
                            <p>{e.trait}</p>
                            <small>
                              Скорость {e.speed} · Внимание {e.care}
                            </small>
                            <span
                              className={
                                "tag " + (hired?.assigned ? "green" : "")
                              }
                            >
                              {hired
                                ? hired.assigned
                                  ? "На смене"
                                  : "В команде"
                                : `Найм ${money(e.hire)}`}
                            </span>
                          </div>
                          <Icon name="arrow" size={18} />
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              {growTab === "chapters" && (
                <div className="chapter-grid">
                  {[
                    [
                      "Маленькая кофейня",
                      "Первые чашки, первая команда и знакомство с Давроном.",
                      0,
                    ],
                    [
                      "Место для соседей",
                      "Новая палитра зала, больше историй и подготовка к фестивалю.",
                      250,
                    ],
                    [
                      "Авторская кофейня",
                      "Своя вывеска, узнаваемый стиль и события любимого района.",
                      900,
                    ],
                  ].map(([title, text, xp], i) => (
                    <article className="panel chapter-card" key={i}>
                      <img
                        src="/art/cafe-story.png"
                        alt="Кофейня"
                        style={{
                          filter:
                            i === 1
                              ? "sepia(.15)"
                              : i === 2
                                ? "hue-rotate(15deg)"
                                : "none",
                        }}
                      />
                      <div>
                        <span className="eyebrow">
                          ГЛАВА {i + 1} · {Number(xp)} ОПЫТА
                        </span>
                        <h2>{title}</h2>
                        <p>{text}</p>
                        <span className="tag">
                          {g.stage > i ? "Открыто" : "Впереди"}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
          {tab === "story" && (
            <>
              <div className="tabs">
                {[
                  ["stories", "Истории"],
                  ["journal", "Журнал кофейни"],
                  ["guests", "Знакомые лица"],
                  ["achievements", "Достижения"],
                ].map(([id, label]) => (
                  <button
                    className={historyTab === id ? "active" : ""}
                    key={id}
                    onClick={() => setHistoryTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {historyTab === "stories" && (
                <>
                  <div className="chain-row">
                    {[
                      ["regular", "Место у окна", "История Даврона"],
                      ["timur", "Свой первый рецепт", "История Тимура"],
                      ["festival", "Улица за одним столом", "Фестиваль района"],
                    ].map(([id, title, sub]) => (
                      <div className="chain-card" key={id}>
                        <Icon
                          name={
                            id === "regular"
                              ? "story"
                              : id === "timur"
                                ? "cafe"
                                : "leaf"
                          }
                          size={28}
                        />
                        <b>{title}</b>
                        <span>{sub}</span>
                        <div className="step-dots">
                          {[1, 2, 3].map((n) => (
                            <i
                              className={
                                g.stories.some((s) => s.eventId === id + n)
                                  ? "done"
                                  : ""
                              }
                              key={n}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <h2 className="section-header">
                    Сегодня можно познакомиться
                  </h2>
                  <div className="story-grid">
                    {g.storyVariants.map((e) => (
                      <button
                        className="panel event-card"
                        key={e.id}
                        disabled={g.tutorial < 6}
                        onClick={() => openStory(e.id)}
                      >
                        <Art id={e.character} portrait />
                        <div>
                          <span className="eyebrow">{e.category}</span>
                          <h3>{e.title}</h3>
                          <p>{e.intro}</p>
                          <span className="text-link">
                            Открыть историю <Icon name="arrow" size={16} />
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                  <p className="small muted">
                    {g.stories.length} из 30 историй сохранено. Новые появляются
                    после смен и предыдущих эпизодов. Все основные истории
                    доступны без ИИ и покупок.
                  </p>
                </>
              )}
              {historyTab === "journal" && (
                <div className="journal">
                  {g.journal
                    .slice()
                    .reverse()
                    .map((j, i) => (
                      <article className="panel journal-entry" key={i}>
                        <span className="journal-dot" />
                        <time>{date(j.at)}</time>
                        <p>{j.text}</p>
                      </article>
                    ))}
                </div>
              )}
              {historyTab === "guests" && (
                <div className="guest-collection">
                  <article className="panel regular-card">
                    <Art id="regular" portrait />
                    <div>
                      <span className="eyebrow">
                        {g.achievements.includes("regular")
                          ? "ПОСТОЯННЫЙ ГОСТЬ"
                          : "НАЧАЛО ЗНАКОМСТВА"}
                      </span>
                      <h2>Даврон</h2>
                      <p>Любит эспрессо, книги и место у окна.</p>
                      <div className="step-dots">
                        {[1, 2, 3].map((n) => (
                          <i
                            className={
                              g.stories.some((s) => s.eventId === "regular" + n)
                                ? "done"
                                : ""
                            }
                            key={n}
                          />
                        ))}
                      </div>
                      <small>Знакомство → любимый заказ → книжный уголок</small>
                    </div>
                  </article>
                  {CHARACTERS.map((c) => (
                    <article className="panel regular-card" key={c.id}>
                      <Art id={c.id} portrait />
                      <div>
                        <span className="eyebrow">{c.role}</span>
                        <h2>{c.name}</h2>
                        <p>{c.bio}</p>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              {historyTab === "achievements" && (
                <div className="achievement-grid">
                  {ACHIEVEMENTS.map((a) => (
                    <article
                      className={
                        "panel achievement " +
                        (g.achievements.includes(a.id) ? "unlocked" : "")
                      }
                      key={a.id}
                    >
                      <Icon
                        name={a.id === "regular" ? "profile" : "star"}
                        size={30}
                      />
                      <h3>{a.name}</h3>
                      <p>{a.description}</p>
                      <span className="tag">
                        {g.achievements.includes(a.id)
                          ? "Получено"
                          : "Ещё впереди"}
                      </span>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
          {tab === "shop" && (
            <>
              {g.tutorial < 6 ? (
                <section className="panel empty-state">
                  <Art id="amina" portrait />
                  <h2>Сначала — первая чашка</h2>
                  <p>
                    Магазин откроется после знакомства с кофейней. Всё
                    необходимое для начала уже у тебя есть.
                  </p>
                  <button className="button" onClick={() => setTab("cafe")}>
                    Вернуться к Амине
                  </button>
                </section>
              ) : (
                <>
                  <div className="shop-hero">
                    <div>
                      <span className="eyebrow">МЕСТО, ПОХОЖЕЕ НА ТЕБЯ</span>
                      <h2>Уют бывает разным.</h2>
                      <p>
                        Примерь новое настроение кофейни.
                        <br />
                        Решать — всегда тебе.
                      </p>
                    </div>
                    <div className="shop-hero-art">
                      <Art id="plant" />
                      <Art id="vase" />
                      <Art id="lamp" />
                    </div>
                  </div>
                  <div className="shop-grid">
                    {PRODUCTS.map((p) => {
                      const owned = g.entitlements.some(
                        (e) => e.productId === p.id && !e.revoked,
                      );
                      return (
                        <article
                          className={"panel product-card product-" + p.id}
                          key={p.id}
                        >
                          <div className="product-art">
                            <Art id={"product-" + p.id} />
                            {owned && (
                              <span className="owned-tag">
                                <Icon name="check" size={14} />
                                {p.id === "plus"
                                  ? plus
                                    ? "Активен"
                                    : "Истёк"
                                  : "Твой набор"}
                              </span>
                            )}
                            {p.id === "founder" && !owned && (
                              <span className="tag">Первая глава</span>
                            )}
                          </div>
                          <div className="card-body">
                            <span className="eyebrow">
                              {p.duration
                                ? "30 ДНЕЙ · БЕЗ АВТОСПИСАНИЯ"
                                : p.id === "support"
                                  ? "ПОДДЕРЖКА ПРОЕКТА"
                                  : "НАВСЕГДА В ТВОЕЙ КОЛЛЕКЦИИ"}
                            </span>
                            <h2>{p.name}</h2>
                            <p>{p.description}</p>
                            <ul className="contents">
                              {p.items.map((i) => (
                                <li key={i}>
                                  <Icon name="check" size={14} />
                                  {i}
                                </li>
                              ))}
                            </ul>
                            <div className="product-actions">
                              {owned && p.skin ? (
                                <button
                                  className="button secondary"
                                  disabled={disabled}
                                  onClick={() => {
                                    setPreview(p.skin);
                                    setTab("cafe");
                                  }}
                                >
                                  Примерить
                                </button>
                              ) : (
                                <button
                                  className="button"
                                  disabled={disabled}
                                  onClick={() => openShopProduct(p.id)}
                                >
                                  {p.price} <Icon name="star" size={18} />
                                  {owned && p.id === "plus" ? " Продлить" : ""}
                                </button>
                              )}
                              <button
                                className="text-button"
                                onClick={() => openShopProduct(p.id)}
                              >
                                Подробнее <Icon name="arrow" size={16} />
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  <p className="shop-terms">
                    Игровые деньги не выводятся. Plus не продлевается
                    автоматически; сохранённые схемы остаются после окончания.{" "}
                    <button className="text-button" onClick={openSupport}>
                      Поддержка по платежам
                    </button>
                  </p>
                </>
              )}
            </>
          )}
          {tab === "profile" && (
            <>
              <section className="profile-card panel">
                <div
                  className={
                    "avatar " +
                    (g.entitlements.some(
                      (e) => e.productId === "founder" && !e.revoked,
                    )
                      ? "founder"
                      : "")
                  }
                >
                  <Art id="logo" />
                </div>
                <div>
                  <span className="eyebrow">ОСНОВАТЕЛЬ КОФЕЙНИ</span>
                  <h2>{g.name}</h2>
                  <p>
                    Уровень {g.level} · {g.xp} опыта ·{" "}
                    {g.shifts.filter((s) => s.finalized).length} смен
                  </p>
                  <div className="tags">
                    {g.entitlements
                      .filter((e) => !e.revoked && e.productId !== "plus")
                      .map((e) => (
                        <span className="tag" key={e.id}>
                          {PRODUCTS.find((p) => p.id === e.productId)?.name}
                        </span>
                      ))}
                    {plus && (
                      <span className="tag green">
                        Plus до {date(g.plusUntil)}
                      </span>
                    )}
                  </div>
                </div>
              </section>
              <div className="profile-grid">
                <section className="panel settings-panel">
                  <h2>В твоём ритме</h2>
                  <p className="muted small">
                    Звук включается только после твоего действия.
                  </p>
                  {(
                    [
                      [
                        "music",
                        "Атмосфера кофейни",
                        "Тихий оригинальный звуковой фон",
                      ],
                      [
                        "sound",
                        "Звуки действий",
                        "Кофе, подтверждения и конец смены",
                      ],
                      ["haptics", "Вибрация", "Мягкий отклик Telegram"],
                      [
                        "reducedMotion",
                        "Меньше движения",
                        "Спокойные анимации",
                      ],
                      [
                        "eveningLight",
                        "Вечерний свет · Plus",
                        "Меняй время суток по настроению",
                      ],
                      [
                        "lowQuality",
                        "Бережный режим",
                        "30 кадров, простые тени",
                      ],
                      [
                        "notifications",
                        "Сообщение о конце смены",
                        "Одно уведомление в боте, только с твоего согласия",
                      ],
                    ] as const
                  ).map(([key, label, desc]) => (
                    <label className="setting-row" key={key}>
                      <span>
                        <b>{label}</b>
                        <small>{desc}</small>
                      </span>
                      <input
                        type="checkbox"
                        role="switch"
                        checked={
                          !!g.settings[key] && (key !== "eveningLight" || plus)
                        }
                        disabled={disabled || (key === "eveningLight" && !plus)}
                        onChange={(e) =>
                          act({
                            type: "settings",
                            settings: { [key]: e.target.checked },
                          })
                        }
                      />
                    </label>
                  ))}
                </section>
                <section className="panel">
                  <h2>История финансов</h2>
                  {lastReport ? (
                    <>
                      <div className="report-compact">
                        <span>Всего выручки</span>
                        <b>
                          {money(
                            g.shifts.reduce(
                              (n, s) => n + (s.report?.revenue || 0),
                              0,
                            ),
                          )}
                        </b>
                      </div>
                      {plus && (
                        <div
                          className="finance-bars"
                          aria-label="Прибыль по сменам"
                        >
                          {g.shifts
                            .filter((s) => s.finalized)
                            .slice(-12)
                            .map((s, i) => (
                              <div
                                key={s.id}
                                title={`Смена ${i + 1}: ${s.report!.profit}`}
                                style={{
                                  height: Math.max(
                                    10,
                                    Math.min(
                                      130,
                                      Math.abs(s.report!.profit) / 20,
                                    ),
                                  ),
                                  background:
                                    s.report!.profit < 0
                                      ? "#bd735c"
                                      : "#5b9785",
                                }}
                              >
                                <small>{s.report!.profit}</small>
                              </div>
                            ))}
                        </div>
                      )}
                      <div className="detail-rows">
                        {g.shifts
                          .filter((s) => s.finalized)
                          .slice()
                          .reverse()
                          .map((s, i) => (
                            <button
                              className="finance-row"
                              key={s.id}
                              onClick={() => openReport(s)}
                            >
                              <span>
                                {date(s.end)}
                                <small>{s.report!.served} гостей</small>
                              </span>
                              <b>
                                {money(s.report!.profit)}{" "}
                                <Icon name="arrow" size={16} />
                              </b>
                            </button>
                          ))}
                      </div>
                      {!plus && (
                        <p className="small muted">
                          Все точные данные бесплатны. Plus добавляет только
                          график.
                        </p>
                      )}
                      <button
                        className="button secondary full"
                        disabled={disabled}
                        onClick={async () => {
                          try {
                            const r = await api("mentor", {});
                            setSheet({
                              title: "Амина · посмотрим вместе",
                              body: (
                                <div className="mentor-line">
                                  <Art id="amina" portrait />
                                  <div>
                                    <p>{r.text}</p>
                                    <small>
                                      {r.source === "ai"
                                        ? "Объяснение ИИ по итогам смены"
                                        : "Совет по фактическим данным · без ИИ"}
                                    </small>
                                  </div>
                                </div>
                              ),
                            });
                          } catch (e) {
                            setNotice((e as Error).message);
                          }
                        }}
                      >
                        Совет Амины
                      </button>
                    </>
                  ) : (
                    <div className="empty-inline">
                      <Icon name="story" size={32} />
                      <p>
                        Первая смена — первая строчка в истории. Все отчёты
                        сохранятся здесь.
                      </p>
                    </div>
                  )}
                </section>
                <section className="panel purchases">
                  <h2>Покупки и права</h2>
                  {g.orders.length === 0 ? (
                    <p className="muted">
                      Здесь будет история покупок. Чтобы играть, покупать ничего
                      не нужно.
                    </p>
                  ) : (
                    g.orders
                      .slice()
                      .reverse()
                      .map((o) => (
                        <div className="purchase-row" key={o.id}>
                          <Art id={"product-" + o.productId} />
                          <div>
                            <b>{o.title}</b>
                            <small>
                              {o.demo ? "Демо · " : ""}
                              {o.price} Stars · {date(o.createdAt)}
                            </small>
                            <small>{o.id}</small>
                            <span className="tag">
                              {
                                {
                                  pending: "Ожидает оплаты",
                                  paid: "Получено",
                                  refunded: "Возвращено",
                                  refund_pending: "Возврат на проверке",
                                  cancelled: "Отменено",
                                }[o.status]
                              }
                            </span>
                          </div>
                          {o.status === "pending" && (
                            <button
                              className="text-button"
                              onClick={() => purchase(o.productId)}
                            >
                              Продолжить
                            </button>
                          )}
                        </div>
                      ))
                  )}
                  <button className="text-button" onClick={refresh}>
                    Обновить статус покупок
                  </button>
                  <p className="small muted">
                    При закрытии приложения статус восстановится с сервера.
                    Клиентское окно не выдаёт товар.
                  </p>
                </section>
                <section className="panel">
                  <h2>Помощь и правила</h2>
                  <p>
                    Есть вопрос о кофейне или Stars? Напиши команде. Обращение
                    сохраняется в кабинете поддержки.
                  </p>
                  <button
                    className="button secondary full"
                    onClick={openSupport}
                  >
                    Написать в поддержку
                  </button>
                  <a
                    className="terms-link"
                    href="/terms"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Условия игры и данные <Icon name="arrow" size={16} />
                  </a>
                  {admin && (
                    <button
                      className="button secondary full"
                      onClick={openAdmin}
                    >
                      <Icon name="shield" size={18} /> Кабинет команды
                    </button>
                  )}
                  <p className="small muted">
                    IdeaLab · Игровые монеты нельзя вывести. Никаких штрафов за
                    отсутствие.
                  </p>
                </section>
              </div>
              {admin && adminData && (
                <section className="panel admin-panel">
                  <div className="section-title">
                    <h2>Кабинет команды</h2>
                    <button className="text-button" onClick={openAdmin}>
                      Обновить
                    </button>
                  </div>
                  <div className="admin-metrics">
                    {Object.entries(adminData.analytics).map(([k, v]) => (
                      <div key={k}>
                        <b>{String(v)}</b>
                        <small>{k}</small>
                      </div>
                    ))}
                    <div>
                      <b>{adminData.returningPlayers}</b>
                      <small>Вернулись через сутки</small>
                    </div>
                    <div>
                      <b>{adminData.lossShifts}</b>
                      <small>Убыточных смен</small>
                    </div>
                  </div>
                  {adminData.users.map((u: any) => (
                    <details key={u.id}>
                      <summary>
                        {u.name} · {u.id} · {money(u.balance)} монет
                      </summary>
                      <div className="admin-user">
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const data = new FormData(e.currentTarget);
                            const body = {
                              userId: u.id,
                              amount: Number(data.get("amount")),
                              reason: String(data.get("reason")),
                              operationId: operationId(),
                            };
                            confirm(
                              "Корректировка баланса",
                              <p>
                                {body.amount} монет. Причина: {body.reason}
                              </p>,
                              async () => {
                                try {
                                  await api("admin/balance", body);
                                  await openAdmin();
                                } catch (err) {
                                  setNotice((err as Error).message);
                                }
                              },
                            );
                          }}
                        >
                          <label>
                            Изменить баланс
                            <input
                              name="amount"
                              type="number"
                              min="-100000"
                              max="100000"
                              required
                            />
                          </label>
                          <label>
                            Причина
                            <input name="reason" required minLength={5} />
                          </label>
                          <button className="button secondary">
                            Подготовить корректировку
                          </button>
                        </form>
                        <h3>Валютный журнал</h3>
                        <div className="detail-rows">
                          {u.ledger.map((l: any) => (
                            <div key={l.id}>
                              <span>{l.reason}</span>
                              <b>
                                {l.amount} → {l.balance}
                              </b>
                            </div>
                          ))}
                        </div>
                        <h3>Заказы и платежи</h3>
                        {u.orders.map((o: any) => (
                          <div className="admin-order" key={o.id}>
                            <span>
                              {o.id}
                              <small>
                                {o.productId} · {o.price} XTR · {o.status}
                                <br />
                                {o.chargeId}
                              </small>
                            </span>
                            {["paid", "refund_pending"].includes(o.status) && (
                              <button
                                className="button secondary"
                                onClick={() =>
                                  setSheet({
                                    title: "Возврат платежа",
                                    body: (
                                      <form
                                        onSubmit={async (e) => {
                                          e.preventDefault();
                                          const reason = String(
                                            new FormData(e.currentTarget).get(
                                              "reason",
                                            ),
                                          );
                                          setSheet(null);
                                          try {
                                            await api("admin/refund", {
                                              userId: u.id,
                                              orderId: o.id,
                                              reason,
                                            });
                                            await openAdmin();
                                          } catch (err) {
                                            setNotice((err as Error).message);
                                          }
                                        }}
                                      >
                                        <p>
                                          Возврат отзовёт права только этого
                                          заказа. Реальные Stars возвращаются
                                          через Telegram API.
                                        </p>
                                        <input
                                          name="reason"
                                          minLength={5}
                                          required
                                          placeholder="Причина возврата"
                                        />
                                        <button className="button full">
                                          Подтвердить возврат
                                        </button>
                                      </form>
                                    ),
                                  })
                                }
                              >
                                Возврат
                              </button>
                            )}
                          </div>
                        ))}
                        <h3>Источники прав</h3>
                        {u.entitlements.map((e: any) => (
                          <p className="small" key={e.id}>
                            {e.productId} ← {e.source} ·{" "}
                            {e.revoked ? "Отозвано" : "Сохранено"}
                          </p>
                        ))}
                        <h3>Поддержка</h3>
                        {u.supportTickets.map((t: any) => (
                          <div className="ticket" key={t.id}>
                            <small>
                              {date(t.at)} · {t.id}
                            </small>
                            <p>{t.text}</p>
                            <form
                              onSubmit={async (e) => {
                                e.preventDefault();
                                const text = String(
                                  new FormData(e.currentTarget).get("reply"),
                                );
                                try {
                                  await api("admin/reply", {
                                    userId: u.id,
                                    ticketId: t.id,
                                    text,
                                  });
                                  setNotice(
                                    "Ответ отправлен и записан в аудит.",
                                  );
                                } catch (err) {
                                  setNotice((err as Error).message);
                                }
                              }}
                            >
                              <input
                                name="reply"
                                minLength={5}
                                required
                                placeholder="Ответ игроку"
                              />
                              <button className="button secondary">
                                Отправить
                              </button>
                            </form>
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
                  <details>
                    <summary>Каталог · текущая конфигурация</summary>
                    <div className="detail-rows">
                      {adminData.catalog.map((p: any) => (
                        <div key={p.id}>
                          <span>{p.name}</span>
                          <b>{p.price} XTR</b>
                        </div>
                      ))}
                    </div>
                    <p className="small muted">
                      Цены изменяются в shared/content.ts и применяются только к
                      новым счетам.
                    </p>
                  </details>
                  <details>
                    <summary>Аудит административных действий</summary>
                    {adminData.audit.map((a: any) => (
                      <p key={a.id} className="small">
                        {date(a.at)} · {a.adminId} → {a.targetId} · {a.action}:{" "}
                        {a.reason}
                      </p>
                    ))}
                  </details>
                </section>
              )}
            </>
          )}
        </main>
        <footer className="desktop-footer">
          <span>Сделано для маленьких радостей и больших идей.</span>
          <span>
            <Icon name="leaf" size={14} /> Игра в твоём темпе
          </span>
        </footer>
      </div>
      <nav className="bottom-nav" aria-label="Основная навигация">
        {nav.map(([id, label]) => (
          <button
            className={tab === id ? "active" : ""}
            onClick={() => changeTab(id)}
            key={id}
          >
            <span>
              <Icon name={id} />
              {id === "story" && eventIds.length > 0 && <i />}
            </span>
            <small>{label}</small>
          </button>
        ))}
      </nav>
      {sheet && (
        <Modal title={sheet.title} onClose={() => setSheet(null)}>
          {sheet.body}
        </Modal>
      )}
      {notice && (
        <div className="toast" role="status">
          <Icon name="info" size={20} />
          <span>{notice}</span>
          <button
            aria-label="Закрыть уведомление"
            onClick={() => setNotice("")}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const dialog = ref.current!;
    const first = dialog.querySelector<HTMLElement>(
      "button,input,select,textarea,a",
    );
    first?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = [
        ...dialog.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select,textarea,a",
        ),
      ];
      if (!list.length) return;
      if (e.shiftKey && document.activeElement === list[0]) {
        e.preventDefault();
        list.at(-1)?.focus();
      } else if (!e.shiftKey && document.activeElement === list.at(-1)) {
        e.preventDefault();
        list[0].focus();
      }
    };
    dialog.addEventListener("keydown", trap);
    document.body.style.overflow = "hidden";
    return () => {
      dialog.removeEventListener("keydown", trap);
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, [title]);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="modal"
      >
        <div className="modal-handle" />
        <header>
          <h2 id="modal-title">{title}</h2>
          <button aria-label="Закрыть панель" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
