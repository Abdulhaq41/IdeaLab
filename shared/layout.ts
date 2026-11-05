import type { Furniture } from "./types";
export const ROOM = { w: 9, h: 8, door: { x: 4, y: 7 }, work: { x: 2, y: 2 } };
export const SIZES: Record<
  string,
  { w: number; h: number; walkable: boolean }
> = {
  machine: { w: 2, h: 1, walkable: false },
  counter: { w: 2, h: 1, walkable: false },
  table: { w: 1, h: 1, walkable: false },
  chair: { w: 1, h: 1, walkable: false },
  plant: { w: 1, h: 1, walkable: false },
  lamp: { w: 1, h: 1, walkable: true },
  moon: { w: 1, h: 1, walkable: false },
  vase: { w: 1, h: 1, walkable: false },
  statue: { w: 1, h: 1, walkable: false },
};
export function furniture(
  id: string,
  type: string,
  x: number,
  y: number,
  rotation: 0 | 1 = 0,
): Furniture {
  const s = SIZES[type];
  if (!s) throw new Error("Неизвестный предмет");
  return {
    id,
    type,
    x,
    y,
    w: rotation ? s.h : s.w,
    h: rotation ? s.w : s.h,
    walkable: s.walkable,
    rotation,
    interactions: [{ x: ["machine", "counter"].includes(type) ? 1 : 0, y: 1 }],
  };
}
export function initialLayout() {
  return [
    furniture("counter", "counter", 1, 1),
    furniture("table-a", "table", 5, 2),
    furniture("chair-a", "chair", 6, 2),
    furniture("table-b", "table", 6, 5),
    furniture("chair-b", "chair", 7, 5),
    furniture("plant-a", "plant", 0, 5),
    furniture("plant-b", "plant", 7, 0),
  ];
}
export function workPoint(items: Furniture[]) {
  const m = items.find((i) => i.type === "machine" || i.type === "counter");
  return m
    ? { x: m.x + m.interactions[0].x, y: m.y + m.interactions[0].y }
    : ROOM.work;
}
export function blockedCells(items: Furniture[]) {
  const b = new Set<string>();
  for (const a of items)
    if (!a.walkable)
      for (let x = a.x; x < a.x + a.w; x++)
        for (let y = a.y; y < a.y + a.h; y++) b.add(`${x},${y}`);
  return b;
}
export function pathfind(
  from: { x: number; y: number },
  to: { x: number; y: number },
  items: Furniture[],
  width = ROOM.w,
  height = ROOM.h,
) {
  const b = blockedCells(items),
    queue = [from],
    seen = new Map<string, { x: number; y: number } | null>([
      [`${from.x},${from.y}`, null],
    ]);
  for (let i = 0; i < queue.length; i++) {
    const a = queue[i];
    if (a.x === to.x && a.y === to.y) {
      const p = [a];
      let prev = seen.get(`${a.x},${a.y}`);
      while (prev) {
        p.unshift(prev);
        prev = seen.get(`${prev.x},${prev.y}`);
      }
      return p;
    }
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ]) {
      const n = { x: a.x + dx, y: a.y + dy },
        k = `${n.x},${n.y}`;
      if (
        n.x >= 0 &&
        n.y >= 0 &&
        n.x < width &&
        n.y < height &&
        !b.has(k) &&
        !seen.has(k)
      ) {
        seen.set(k, a);
        queue.push(n);
      }
    }
  }
  return [];
}
export function validateLayout(items: Furniture[]) {
  const occupied = new Set<string>();
  for (const a of items) {
    const spec = SIZES[a.type];
    if (
      !spec ||
      !Number.isInteger(a.x) ||
      !Number.isInteger(a.y) ||
      ![0, 1].includes(a.rotation)
    )
      return "Неверный предмет";
    const w = a.rotation ? spec.h : spec.w,
      h = a.rotation ? spec.w : spec.h;
    if (a.w !== w || a.h !== h || a.walkable !== spec.walkable)
      return "Размер предмета не совпадает";
    if (a.x < 0 || a.y < 0 || a.x + w > ROOM.w || a.y + h > ROOM.h)
      return "За стеной нет места";
    for (let x = a.x; x < a.x + w; x++)
      for (let y = a.y; y < a.y + h; y++) {
        const key = `${x},${y}`;
        if (
          (x === ROOM.door.x && y === ROOM.door.y) ||
          (x === workPoint(items).x && y === workPoint(items).y)
        )
          return "Оставь вход и рабочую точку свободными";
        if (occupied.has(key)) return "Здесь уже стоит другой предмет";
        occupied.add(key);
      }
  }
  if (!pathfind(ROOM.door, workPoint(items), items).length)
    return "Не перекрывай путь от входа к кофемашине";
  for (const a of items.filter((x) => x.type === "table")) {
    const neighbours = [
      { x: a.x + 1, y: a.y },
      { x: a.x - 1, y: a.y },
      { x: a.x, y: a.y + 1 },
      { x: a.x, y: a.y - 1 },
    ];
    if (!neighbours.some((n) => pathfind(ROOM.door, n, items).length))
      return "К каждому столику нужен проход";
  }
  return null;
}
