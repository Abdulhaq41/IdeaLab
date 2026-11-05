import { useEffect, useRef, useState } from "react";
import {
  Application,
  Container,
  Graphics,
  Sprite,
  Assets,
  Text,
  Texture,
  Rectangle,
} from "pixi.js";
import {
  pathfind,
  ROOM,
  validateLayout,
  furniture,
  workPoint,
} from "../../shared/layout";
import { CUSTOMERS } from "../../shared/content";
import type { Furniture, CustomerKind } from "../../shared/types";
import type { State } from "./api";
export type Selection = { kind: "item" | "guest" | "employee"; id: string };
interface Props {
  game: State;
  edit: boolean;
  selected: string | null;
  draft: Furniture | null;
  skin: string;
  onSelect: (s: Selection) => void;
  onCell: (x: number, y: number) => void;
  onTeam: () => void;
}
const iso = (x: number, y: number) => ({ x: (x - y) * 36, y: (x + y) * 18 });
const names = [
  "machine",
  "counter",
  "table",
  "chair",
  "plant",
  "lamp",
  "moon",
  "vase",
  "statue",
  "grinder",
  "fridge",
  "display",
  "speaker",
  "books",
  "sign",
  "timur",
  "lola",
  "kamol",
  "sara",
  "aziz",
  "vera",
  "amina",
  "rustam",
  ...Object.keys(CUSTOMERS),
];
export function Scene(p: Props) {
  const mount = useRef<HTMLDivElement>(null),
    camera = useRef({ x: 0, y: 0, zoom: 1 }),
    props = useRef(p);
  props.current = p;
  const [error, setError] = useState(false),
    [zoom, setZoom] = useState(1);
  const zoomFn = useRef<(n: number) => void>(() => {});
  useEffect(() => {
    let dead = false,
      app: Application | undefined;
    const host = mount.current!;
    let resize: ResizeObserver | undefined;
    const events: () => void = () => {};
    const setup = async () => {
      try {
        app = new Application();
        await app.init({
          backgroundAlpha: 0,
          resizeTo: host,
          antialias: !p.game.settings.lowQuality,
          resolution: Math.min(devicePixelRatio, 2),
          autoDensity: true,
          preference: "webgl",
        });
        if (dead) {
          app.destroy(true);
          return;
        }
        host.appendChild(app.canvas);
        app.canvas.setAttribute(
          "aria-label",
          "Изометрическая кофейня. Предметы и команда доступны также кнопками под сценой.",
        );
        const textures = new Map<string, any>();
        await Promise.all(
          names.map(async (n) => {
            try {
              textures.set(n, await Assets.load(`/art/${n}.svg`));
            } catch {}
          }),
        );
        if (dead) return;
        try {
          const atlas = await Assets.load("/art/characters-atlas.png");
          for (const [i, n] of [
            "timur",
            "lola",
            "kamol",
            "sara",
            "aziz",
            "vera",
            "amina",
            "rustam",
          ].entries())
            textures.set(
              n,
              new Texture({
                source: atlas.source,
                frame: new Rectangle(
                  (i % 4) * 384,
                  Math.floor(i / 4) * 512,
                  384,
                  512,
                ),
              }),
            );
        } catch {}
        try {
          const atlas = await Assets.load("/art/objects-atlas.png");
          for (const [i, n] of [
            "machine",
            "counter",
            "table",
            "chair",
            "plant",
            "lamp",
            "moon",
            "vase",
          ].entries())
            textures.set(
              n,
              new Texture({
                source: atlas.source,
                frame: new Rectangle(
                  (i % 4) * 384,
                  Math.floor(i / 4) * 512,
                  384,
                  512,
                ),
              }),
            );
        } catch {}
        if (dead) return;
        const root = new Container();
        app.stage.addChild(root);
        const world = new Container();
        root.addChild(world);
        const evening =
          p.game.settings.eveningLight && p.game.plusUntil > Date.now();
        if (evening) world.tint = 0xc6d1dd;
        const floor = new Graphics();
        world.addChild(floor);
        const palette =
          p.skin === "neon"
            ? {
                wall: 0x617b83,
                side: 0x496a73,
                floor: 0xb3bba8,
                tile: 0x9caa9e,
              }
            : p.skin === "loft"
              ? {
                  wall: 0xd6a287,
                  side: 0xbe8c75,
                  floor: 0xcaa77d,
                  tile: 0xbda07c,
                }
              : p.skin === "founder"
                ? {
                    wall: 0xabb18d,
                    side: 0x919f7e,
                    floor: 0xdfcaa3,
                    tile: 0xc4b591,
                  }
                : {
                    wall: 0xece0cb,
                    side: 0xd6c7b0,
                    floor: 0xe4cba4,
                    tile: 0xd5b991,
                  };
        const polygon = (points: number[], fill: number, stroke?: number) => {
          const g = new Graphics().poly(points).fill(fill);
          if (stroke) g.stroke({ width: 1, color: stroke });
          return g;
        };
        // Raised floor and two cutaway walls share one 2:1 projection.
        floor.ellipse(30, 225, 330, 112).fill({ color: 0x706653, alpha: 0.12 });
        world.addChild(
          polygon(
            [-288, 144, 36, 306, 324, 162, 324, 178, 36, 322, -288, 160],
            0xc6ad88,
          ),
        );
        world.addChild(
          polygon([0, 0, 324, 162, 324, 30, 0, -132], palette.wall),
        );
        world.addChild(
          polygon([0, 0, -288, 144, -288, 12, 0, -132], palette.side),
        );
        for (let y = 0; y < 8; y++)
          for (let x = 0; x < 9; x++) {
            const a = iso(x, y);
            floor
              .poly([
                a.x,
                a.y,
                a.x + 36,
                a.y + 18,
                a.x,
                a.y + 36,
                a.x - 36,
                a.y + 18,
              ])
              .fill((x + y) % 2 ? palette.floor : palette.tile)
              .stroke({ width: 0.65, color: 0xf2dfbd, alpha: 0.55 });
          }
        // Ensure floor is in front of wall bottoms, behind all furniture.
        world.setChildIndex(floor, world.children.length - 1);
        const trim = new Graphics()
          .moveTo(-288, 145)
          .lineTo(0, 1)
          .lineTo(324, 163)
          .stroke({ width: 5, color: 0x9c8061 });
        world.addChild(trim);
        const window = new Graphics();
        window
          .poly([76, -76, 254, 13, 254, 91, 76, 2])
          .fill(0xb2c9ba)
          .stroke({ width: 7, color: 0xfaf0d9 });
        window.poly([84, -62, 246, 19, 246, 79, 84, -2]).fill(0xd4ded0);
        window.poly([84, -10, 246, 65, 246, 80, 84, -1]).fill(0x9ba98a);
        window
          .moveTo(165, -30)
          .lineTo(165, 44)
          .moveTo(81, -27)
          .lineTo(249, 57)
          .stroke({ width: 4, color: 0xfaf0d9 });
        window
          .poly([92, -54, 107, -46, 228, 77, 205, 65])
          .fill({ color: 0xffffff, alpha: 0.2 });
        world.addChild(window);
        // Plants outside, simple silhouettes behind the window.
        const view = new Graphics();
        for (const [x, y] of [
          [115, -14],
          [218, 35],
        ]) {
          view
            .moveTo(x, y + 20)
            .lineTo(x, y - 5)
            .stroke({ width: 3, color: 0x7a8a6e });
          view.ellipse(x, y - 4, 14, 19).fill({ color: 0x88a289, alpha: 0.7 });
        }
        world.addChild(view);
        if (p.skin !== "original") {
          const c =
            p.skin === "neon"
              ? 0x70b9ad
              : p.skin === "loft"
                ? 0xb9764e
                : 0x8b9c6c;
          const sign = new Graphics()
            .circle(285, 74, 20)
            .fill(c)
            .stroke({ width: 3, color: 0xeee1bd });
          sign
            .roundRect(274, 68, 18, 12, 3)
            .fill(0xf6ebcc)
            .moveTo(280, 63)
            .lineTo(280, 66)
            .stroke({ width: 2, color: 0xf6ebcc });
          world.addChild(sign);
        }
        const board = new Graphics()
          .poly([-213, 3, -123, -42, -123, 15, -213, 60])
          .fill(0x355e56)
          .stroke({ width: 4, color: 0xba9062 });
        for (let i = 0; i < 3; i++)
          board
            .moveTo(-198, 10 + i * 12)
            .lineTo(-138, -20 + i * 12)
            .stroke({ width: 2, color: 0xcad7ba, alpha: 0.6 });
        world.addChild(board);
        const shelf = new Graphics()
          .poly([-85, -57, -10, -95, -10, -87, -85, -49])
          .fill(0x8a6a4d)
          .stroke({ width: 1, color: 0x6a503b });
        world.addChild(shelf);
        for (let i = 0; i < 4; i++)
          world.addChild(
            new Graphics()
              .roundRect(-75 + i * 16, -69 - i * 8, 9, 13, 2)
              .fill([0xd6a378, 0x769286, 0xdbc69b, 0xba7964][i]),
          );
        const rug = new Graphics()
          .poly([18, 130, 112, 177, 40, 213, -54, 166])
          .fill({ color: p.skin === "neon" ? 0x537f7d : 0xbe7860, alpha: 0.4 })
          .stroke({ width: 2, color: 0xf3dcac, alpha: 0.5 });
        world.addChild(rug);
        const light = new Graphics()
          .poly([90, 3, 220, 65, 138, 243, -50, 151])
          .fill({
            color: 0xfff4c8,
            alpha: evening ? 0.3 : p.game.settings.lowQuality ? 0.08 : 0.16,
          });
        world.addChild(light);
        const grid = new Graphics();
        if (p.edit) {
          for (let y = 0; y < 8; y++)
            for (let x = 0; x < 9; x++) {
              const a = iso(x, y);
              grid
                .poly([
                  a.x,
                  a.y,
                  a.x + 36,
                  a.y + 18,
                  a.x,
                  a.y + 36,
                  a.x - 36,
                  a.y + 18,
                ])
                .stroke({ width: 1, color: 0x4f8b72, alpha: 0.65 });
            }
          grid.eventMode = "static";
          grid.on("pointertap", (e) => {
            if (dragged) return;
            const q = world.toLocal(e.global);
            const x = Math.floor((q.x / 36 + q.y / 18) / 2),
              y = Math.floor((q.y / 18 - q.x / 36) / 2);
            if (x >= 0 && y >= 0 && x < 9 && y < 8) props.current.onCell(x, y);
          });
          world.addChild(grid);
        }
        const door = iso(ROOM.door.x + 0.5, ROOM.door.y + 0.65);
        world.addChild(
          new Graphics()
            .poly([
              door.x - 20,
              door.y - 9,
              door.x,
              door.y + 2,
              door.x + 20,
              door.y - 9,
              door.x,
              door.y - 20,
            ])
            .fill(0x839582),
        );
        if (p.game.stage >= 2) {
          const garland = new Graphics()
            .moveTo(-270, 1)
            .quadraticCurveTo(-150, -15, -30, -116)
            .stroke({ width: 2, color: 0x78906c });
          for (let i = 0; i < 9; i++)
            garland.circle(-265 + i * 27, -2 - i * 9, 3).fill(0xffdf98);
          world.addChild(garland);
        }
        if (p.game.stage >= 3) {
          const wallart = new Graphics()
            .poly([-250, 17, -220, 2, -220, 32, -250, 47])
            .fill(0xd2a482)
            .stroke({ color: 0x775d45, width: 3 });
          wallart.circle(-236, 24, 6).fill(0xe8ce9d);
          world.addChild(wallart);
        }
        const objects = new Container();
        objects.sortableChildren = true;
        world.addChild(objects);
        function sprite(name: string, height: number) {
          const t = textures.get(name);
          if (t) {
            const s = new Sprite(t);
            s.anchor.set(0.5, 1);
            s.height = height;
            s.scale.x = s.scale.y;
            return s;
          }
          return new Graphics().roundRect(-15, -40, 30, 40, 6).fill(0xa98566);
        }
        const layout = p.draft
          ? [...p.game.layout.filter((i) => i.id !== p.draft!.id), p.draft]
          : p.game.layout;
        if (p.draft) {
          const d = p.draft,
            valid = !validateLayout(layout);
          const halo = new Graphics();
          for (let x = d.x; x < d.x + d.w; x++)
            for (let y = d.y; y < d.y + d.h; y++) {
              const a = iso(x, y);
              halo
                .poly([
                  a.x,
                  a.y,
                  a.x + 36,
                  a.y + 18,
                  a.x,
                  a.y + 36,
                  a.x - 36,
                  a.y + 18,
                ])
                .fill({ color: valid ? 0x4b9e7d : 0xd0654e, alpha: 0.55 });
            }
          world.addChildAt(halo, world.getChildIndex(objects));
        }
        for (const item of layout) {
          const spot = iso(item.x + item.w / 2, item.y + item.h / 2),
            node = new Container();
          node.position.set(spot.x, spot.y + 13);
          node.zIndex = (item.x + item.y + item.w / 2 + item.h / 2) * 100;
          const s = sprite(
            item.type,
            item.type === "machine" || item.type === "counter"
              ? 148
              : item.type === "plant"
                ? 139
                : 103,
          );
          if (item.rotation) s.scale.x = -Math.abs(s.scale.x);
          node.addChild(s);
          if (item.type === "machine" && p.game.upgrades.includes("machine")) {
            const upgrade = new Graphics()
              .roundRect(-26, -70, 49, 17, 4)
              .fill(0xbed2bd)
              .stroke({ width: 1, color: 0x668d77 });
            upgrade
              .circle(-14, -62, 3)
              .fill(0xf7eac8)
              .circle(10, -62, 3)
              .fill(0xf7eac8);
            node.addChild(upgrade);
          }
          node.eventMode = "static";
          node.cursor = "pointer";
          node.on("pointertap", () => {
            if (!dragged) props.current.onSelect({ kind: "item", id: item.id });
          });
          if (p.selected === item.id) {
            const outline = new Graphics()
              .ellipse(0, -4, item.w * 29, 14)
              .stroke({ width: 3, color: 0x357f71 });
            node.addChildAt(outline, 0);
          }
          objects.addChild(node);
        }
        // Improvements on the counter and wall have their own visible sprites.
        for (const [id, x, y] of [
          ["grinder", 3, 1],
          ["display", 4, 1],
          ["fridge", 0.6, 2.5],
          ["training", 0.4, 1],
          ["acoustic", 0.5, 4],
          ["sign", 8, 1],
        ] as [string, number, number][]) {
          if (!p.game.upgrades.includes(id)) continue;
          const type =
            { training: "books", acoustic: "speaker", lighting: "lamp" }[id] ||
            id;
          const node = sprite(type, id === "lighting" ? 130 : 72);
          const spot = iso(x, y);
          node.position.set(spot.x, spot.y);
          node.zIndex = (x + y) * 100 + 1;
          node.eventMode = "static";
          node.cursor = "pointer";
          node.on("pointertap", () => {
            if (!dragged)
              props.current.onSelect({ kind: "item", id: "catalog:" + id });
          });
          objects.addChild(node);
        }
        const shift = p.game.shifts.find((s) => !s.finalized),
          actors: {
            node: Container;
            guest?: any;
            path: { x: number; y: number }[];
            seatPath: { x: number; y: number }[];
            exitPath: { x: number; y: number }[];
            offset: number;
            name: string;
          }[] = [];
        function actor(name: string, guest?: any, offset = 0) {
          const node = new Container(),
            shadow = new Graphics()
              .ellipse(0, -3, 16, 7)
              .fill({ color: 0x394238, alpha: 0.16 }),
            person = sprite(name, 85);
          node.addChild(shadow, person, new Graphics());
          node.eventMode = "static";
          node.cursor = "pointer";
          node.on("pointertap", () => {
            if (!dragged)
              props.current.onSelect({
                kind: guest ? "guest" : "employee",
                id: guest ? String(guest.id) : name,
              });
          });
          objects.addChild(node);
          const wp = workPoint(p.game.layout);
          const candidates = [
            { x: wp.x, y: wp.y + 1 },
            { x: wp.x + 1, y: wp.y },
            { x: wp.x - 1, y: wp.y },
            wp,
          ];
          const target = guest
            ? candidates.find(
                (to) => pathfind(ROOM.door, to, p.game.layout).length,
              ) || wp
            : wp;
          const path = pathfind(ROOM.door, target, p.game.layout);
          const pickup = path.at(-1) || target;
          let seatPath = [pickup];
          if (guest?.served && guest.seat >= 0) {
            const tables = p.game.layout.filter((i) => i.type === "table"),
              table =
                tables[Math.floor(guest.seat / 2) % Math.max(1, tables.length)];
            if (table) {
              const routes = [
                { x: table.x, y: table.y + 1 },
                { x: table.x - 1, y: table.y },
                { x: table.x + 1, y: table.y },
                { x: table.x, y: table.y - 1 },
              ]
                .map((to) => pathfind(pickup, to, p.game.layout))
                .filter((p) => p.length);
              seatPath = routes[
                (guest.seat % 2) % Math.max(1, routes.length)
              ] || [pickup];
            }
          }
          const exit = pathfind(seatPath.at(-1)!, ROOM.door, p.game.layout);
          actors.push({
            node,
            guest,
            path: path.length ? path : [ROOM.door],
            seatPath,
            exitPath: exit.length ? exit : [ROOM.door],
            offset,
            name,
          });
        }
        p.game.employees
          .filter((e) => e.assigned)
          .slice(0, 3)
          .forEach((e, i) => actor(e.id, undefined, i));
        if (shift) shift.guests.forEach((guest) => actor(guest.kind, guest));
        else if (
          p.game.tutorial >= 2 &&
          (p.game.tutorial <= 3 ||
            Date.now() -
              (p.game.ledger.find((l) => l.id === "tutorial:coffee")?.at || 0) <
              45000)
        )
          actor(
            "regular",
            {
              id: 0,
              kind: "regular",
              arrival: 0,
              finish: 26000,
              served: true,
              seat: 0,
            },
            0,
          );
        const steam = new Graphics();
        objects.addChild(steam);
        steam.zIndex = 700;
        const offset = p.game.serverNow - Date.now();
        app.ticker.maxFPS = p.game.settings.lowQuality ? 30 : 60;
        let slowFrames = 0,
          adapted = false;
        const osReduced = matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        app.ticker.add(() => {
          if (dead) return;
          const now = Date.now() + offset,
            t = now / 1000,
            reduced = p.game.settings.reducedMotion || osReduced,
            low = p.game.settings.lowQuality || adapted;
          slowFrames =
            app!.ticker.deltaMS > 40
              ? slowFrames + 1
              : Math.max(0, slowFrames - 1);
          if (slowFrames > 90 && !adapted) {
            adapted = true;
            app!.ticker.maxFPS = 30;
          }
          const coffeeAt = p.game.ledger.find(
            (l) => l.id === "tutorial:coffee",
          )?.at;
          const elapsed = shift
            ? now - shift.start
            : p.game.tutorial === 2
              ? Math.min(9000, now - p.game.lastSeen)
              : p.game.tutorial === 3
                ? Math.min(21000, 9000 + now - p.game.lastSeen)
                : 22000 + now - (coffeeAt || now);
          let visible = 0;
          for (const a of actors) {
            let pos: { x: number; y: number };
            if (!a.guest) {
              const wp = workPoint(p.game.layout),
                start = { x: wp.x + 0.15, y: wp.y + 0.15 + a.offset * 0.5 },
                target = { x: wp.x + 0.55, y: wp.y + 0.15 + a.offset * 0.5 };
              const v = reduced ? 0 : (Math.sin(t * 0.35 + a.offset) + 1) * 0.5;
              pos = iso(
                start.x + (target.x - start.x) * v,
                start.y + (target.y - start.y) * v,
              );
              a.node.visible = true;
            } else {
              const g = a.guest,
                age = elapsed - g.arrival;
              a.node.visible =
                age >= 0 &&
                age < (g.served ? g.finish - g.arrival + 43000 : 16000) &&
                visible < (low ? 5 : 10);
              if (!a.node.visible) continue;
              visible++;
              const reaction = a.node.children[2] as Graphics;
              reaction.clear();
              const servedAt = g.finish - g.arrival;
              if (
                g.served &&
                age >= servedAt &&
                age < servedAt + 2400 &&
                !reduced
              )
                reaction
                  .circle(15, -78 - (age - servedAt) / 180, 7)
                  .fill({ color: 0xeaf5da, alpha: 1 - (age - servedAt) / 2400 })
                  .moveTo(11, -78 - (age - servedAt) / 180)
                  .lineTo(14, -75 - (age - servedAt) / 180)
                  .lineTo(19, -81 - (age - servedAt) / 180)
                  .stroke({ color: 0x5b9a79, width: 2 });
              const pickupAt = g.finish - g.arrival;
              const walk = (
                path: { x: number; y: number }[],
                fraction: number,
              ) => {
                const q = Math.max(
                    0,
                    Math.min(path.length - 1, fraction * (path.length - 1)),
                  ),
                  i = Math.floor(q),
                  f = q - i,
                  from = path[i],
                  to = path[Math.min(path.length - 1, i + 1)];
                return {
                  x: from.x + (to.x - from.x) * f,
                  y: from.y + (to.y - from.y) * f,
                };
              };
              let point = walk(a.path, Math.min(1, age / 9000));
              if (!g.served && age >= 8000)
                point = walk(a.path, Math.max(0, (16000 - age) / 8000));
              if (g.served) {
                const seatPath = a.seatPath;
                if (age >= pickupAt + 5000 && age < pickupAt + 28000)
                  point = walk(seatPath, (age - pickupAt - 5000) / 9000);
                if (age >= pickupAt + 28000) {
                  const exit = a.exitPath;
                  point = walk(
                    exit.length ? exit : [ROOM.door],
                    (age - pickupAt - 28000) / 15000,
                  );
                }
              }
              const xx = point.x,
                yy = point.y;
              pos = iso(xx + 0.5, yy + 0.5);
            }
            a.node.position.set(
              pos.x,
              pos.y + 14 + (reduced ? 0 : Math.sin(t * 7 + a.offset) * 1.4),
            );
            a.node.children[1].rotation = reduced
              ? 0
              : Math.sin(t * 5 + a.offset) * 0.017;
            a.node.zIndex = (pos.y / 18) * 100 + 30;
          }
          steam.clear();
          const recentUpgrade = p.game.ledger.some(
            (l) => now - l.at < 1500 && l.reason.includes("Кофе"),
          );
          if (recentUpgrade && !reduced && !low)
            for (let i = 0; i < 6; i++)
              steam
                .circle(
                  Math.cos(t * 2 + i) * 45,
                  70 + Math.sin(t * 2 + i) * 20,
                  2,
                )
                .fill({ color: 0xffe8ac, alpha: 0.6 });
          if (shift || p.game.tutorial === 3)
            for (let i = 0; i < 3; i++) {
              const rise = (t * 0.45 + i * 0.3) % 1,
                spot = iso(1.8, 1.6);
              steam
                .ellipse(
                  spot.x + i * 6 - 7,
                  spot.y - 83 - rise * 22,
                  3 + rise * 4,
                  6 + rise * 5,
                )
                .fill({ color: 0xfff8e7, alpha: (1 - rise) * 0.5 });
            }
          if (p.game.upgrades.includes("lighting")) {
            const hour = new Date(now).getHours();
            world.alpha = hour >= 18 || hour < 7 ? 0.94 : 1;
          }
        });
        let pointers = new Map<number, { x: number; y: number }>(),
          dragged = false,
          origin = { x: 0, y: 0 },
          base = { x: 0, y: 0 },
          pinch = 0;
        const fit = () => {
          if (!app) return;
          const scale =
            Math.min(app.screen.width / 690, app.screen.height / 505) *
            camera.current.zoom;
          root.scale.set(scale);
          root.position.set(
            app.screen.width / 2 - 14 * scale + camera.current.x,
            app.screen.height * 0.36 + camera.current.y,
          );
        };
        zoomFn.current = (n) => {
          camera.current.zoom = Math.max(0.8, Math.min(1.65, n));
          setZoom(camera.current.zoom);
          fit();
        };
        const onDown = (e: PointerEvent) => {
          pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          dragged = false;
          origin = { x: e.clientX, y: e.clientY };
          base = { x: camera.current.x, y: camera.current.y };
          if (pointers.size === 2) {
            const a = [...pointers.values()];
            pinch = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
          }
          host.setPointerCapture?.(e.pointerId);
        };
        const onMove = (e: PointerEvent) => {
          if (!pointers.has(e.pointerId)) return;
          pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.size === 2) {
            const a = [...pointers.values()],
              d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
            if (pinch) zoomFn.current((camera.current.zoom * d) / pinch);
            pinch = d;
            dragged = true;
            return;
          }
          const dx = e.clientX - origin.x,
            dy = e.clientY - origin.y;
          if (Math.hypot(dx, dy) > 7) dragged = true;
          if (dragged) {
            camera.current.x = Math.max(-100, Math.min(100, base.x + dx));
            camera.current.y = Math.max(-65, Math.min(65, base.y + dy));
            fit();
          }
        };
        const onUp = (e: PointerEvent) => {
          pointers.delete(e.pointerId);
        };
        const onWheel = (e: WheelEvent) => {
          e.preventDefault();
          zoomFn.current(camera.current.zoom - e.deltaY * 0.001);
        };
        const visibility = () => {
          if (document.hidden) app?.stop();
          else app?.start();
        };
        host.addEventListener("pointerdown", onDown);
        host.addEventListener("pointermove", onMove);
        host.addEventListener("pointerup", onUp);
        host.addEventListener("pointercancel", onUp);
        host.addEventListener("wheel", onWheel, { passive: false });
        document.addEventListener("visibilitychange", visibility);
        resize = new ResizeObserver(fit);
        resize.observe(host);
        fit();
        cleanup = () => {
          host.removeEventListener("pointerdown", onDown);
          host.removeEventListener("pointermove", onMove);
          host.removeEventListener("pointerup", onUp);
          host.removeEventListener("pointercancel", onUp);
          host.removeEventListener("wheel", onWheel);
          document.removeEventListener("visibilitychange", visibility);
        };
      } catch (e) {
        console.error("Scene initialization failed", e);
        if (!dead) setError(true);
      }
    };
    let cleanup = () => {};
    void setup();
    return () => {
      dead = true;
      cleanup();
      resize?.disconnect();
      if (app?.renderer)
        app.destroy(true, {
          children: true,
          texture: false,
          textureSource: false,
        });
    };
  }, [
    p.game.version,
    p.game.settings.lowQuality,
    p.game.settings.reducedMotion,
    p.game.settings.eveningLight,
    p.game.plusUntil,
    p.edit,
    p.selected,
    p.draft?.x,
    p.draft?.y,
    p.draft?.rotation,
    p.skin,
    p.game.shifts.find((s) => !s.finalized)?.id,
  ]);
  return (
    <div
      className={
        "scene " +
        (p.edit ? "editing " : "") +
        (p.game.settings.eveningLight && p.game.plusUntil > Date.now()
          ? "night"
          : "")
      }
    >
      <div className="scene-sky" />
      <div ref={mount} className="canvas-host" />
      {error && (
        <div className="scene-fallback">
          <img src="/art/cafe-story.png" alt="Иллюстрация кофейни" />
          <span>
            Сцена недоступна. Управление кофейней работает кнопками ниже.
          </span>
        </div>
      )}
      <div className="scene-label">
        <span className="live-dot" />
        {p.edit
          ? "Оформляем пространство"
          : p.game.shifts.some((s) => !s.finalized)
            ? "Кофейня живёт"
            : "Тихое время до открытия"}
      </div>
      <div className="scene-controls">
        <button
          aria-label="Уменьшить сцену"
          onClick={() => zoomFn.current(zoom - 0.15)}
        >
          −
        </button>
        <button
          aria-label="Увеличить сцену"
          onClick={() => zoomFn.current(zoom + 0.15)}
        >
          +
        </button>
      </div>
      <span className="scene-hint">
        {p.edit
          ? "Выбери предмет → коснись клетки"
          : "Потяни, чтобы осмотреться"}
      </span>
    </div>
  );
}
