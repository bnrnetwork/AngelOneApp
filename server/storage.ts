import { db } from "./db";
import { signals, logs, type InsertSignal, type Signal, type InsertLog, type Log } from "@shared/schema";
import { eq, desc, and, gte, lt, inArray, sql } from "drizzle-orm";

export interface IStorage {
  getSignals(strategy?: string): Promise<Signal[]>;
  getTodaySignals(strategy?: string): Promise<Signal[]>;
  getSignal(id: string): Promise<Signal | undefined>;
  getActiveSignals(): Promise<Signal[]>;
  createSignal(signal: InsertSignal): Promise<Signal>;
  updateSignal(id: string, updates: Partial<Signal>): Promise<Signal | undefined>;
  getSignalsByDate(date: string): Promise<Signal[]>;
  clearExpiredSignals(date: string): Promise<number>;
  getAvailableSignalDates(): Promise<string[]>;
  getLogs(limit?: number): Promise<Log[]>;
  createLog(log: InsertLog): Promise<Log>;
  clearTodayData(): Promise<{ signalsDeleted: number; logsDeleted: number }>;
  exitSignal(id: string, exitPrice: number): Promise<Signal | undefined>;
  exitAllSignals(): Promise<number>;
  exitAllProfitSignals(): Promise<number>;
  exitAllLossSignals(): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  async getSignals(strategy?: string): Promise<Signal[]> {
    if (strategy) {
      return db.select().from(signals).where(eq(signals.strategy, strategy as any)).orderBy(desc(signals.createdAt));
    }
    return db.select().from(signals).orderBy(desc(signals.createdAt));
  }

  async getTodaySignals(strategy?: string): Promise<Signal[]> {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    const todayStr = istNow.toISOString().split("T")[0];
    const startOfDay = new Date(todayStr + "T00:00:00.000+05:30");
    const endOfDay = new Date(todayStr + "T23:59:59.999+05:30");

    if (strategy) {
      return db.select().from(signals)
        .where(and(
          eq(signals.strategy, strategy as any),
          gte(signals.createdAt, startOfDay),
          lt(signals.createdAt, endOfDay)
        ))
        .orderBy(desc(signals.createdAt));
    }
    return db.select().from(signals)
      .where(and(gte(signals.createdAt, startOfDay), lt(signals.createdAt, endOfDay)))
      .orderBy(desc(signals.createdAt));
  }

  async getSignal(id: string): Promise<Signal | undefined> {
    const [signal] = await db.select().from(signals).where(eq(signals.id, id));
    return signal;
  }

  async getActiveSignals(): Promise<Signal[]> {
    return db.select().from(signals).where(eq(signals.status, "active")).orderBy(desc(signals.createdAt));
  }

  async createSignal(signal: InsertSignal): Promise<Signal> {
    const now = new Date();
    const [created] = await db
      .insert(signals)
      .values({ ...signal, createdAt: now, updatedAt: now })
      .returning();
    return created;
  }

