import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { Game } from "../shared/types";
import { EMPLOYEES, PRODUCTS } from "../shared/content";
import { createGame, GameError } from "./game";
export interface Audit {
  id: string;
  adminId: string;
  action: string;
  reason: string;
  targetId: string;
  at: number;
  payload: Record<string, unknown>;
}
export interface Store {
  run<T>(
    id: string,
    fn: (g: Game) => Promise<T> | T,
    audit?: Audit,
  ): Promise<T>;
  list(): Promise<Game[]>;
  audit(a: Audit): Promise<void>;
  audits(): Promise<Audit[]>;
  reserveAi(userId: string, cap: number, now: number): Promise<boolean>;
  close(): Promise<void>;
}
export class SQLiteStore implements Store {
  db: DatabaseSync;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(file = ".data/idealab.sqlite") {
    mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY,state TEXT NOT NULL); CREATE TABLE IF NOT EXISTS payments(charge TEXT PRIMARY KEY,owner TEXT NOT NULL,order_id TEXT UNIQUE NOT NULL); CREATE TABLE IF NOT EXISTS audits(id TEXT PRIMARY KEY,payload TEXT NOT NULL);",
    );
  }
  run<T>(
    id: string,
    fn: (g: Game) => Promise<T> | T,
    audit?: Audit,
  ): Promise<T> {
    const task = this.tail.then(async () => {
      this.db.exec("BEGIN IMMEDIATE");
      try {
        const row = this.db
          .prepare("SELECT state FROM games WHERE id=?")
          .get(id) as { state: string } | undefined;
        const g = row ? (JSON.parse(row.state) as Game) : createGame(id);
        const result = await fn(g);
        for (const o of g.orders.filter((o) => o.chargeId)) {
          const prior = this.db
            .prepare("SELECT owner,order_id FROM payments WHERE charge=?")
            .get(o.chargeId!) as
            | { owner: string; order_id: string }
            | undefined;
          if (prior && (prior.owner !== id || prior.order_id !== o.id))
            throw new GameError("Платёж уже использован.", 409);
          this.db
            .prepare(
              "INSERT OR IGNORE INTO payments(charge,owner,order_id) VALUES(?,?,?)",
            )
            .run(o.chargeId!, id, o.id);
        }
        this.db
          .prepare(
            "INSERT INTO games(id,state) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state",
          )
          .run(id, JSON.stringify(g));
        if (audit)
          this.db
            .prepare("INSERT OR IGNORE INTO audits(id,payload) VALUES(?,?)")
            .run(audit.id, JSON.stringify(audit));
        this.db.exec("COMMIT");
        return result;
      } catch (e) {
        this.db.exec("ROLLBACK");
        throw e;
      }
    });
    this.tail = task.catch(() => {});
    return task;
  }
  async list() {
    await this.tail;
    return (
      this.db.prepare("SELECT state FROM games").all() as { state: string }[]
    ).map((x) => JSON.parse(x.state) as Game);
  }
  async audit(a: Audit) {
    await this.tail;
    this.db
      .prepare("INSERT OR IGNORE INTO audits(id,payload) VALUES(?,?)")
      .run(a.id, JSON.stringify(a));
  }
  async audits() {
    await this.tail;
    return (
      this.db
        .prepare("SELECT payload FROM audits ORDER BY rowid DESC LIMIT 300")
        .all() as { payload: string }[]
    ).map((x) => JSON.parse(x.payload) as Audit);
  }
  async reserveAi(userId: string, cap: number, now: number) {
    const task = this.tail.then(() => {
      this.db.exec("BEGIN IMMEDIATE");
      try {
        const rows = this.db.prepare("SELECT payload FROM audits").all() as {
          payload: string;
        }[];
        const recent = rows
          .map((r) => JSON.parse(r.payload) as Audit)
          .filter((a) => a.action === "ai_request" && now - a.at < 86400000);
        if (
          recent.length >= cap ||
          recent.filter((a) => a.targetId === userId).length >= 3
        ) {
          this.db.exec("COMMIT");
          return false;
        }
        const a: Audit = {
          id: randomUUID(),
          adminId: "system",
          action: "ai_request",
          reason: "Optional explanation quota",
          targetId: userId,
          at: now,
          payload: {},
        };
        this.db
          .prepare("INSERT INTO audits(id,payload) VALUES(?,?)")
          .run(a.id, JSON.stringify(a));
        this.db.exec("COMMIT");
        return true;
      } catch (e) {
        this.db.exec("ROLLBACK");
        throw e;
      }
    });
    this.tail = task.catch(() => {});
    return task;
  }
  async close() {
    await this.tail;
    this.db.close();
  }
}
const json = (x: unknown) => JSON.parse(JSON.stringify(x));
export class PostgresStore implements Store {
  client: PrismaClient;
  constructor() {
    this.client = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
  }
  async run<T>(
    id: string,
    fn: (g: Game) => Promise<T> | T,
    audit?: Audit,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.client.$transaction(
          async (tx) => {
            // Transaction-scoped advisory lock also protects initial creation, before a row exists.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))`;
            await tx.user.upsert({ where: { id }, create: { id }, update: {} });
            const row = await tx.business.findUnique({ where: { userId: id } });
            const g = row ? (row.snapshot as unknown as Game) : createGame(id);
            const result = await fn(g);
            await tx.business.upsert({
              where: { userId: id },
              create: {
                id: `business:${id}`,
                userId: id,
                snapshot: json(g),
                version: g.version,
              },
              update: { snapshot: json(g), version: g.version },
            });
            for (const o of g.orders) {
              if (o.chargeId) {
                const old = await tx.payment.findUnique({
                  where: { chargeId: o.chargeId },
                });
                if (old && (old.userId !== id || old.orderId !== o.id))
                  throw new GameError("Платёж уже использован.", 409);
                await tx.payment.upsert({
                  where: { chargeId: o.chargeId },
                  create: {
                    chargeId: o.chargeId,
                    userId: id,
                    orderId: o.id,
                    amount: o.price,
                    payload: json(o),
                  },
                  update: { payload: json(o) },
                });
              }
              await tx.order.upsert({
                where: { id: o.id },
                create: {
                  id: o.id,
                  userId: id,
                  productId: o.productId,
                  amount: o.price,
                  status: o.status,
                  payload: json(o),
                },
                update: { status: o.status, payload: json(o) },
              });
            }
            for (const e of g.entitlements)
              await tx.entitlement.upsert({
                where: { id: e.id },
                create: {
                  id: e.id,
                  userId: id,
                  source: e.source,
                  productId: e.productId,
                  revoked: e.revoked,
                  payload: json(e),
                },
                update: { revoked: e.revoked, payload: json(e) },
              });
            for (const l of g.ledger)
              await tx.currencyLedger.upsert({
                where: { id: `${id}:${l.id}` },
                create: {
                  id: `${id}:${l.id}`,
                  userId: id,
                  amount: l.amount,
                  balance: l.balance,
                  reason: l.reason,
                  at: new Date(l.at),
                },
                update: {},
              });
            for (const s of g.shifts)
              await tx.shift.upsert({
                where: { id: s.id },
                create: {
                  id: s.id,
                  userId: id,
                  end: new Date(s.end),
                  finalized: s.finalized,
                  payload: json(s),
                },
                update: { finalized: s.finalized, payload: json(s) },
              });
            // The snapshot is the authoritative aggregate. These projections support administration and backups.
            const projections: [string, string, unknown][] = [
              ["inventory", id, g.inventory],
              ["storyProgress", id, g.stories],
              ["notificationPreference", id, g.settings],
              ...g.layout
                .concat(g.stored)
                .map(
                  (i) =>
                    ["furnitureInstance", `${id}:${i.id}`, i] as [
                      string,
                      string,
                      unknown,
                    ],
                ),
              ...g.employees.map(
                (e) =>
                  ["employment", `${id}:${e.id}`, e] as [
                    string,
                    string,
                    unknown,
                  ],
              ),
              ...g.layouts
                .filter(Boolean)
                .map(
                  (e) =>
                    ["businessLayout", `${id}:${e.id}`, e] as [
                      string,
                      string,
                      unknown,
                    ],
                ),
              ...g.stories.map(
                (e) =>
                  ["decision", `${id}:${e.eventId}`, e] as [
                    string,
                    string,
                    unknown,
                  ],
              ),
              ...g.achievements.map(
                (e) =>
                  ["achievement", `${id}:${e}`, { id: e }] as [
                    string,
                    string,
                    unknown,
                  ],
              ),
              ...g.shifts
                .filter((s) => s.event)
                .map(
                  (s) =>
                    ["shiftEvent", s.id, s.event] as [string, string, unknown],
                ),
            ];
            for (const [model, key, data] of projections)
              await (tx as any)[model].upsert({
                where: { id: key },
                create: { id: key, userId: id, payload: json(data) },
                update: { payload: json(data) },
              });
            if (audit)
              await tx.adminAuditLog.upsert({
                where: { id: audit.id },
                create: {
                  ...audit,
                  at: new Date(audit.at),
                  payload: json(audit.payload),
                },
                update: {},
              });
            return result;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            timeout: 20000,
          },
        );
      } catch (e) {
        if ((e as { code?: string }).code === "P2034" && attempt < 4) continue;
        throw e;
      }
    }
  }
  async list() {
    return (await this.client.business.findMany()).map(
      (x) => x.snapshot as unknown as Game,
    );
  }
  async audit(a: Audit) {
    await this.client.adminAuditLog.create({
      data: { ...a, at: new Date(a.at), payload: json(a.payload) },
    });
  }
  async audits() {
    return (
      await this.client.adminAuditLog.findMany({
        orderBy: { at: "desc" },
        take: 300,
      })
    ).map((x) => ({
      ...x,
      at: x.at.getTime(),
      payload: x.payload as Record<string, unknown>,
    }));
  }
  async seed() {
    for (const e of EMPLOYEES)
      await this.client.employee.upsert({
        where: { id: e.id },
        create: { id: e.id, payload: json(e) },
        update: { payload: json(e) },
      });
    for (const p of PRODUCTS)
      await this.client.product.upsert({
        where: { id: p.id },
        create: { id: p.id, payload: json(p) },
        update: { payload: json(p) },
      });
  }
  async reserveAi(userId: string, cap: number, now: number) {
    return this.client.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('idealab_ai_budget', 0))`;
        const where = {
          action: "ai_request",
          at: { gt: new Date(now - 86400000) },
        };
        const all = await tx.adminAuditLog.count({ where }),
          user = await tx.adminAuditLog.count({
            where: { ...where, targetId: userId },
          });
        if (all >= cap || user >= 3) return false;
        await tx.adminAuditLog.create({
          data: {
            id: randomUUID(),
            adminId: "system",
            action: "ai_request",
            reason: "Optional explanation quota",
            targetId: userId,
            at: new Date(now),
            payload: {},
          },
        });
        return true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }
  async close() {
    await this.client.$disconnect();
  }
}
