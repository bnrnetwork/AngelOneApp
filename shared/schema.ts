import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const signalStatusEnum = pgEnum("signal_status", [
  "active",
  "target1_hit",
  "target2_hit",
  "target3_hit",
  "sl_hit",
  "expired",
  "closed",
]);

export const instrumentEnum = pgEnum("instrument_type", [
  "NIFTY",
  "BANKNIFTY",
  "SENSEX",
  "CRUDEOIL",
  "NATURALGAS",
]);

export const optionTypeEnum = pgEnum("option_type", ["CE", "PE"]);
export const productTypeEnum = pgEnum("product_type", ["INT", "CF"]);

export const strategyEnum = pgEnum("strategy_type", [
  "ORB",
  "SMTR",
  "EMA",
  "VWAP_PULLBACK",
  "VWAP_RSI",
  "RSI",
  "RSI_RANGE",
  "GAP_FADE",
  "CPR",
  "INSIDE_CANDLE",
  "EMA_VWAP_RSI",
  "MARKET_TOP",
  "SCALP",
  "PRO_ORB",
  "VWAP_REVERSION",
  "BREAKOUT_STRENGTH",
  "REGIME_BASED",
  "EMA_PULLBACK",
  "AFTERNOON_VWAP_MOMENTUM",
]);

export const signals = pgTable("signals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  strategy: strategyEnum("strategy").notNull(),
  instrument: instrumentEnum("instrument").notNull(),
  optionType: optionTypeEnum("option_type").notNull(),
  productType: productTypeEnum("product_type").notNull().default("INT"),
  strikePrice: integer("strike_price").notNull(),
  entryPrice: real("entry_price").notNull(),
  currentPrice: real("current_price"),
  target1: real("target1").notNull(),
  target2: real("target2"),
  target3: real("target3"),
  stoploss: real("stoploss").notNull(),
  status: signalStatusEnum("status").notNull().default("active"),
  pnl: real("pnl").default(0),
  confidence: integer("confidence").default(50),
  confidenceReason: text("confidence_reason"),
  telegramSent: boolean("telegram_sent").default(false),
  exitPrice: real("exit_price"),
  exitReason: text("exit_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  closedTime: timestamp("closed_time"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  // New production fields
  riskRewardRatio: real("risk_reward_ratio"),
  marketBias: text("market_bias"), // BULLISH, BEARISH, NEUTRAL
  marketRegime: text("market_regime"), // SIDEWAYS, TRENDING, BREAKOUT
  regimeConfidence: real("regime_confidence"), // Regime AI confidence 0-100
  breakoutScore: real("breakout_score"), // 0-100
  oiConfirmation: text("oi_confirmation"), // JSON for OI analysis
  vixAtEntry: real("vix_at_entry"),
  bidAskSpread: real("bid_ask_spread"),
  trailingStopActive: boolean("trailing_stop_active").default(false),
});

export const logs = pgTable("logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  level: text("level").notNull().default("info"),
  source: text("source").notNull(),
  message: text("message").notNull(),
  data: text("data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSignalSchema = createInsertSchema(signals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLogSchema = createInsertSchema(logs).omit({
  id: true,
  createdAt: true,
});

export type InsertSignal = z.infer<typeof insertSignalSchema>;
export type Signal = typeof signals.$inferSelect;
export type InsertLog = z.infer<typeof insertLogSchema>;
export type Log = typeof logs.$inferSelect;
export type ProductType = typeof productTypeEnum.enumValues[number];

export const STRATEGIES = [
  { key: "ORB" as const, name: "Opening Range Breakout", shortName: "ORB", description: "First 15-min range breakout with trend confirmation" },
  { key: "SMTR" as const, name: "Smart Money Trap Reversal", shortName: "SMTR", description: "Fake breakout reversal using ORH/ORL, VWAP, and OI/PCR shifts" },
  { key: "EMA" as const, name: "EMA Crossover (9/21)", shortName: "EMA", description: "9/21 EMA crossover with price confirmation" },
  { key: "VWAP_PULLBACK" as const, name: "VWAP Bounce", shortName: "VWAP", description: "Price bounces off VWAP with RSI and trend filter" },
  { key: "VWAP_RSI" as const, name: "Supertrend (ST)", shortName: "ST", description: "Supertrend indicator crossover for trend following" },
  { key: "RSI" as const, name: "RSI Reversal", shortName: "RSI", description: "RSI extremes (OB/OS) and mid-range trend continuation" },
  { key: "RSI_RANGE" as const, name: "RSI Range", shortName: "RSI-R", description: "Range-bound RSI mean reversion with tighter targets" },
  { key: "GAP_FADE" as const, name: "Gap Fade", shortName: "Gap", description: "Fade opening gaps with VWAP and volume confirmation" },
  { key: "CPR" as const, name: "CPR", shortName: "CPR", description: "Central Pivot Range mean reversion setups" },
  { key: "INSIDE_CANDLE" as const, name: "Inside Candle", shortName: "Inside", description: "Inside candle breakout with trend alignment" },
  { key: "EMA_VWAP_RSI" as const, name: "Triple Confluence (EMA+VWAP+RSI)", shortName: "3Conf", description: "EMA + VWAP + RSI all aligned for high-probability setups" },
  { key: "MARKET_TOP" as const, name: "Market Top Reversal", shortName: "M-Top", description: "85%+ confidence reversal at market extremes" },
  { key: "SCALP" as const, name: "Momentum Scalp", shortName: "Scalp", description: "Strong candle momentum for quick CE/PE scalps" },
  { key: "PRO_ORB" as const, name: "Pro ORB (AI)", shortName: "ProORB", description: "AI-enhanced ORB confirmation and filtering" },
  { key: "VWAP_REVERSION" as const, name: "VWAP Mean Reversion", shortName: "VRev", description: "Mean reversion to VWAP in range-bound regimes" },
  { key: "BREAKOUT_STRENGTH" as const, name: "Breakout Strength", shortName: "BS", description: "Measures breakout strength and follow-through" },
  { key: "REGIME_BASED" as const, name: "Regime-Based (AI)", shortName: "Regime", description: "AI selects strategies based on market regime" },
  { key: "EMA_PULLBACK" as const, name: "EMA Pullback", shortName: "EMA-PB", description: "Trend pullback to EMA21 with breakout confirmation and multi-target setup" },
  { key: "AFTERNOON_VWAP_MOMENTUM" as const, name: "Afternoon VWAP Momentum", shortName: "PM-VWAP", description: "Day high/low breakout with option premium and OI confirmation (13:45-15:10)" },
] as const;