  async updateSignal(id: string, updates: Partial<Signal>): Promise<Signal | undefined> {
    const [updated] = await db
      .update(signals)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(signals.id, id))
      .returning();
    return updated;
  }

  async getSignalsByDate(date: string): Promise<Signal[]> {
    const startOfDay = new Date(date + "T00:00:00.000+05:30");
    const endOfDay = new Date(date + "T23:59:59.999+05:30");
    return db.select().from(signals)
      .where(and(gte(signals.createdAt, startOfDay), lt(signals.createdAt, endOfDay)))
      .orderBy(desc(signals.createdAt));
  }

  async clearExpiredSignals(date: string): Promise<number> {
    const startOfDay = new Date(date + "T00:00:00.000+05:30");
    const endOfDay = new Date(date + "T23:59:59.999+05:30");
    const result = await db.delete(signals)
      .where(and(
        gte(signals.createdAt, startOfDay),
        lt(signals.createdAt, endOfDay),
        inArray(signals.status, ["sl_hit", "expired"])
      ))
      .returning();
    return result.length;
  }

  async getAvailableSignalDates(): Promise<string[]> {
    const result = await db.execute(
      sql`SELECT DISTINCT DATE(created_at AT TIME ZONE 'Asia/Kolkata') as signal_date FROM signals ORDER BY signal_date DESC LIMIT 30`
    );
    return (result.rows as any[]).map((r: any) => {
      const d = new Date(r.signal_date);
      return d.toISOString().split("T")[0];
    });
  }

  async backfillClosedTime(): Promise<number> {
    const result = await db.execute(
      sql`UPDATE signals SET closed_time = updated_at WHERE status != 'active' AND closed_time IS NULL`
    );
    return result.rowCount || 0;
  }

  async getLogs(limit = 200): Promise<Log[]> {
    return db.select().from(logs).orderBy(desc(logs.createdAt)).limit(limit);
  }

  async createLog(log: InsertLog): Promise<Log> {
    const [created] = await db.insert(logs).values(log).returning();
    return created;
  }

  async clearTodayData(): Promise<{ signalsDeleted: number; logsDeleted: number }> {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    const todayStr = istNow.toISOString().split("T")[0];
    const startOfDay = new Date(todayStr + "T00:00:00.000+05:30");
    const endOfDay = new Date(todayStr + "T23:59:59.999+05:30");

    // Delete today's signals
    const signalsResult = await db.delete(signals)
      .where(and(
        gte(signals.createdAt, startOfDay),
        lt(signals.createdAt, endOfDay)
      ));

    // Delete today's logs
    const logsResult = await db.delete(logs)
      .where(and(
        gte(logs.createdAt, startOfDay),
        lt(logs.createdAt, endOfDay)
      ));

    return {
      signalsDeleted: signalsResult.rowCount || 0,
      logsDeleted: logsResult.rowCount || 0
    };
  }

  async exitSignal(id: string, exitPrice: number): Promise<Signal | undefined> {
    const signal = await this.getSignal(id);
    if (!signal) return undefined;

    const pointsPnl = Math.round((exitPrice - signal.entryPrice) * 100) / 100;
    const lotSize = signal.instrument === "NIFTY" ? 50 : signal.instrument === "BANKNIFTY" ? 15 : 1;
    const moneyPnl = Math.round(pointsPnl * lotSize * 100) / 100;

    return this.updateSignal(id, {
      status: "closed",
      currentPrice: exitPrice,
      pnl: moneyPnl,
      exitPrice,
      exitReason: "Manual exit",
      closedTime: new Date(),
    });
  }

  async exitAllSignals(): Promise<number> {
    const activeSignals = await this.getActiveSignals();
    if (activeSignals.length === 0) return 0;

    const now = new Date();
    const result = await db.update(signals)
      .set({
        status: "closed" as any,
        exitReason: "Manual exit",
        closedTime: now,
        updatedAt: now,
      })
      .where(eq(signals.status, "active" as any));

    return result.rowCount || 0;
  }

  async exitAllProfitSignals(): Promise<number> {
    const activeSignals = await this.getActiveSignals();
    const profitSignals = activeSignals.filter(s => (s.pnl ?? 0) > 0);
    
    if (profitSignals.length === 0) return 0;

    const signalIds = profitSignals.map(s => s.id);
    const now = new Date();
    const result = await db.update(signals)
      .set({
        status: "closed" as any,
        exitReason: "Manual exit",
        closedTime: now,
        updatedAt: now,
      })
      .where(inArray(signals.id, signalIds));

    return result.rowCount || 0;
  }

  async exitAllLossSignals(): Promise<number> {
    const activeSignals = await this.getActiveSignals();
    const lossSignals = activeSignals.filter(s => (s.pnl ?? 0) < 0);

    if (lossSignals.length === 0) return 0;

    const signalIds = lossSignals.map(s => s.id);
    const now = new Date();
    const result = await db.update(signals)
      .set({
        status: "closed" as any,
        exitReason: "Manual exit",
        closedTime: now,
        updatedAt: now,
      })
      .where(inArray(signals.id, signalIds));

    return result.rowCount || 0;
  }
}

// Use Supabase database via MCP
export const storage = new DatabaseStorage();
