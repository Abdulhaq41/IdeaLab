import type { publicGame } from "../../server/game";
import type { Action } from "../../shared/schemas";
export type State = ReturnType<typeof publicGame>;
export interface TelegramApp {
  initData: string;
  ready: () => void;
  expand: () => void;
  close: () => void;
  openInvoice?: (url: string, cb: (status: string) => void) => void;
  BackButton: {
    show: () => void;
    hide: () => void;
    onClick: (fn: () => void) => void;
    offClick: (fn: () => void) => void;
  };
  HapticFeedback?: { impactOccurred: (kind: string) => void };
  setHeaderColor?: (color: string) => void;
  onEvent?: (name: string, fn: () => void) => void;
  offEvent?: (name: string, fn: () => void) => void;
}
declare global {
  interface Window {
    Telegram?: { WebApp: TelegramApp };
  }
}
export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const r = await fetch("/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  let data;
  try {
    data = await r.json();
  } catch {
    throw new Error(
      "Сервер недоступен. Последнее сохранение остаётся у тебя на экране.",
    );
  }
  if (!r.ok) throw new Error(data.error || "Действие не выполнено.");
  return data;
}
export const operationId = () => crypto.randomUUID();
export async function mutate(action: Action, key: string = operationId()) {
  return api<{ state: State }>("action", { action, operationId: key });
}

export async function loadTelegramSDK() {
  if (window.Telegram?.WebApp) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.async = true;
    const timer = setTimeout(
      () => reject(new Error("Telegram не ответил. Открой Mini App заново.")),
      6000,
    );
    script.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Не удалось загрузить Telegram SDK. Проверь сеть."));
    };
    document.head.appendChild(script);
  });
}
