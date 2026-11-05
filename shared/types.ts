export type Ingredient = "beans" | "milk" | "flour";
export type Strategy = "friendly" | "balanced" | "premium";
export type CustomerKind =
  | "student"
  | "office"
  | "tourist"
  | "laptop"
  | "friends"
  | "regular";
export interface Furniture {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: 0 | 1;
  walkable: boolean;
  interactions: { x: number; y: number }[];
}
export interface Employee {
  id: string;
  name: string;
  role: string;
  bio: string;
  speed: number;
  care: number;
  trait: string;
  hire: number;
  wage: number;
  color: string;
  hair: string;
  skin: string;
}
export interface Employment {
  id: string;
  xp: number;
  trained: number;
  assigned: boolean;
}
export interface Guest {
  id: number;
  kind: CustomerKind;
  arrival: number;
  finish: number;
  product: string;
  served: boolean;
  lostReason?: string;
  price: number;
  recipe: Partial<Record<Ingredient, number>>;
  seat: number;
}
export interface Report {
  revenue: number;
  expenses: number;
  profit: number;
  ingredients: number;
  wages: number;
  rent: number;
  eventCost: number;
  eventRevenue: number;
  served: number;
  demand: number;
  lost: number;
  conclusion: string;
  lostReasons: Record<string, number>;
}
export interface Shift {
  id: string;
  start: number;
  end: number;
  seed: string;
  strategy: Strategy;
  menu: string[];
  guests: Guest[];
  wages: number;
  rent: number;
  report?: Report;
  finalized: boolean;
  event?: { choice: string; at: number; cost: number; bonus: number };
  notified: boolean;
  recovery: boolean;
}
export interface Ledger {
  id: string;
  at: number;
  amount: number;
  reason: string;
  balance: number;
}
export interface StoryChoice {
  eventId: string;
  choice: string;
  at: number;
  reply: string;
}
export interface Order {
  id: string;
  productId: string;
  price: number;
  currency: "XTR";
  payload: string;
  status: "pending" | "paid" | "refunded" | "refund_pending" | "cancelled";
  createdAt: number;
  chargeId?: string;
  demo: boolean;
  invoice?: string;
  title: string;
}
export interface Entitlement {
  id: string;
  source: string;
  productId: string;
  at: number;
  expires?: number;
  revoked: boolean;
}
export interface Analytics {
  name: string;
  at: number;
  meta?: string;
}
export interface Game {
  id: string;
  version: number;
  createdAt: number;
  lastSeen: number;
  name: string;
  balance: number;
  reputation: number;
  xp: number;
  mood: number;
  tutorial: number;
  inventory: Record<Ingredient, number>;
  upgrades: string[];
  employees: Employment[];
  layout: Furniture[];
  stored: Furniture[];
  skin: string;
  shifts: Shift[];
  stories: StoryChoice[];
  achievements: string[];
  journal: { at: number; text: string }[];
  ledger: Ledger[];
  orders: Order[];
  entitlements: Entitlement[];
  operations: Record<string, { hash: string; result: unknown }>;
  settings: {
    eveningLight: boolean;
    music: boolean;
    sound: boolean;
    haptics: boolean;
    reducedMotion: boolean;
    lowQuality: boolean;
    notifications: boolean;
  };
  layouts: { id: string; name: string; items: Furniture[] }[];
  analytics: Analytics[];
  recoveryUsedAt: number;
  supportTickets: { id: string; at: number; text: string; kind: string }[];
}
export interface Upgrade {
  id: string;
  name: string;
  price: number;
  level: number;
  effect: string;
  visual: string;
  speed?: number;
  comfort?: number;
  quality?: number;
  rep?: number;
  type: string;
}
export interface StoryEvent {
  id: string;
  title: string;
  category: string;
  character: string;
  intro: string;
  minShifts: number;
  minStage: number;
  requires?: string;
  maxRepeats: number;
  uncertainty: string;
  choices: {
    id: string;
    label: string;
    cost: number;
    rep: number;
    mood: number;
    stock?: number;
    reply: string;
  }[];
}
export const stageOf = (g: Pick<Game, "xp">) =>
  g.xp >= 900 ? 3 : g.xp >= 250 ? 2 : 1;
export const levelOf = (xp: number) => 1 + Math.floor(xp / 100);
export const money = (n: number) => new Intl.NumberFormat("ru-RU").format(n);
