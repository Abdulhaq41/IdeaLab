import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { GameError, need } from "./game";
export function equal(a: string, b: string) {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function validateInitData(
  initData: string,
  token: string,
  now = Date.now(),
  maxAge = 3600,
) {
  need(
    initData.length > 0 && initData.length < 16000,
    "Открой игру через Telegram.",
    401,
  );
  const p = new URLSearchParams(initData);
  const hash = p.get("hash");
  need(
    hash && /^[a-f\d]{64}$/.test(hash),
    "Не удалось проверить Telegram.",
    401,
  );
  need(
    new Set([...p.keys()]).size === [...p.keys()].length,
    "Повтор полей авторизации.",
    401,
  );
  p.delete("hash");
  const check = [...p.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const expected = createHmac("sha256", secret).update(check).digest("hex");
  need(equal(hash, expected), "Подпись Telegram неверна.", 401);
  const at = Number(p.get("auth_date"));
  need(
    Number.isInteger(at) &&
      at <= Math.floor(now / 1000) + 30 &&
      now / 1000 - at <= maxAge,
    "Вход устарел. Открой игру заново.",
    401,
  );
  let user;
  try {
    user = JSON.parse(p.get("user") || "null");
  } catch {
    throw new GameError("Данные Telegram повреждены.", 401);
  }
  need(
    user && Number.isSafeInteger(user.id) && user.id > 0,
    "Пользователь Telegram не определён.",
    401,
  );
  return `tg:${user.id}`;
}
export function signSession(id: string, secret: string, now = Date.now()) {
  const data = Buffer.from(
    JSON.stringify({ id, exp: now + 12 * 3600000 }),
  ).toString("base64url");
  return `${data}.${createHmac("sha256", secret).update(data).digest("base64url")}`;
}
export function readSession(
  value: string | undefined,
  secret: string,
  now = Date.now(),
) {
  if (!value) return null;
  const [payload, sig, extra] = value.split(".");
  if (
    !payload ||
    !sig ||
    extra ||
    !equal(
      sig,
      createHmac("sha256", secret).update(payload).digest("base64url"),
    )
  )
    return null;
  try {
    const d = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof d.id === "string" && d.exp > now ? (d.id as string) : null;
  } catch {
    return null;
  }
}
export function demoId() {
  return `demo:${randomUUID()}`;
}
export function validateEnvironment(env: NodeJS.ProcessEnv) {
  if (env.AI_API_KEY && env.AI_ENDPOINT)
    need(
      /^https:\/\//.test(env.AI_ENDPOINT),
      "AI_ENDPOINT должен использовать HTTPS",
    );
  const production = env.NODE_ENV === "production";
  const demo = env.DEMO_MODE === "true";
  if (production && demo) throw new Error("DEMO_MODE запрещён в production.");
  if (!production && !demo && !env.BOT_TOKEN)
    throw new Error(
      "Укажите DEMO_MODE=true для локальной демонстрации или настройте Telegram.",
    );
  if (production)
    for (const k of [
      "BOT_TOKEN",
      "SESSION_SECRET",
      "WEBHOOK_SECRET",
      "DATABASE_URL",
      "PUBLIC_URL",
      "SUPPORT_URL",
    ])
      if (!env[k]) throw new Error(`Не задано ${k}`);
  if (production) {
    need(
      (env.WEBHOOK_SECRET || "").length >= 32 &&
        /^[A-Za-z0-9_-]+$/.test(env.WEBHOOK_SECRET || ""),
      "WEBHOOK_SECRET: минимум 32 символа A–Z, a–z, 0–9, _ или -",
    );
    need(
      (env.SESSION_SECRET || "").length >= 32,
      "SESSION_SECRET: минимум 32 символа",
    );
    need(
      /^https:\/\//.test(env.PUBLIC_URL || ""),
      "PUBLIC_URL должен использовать HTTPS",
    );
    need(
      /^https:\/\//.test(env.SUPPORT_URL || ""),
      "SUPPORT_URL должен использовать HTTPS",
    );
    need(!env.TELEGRAM_TEST, "Тестовый Telegram API запрещён в production");
  }
  return { production, demo };
}
