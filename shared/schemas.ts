import { z } from "zod";
export const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("tutorial"),
    step: z.number().int().min(0).max(6),
    gift: z.enum(["decor", "lighting"]).optional(),
    name: z.string().trim().min(2).max(28).optional(),
  }),
  z.object({
    type: z.literal("skipTutorial"),
    name: z.string().trim().min(2).max(28).optional(),
  }),
  z.object({
    type: z.literal("startShift"),
    menu: z
      .array(z.enum(["espresso", "cappuccino", "latte", "croissant", "cookie"]))
      .min(1)
      .max(5),
    strategy: z.enum(["friendly", "balanced", "premium"]),
    prep: z.enum(["welcome", "practice", "tidy"]),
    recovery: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("shiftDecision"),
    choice: z.enum(["neutral", "care"]),
  }),
  z.object({ type: z.literal("upgrade"), id: z.string().max(40) }),
  z.object({ type: z.literal("hire"), id: z.string().max(40) }),
  z.object({
    type: z.literal("assign"),
    id: z.string().max(40),
    assigned: z.boolean(),
  }),
  z.object({ type: z.literal("train"), id: z.string().max(40) }),
  z.object({ type: z.literal("restock") }),
  z.object({
    type: z.literal("story"),
    eventId: z.string().max(40),
    choice: z.string().max(40),
  }),
  z.object({
    type: z.literal("move"),
    id: z.string().max(100),
    x: z.number().int(),
    y: z.number().int(),
    rotation: z.union([z.literal(0), z.literal(1)]),
  }),
  z.object({ type: z.literal("storeFurniture"), id: z.string().max(100) }),
  z.object({
    type: z.literal("placeStored"),
    id: z.string().max(100),
    x: z.number().int(),
    y: z.number().int(),
    rotation: z.union([z.literal(0), z.literal(1)]),
  }),
  z.object({
    type: z.literal("settings"),
    settings: z.object({
      eveningLight: z.boolean().optional(),
      music: z.boolean().optional(),
      sound: z.boolean().optional(),
      haptics: z.boolean().optional(),
      reducedMotion: z.boolean().optional(),
      lowQuality: z.boolean().optional(),
      notifications: z.boolean().optional(),
    }),
  }),
  z.object({
    type: z.literal("applySkin"),
    skin: z.enum(["original", "neon", "loft", "founder"]),
  }),
  z.object({
    type: z.literal("saveLayout"),
    slot: z.number().int().min(0).max(4),
    name: z.string().trim().min(1).max(30),
  }),
  z.object({
    type: z.literal("loadLayout"),
    slot: z.number().int().min(0).max(4),
  }),
  z.object({
    type: z.literal("track"),
    event: z.enum(["shop_open", "purchase_start"]),
  }),
]);
export type Action = z.infer<typeof actionSchema>;