export const DISABLED_STRATEGIES = [] as const;

export type StrategyKey = typeof STRATEGIES[number]["key"];

export const STRATEGY_COLORS: Record<string, string> = {
  ORB: "hsl(217, 91%, 45%)",
  SMTR: "hsl(330, 70%, 50%)",
  EMA: "hsl(173, 58%, 39%)",
  VWAP_PULLBACK: "hsl(142, 76%, 36%)",
  VWAP_RSI: "hsl(43, 74%, 49%)",
  RSI: "hsl(27, 87%, 47%)",
  RSI_RANGE: "hsl(12, 70%, 45%)",
  GAP_FADE: "hsl(195, 70%, 45%)",
  CPR: "hsl(95, 55%, 40%)",
  INSIDE_CANDLE: "hsl(10, 80%, 50%)",
  EMA_VWAP_RSI: "hsl(260, 70%, 55%)",
  MARKET_TOP: "hsl(0, 75%, 50%)",
  SCALP: "hsl(50, 80%, 45%)",
  PRO_ORB: "hsl(200, 85%, 45%)",
  VWAP_REVERSION: "hsl(155, 70%, 35%)",
  BREAKOUT_STRENGTH: "hsl(12, 80%, 50%)",
  REGIME_BASED: "hsl(280, 60%, 55%)",
  EMA_PULLBACK: "hsl(160, 65%, 48%)",
  AFTERNOON_VWAP_MOMENTUM: "hsl(35, 88%, 52%)",
};

export const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  target1_hit: "Target 1 Hit",
  target2_hit: "Target 2 Hit",
  target3_hit: "Target 3 Hit",
  sl_hit: "SL Hit",
  expired: "Expired",
  closed: "Closed",
};

// Utility Helpers
export function getStrategyLabel(strategyKey: string): string {
  const strategy = STRATEGIES.find((item) => item.key === strategyKey);
  if (!strategy) return strategyKey;
  return `${strategy.name} (${strategy.shortName})`;
}

export type InstrumentType = "NIFTY" | "BANKNIFTY" | "SENSEX" | "CRUDEOIL" | "NATURALGAS";

export const ALL_INSTRUMENTS: { key: InstrumentType; label: string }[] = [
  { key: "NIFTY", label: "Nifty 50" },
  { key: "BANKNIFTY", label: "Bank Nifty" },
  { key: "SENSEX", label: "Sensex" },
  { key: "CRUDEOIL", label: "CrudeOil" },
  { key: "NATURALGAS", label: "NaturalGas" },
];

export const LOT_SIZES: Record<string, number> = {
  NIFTY: 65,
  BANKNIFTY: 30,
  SENSEX: 20,
  CRUDEOIL: 100,
  NATURALGAS: 1250,
};

export const STRIKE_STEPS: Record<string, number> = {
  NIFTY: 50,
  BANKNIFTY: 100,
  SENSEX: 100,
  CRUDEOIL: 50,
  NATURALGAS: 5,
};

export const CAPITAL_OPTIONS = [
  { value: 10000, label: "10K" },
  { value: 20000, label: "20K" },
  { value: 30000, label: "30K" },
  { value: 40000, label: "40K" },
  { value: 50000, label: "50K" },
  { value: 60000, label: "60K" },
  { value: 70000, label: "70K" },
  { value: 80000, label: "80K" },
  { value: 90000, label: "90K" },
  { value: 100000, label: "1L" },
  { value: 110000, label: "1.10L" },
  { value: 120000, label: "1.20L" },
  { value: 130000, label: "1.30L" },
  { value: 140000, label: "1.40L" },
  { value: 150000, label: "1.50L" },
  { value: 160000, label: "1.60L" },
  { value: 170000, label: "1.70L" },
  { value: 180000, label: "1.80L" },
  { value: 190000, label: "1.90L" },
  { value: 200000, label: "2L" },
];

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Re-export utilities for convenience
export * from "./utils";
