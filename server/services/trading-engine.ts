import { db } from "../db";
import { signals, logs } from "../../shared/schema";
import { StrategyManager } from "../strategies-v2/strategy-manager";
import { MarketDataService } from "./market-data-service";
import { TradingSignal, Instrument, CandleData } from "../core/types";
import { eq, and } from "drizzle-orm";

export class TradingEngine {
  private strategyManager: StrategyManager;
  private marketDataService: MarketDataService;
  private isRunning: boolean = false;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(
    marketDataService: MarketDataService,
    accountBalance: number = 100000
  ) {
    this.marketDataService = marketDataService;
    this.strategyManager = new StrategyManager(accountBalance);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log("Trading engine already running");
      return;
    }

    this.isRunning = true;
    console.log("Trading engine started");

    await this.logEvent("info", "TradingEngine", "Engine started");

    this.checkInterval = setInterval(() => {
      this.runAnalysis();
    }, 60000);

    await this.runAnalysis();
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.isRunning = false;
    console.log("Trading engine stopped");
  }

  private async runAnalysis(): Promise<void> {
    try {
      const instruments: Instrument[] = ["NIFTY", "BANKNIFTY"];

      for (const instrument of instruments) {
        await this.analyzeInstrument(instrument);
      }
    } catch (error) {
      console.error("Error in trading engine analysis:", error);
      await this.logEvent("error", "TradingEngine", `Analysis error: ${error}`);
    }
  }

  private async analyzeInstrument(instrument: Instrument): Promise<void> {
    try {
      const candles = await this.getHistoricalCandles(instrument);
      if (candles.length < 50) {
        return;
      }

      const vix = 15;

      const signal = this.strategyManager.getBestSignal(
        instrument,
        candles,
        undefined,
        vix
      );

      if (signal) {
        await this.processSignal(signal);
      }
    } catch (error) {
      console.error(`Error analyzing ${instrument}:`, error);
    }
  }

  private async getHistoricalCandles(instrument: Instrument): Promise<CandleData[]> {
    try {
      const symbolMap: Record<Instrument, string> = {
        NIFTY: "99926000",
        BANKNIFTY: "99926009",
        SENSEX: "99919000",
        CRUDEOIL: "99920000",
        NATURALGAS: "99921000",
      };

      const symbolToken = symbolMap[instrument];
      if (!symbolToken) return [];

      const toDate = new Date();
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 7);

      const fromDateStr = fromDate.toISOString().split('T')[0] + " 09:15";
      const toDateStr = toDate.toISOString().split('T')[0] + " 15:30";

      return await this.marketDataService.getCandleData(
        symbolToken,
        "FIVE_MINUTE",
        fromDateStr,
        toDateStr
      );
    } catch (error) {
      console.error(`Error fetching candles for ${instrument}:`, error);
      return [];
    }
  }

  private async processSignal(signal: TradingSignal): Promise<void> {
    try {
      const existingActiveSignals = await db
        .select()
        .from(signals)
        .where(
          and(
            eq(signals.instrument, signal.instrument),
            eq(signals.strategy, signal.strategy),
            eq(signals.status, "active")
          )
        );

      if (existingActiveSignals.length > 0) {
        console.log(`Active signal already exists for ${signal.instrument} ${signal.strategy}`);
        return;
      }

      const [insertedSignal] = await db
        .insert(signals)
        .values({
          strategy: signal.strategy as any,
          instrument: signal.instrument,
          optionType: signal.optionType,
          productType: signal.productType,
          strikePrice: signal.strikePrice,
          entryPrice: signal.entryPrice,
          currentPrice: signal.entryPrice,
          target1: signal.target1,
          target2: signal.target2,
          target3: signal.target3,
          stoploss: signal.stoploss,
          status: "active",
          confidence: signal.confidence,
          confidenceReason: signal.confidenceReason,
          marketBias: signal.marketBias,
          marketRegime: signal.marketRegime,
          regimeConfidence: signal.regimeConfidence,
          breakoutScore: signal.breakoutScore,
          riskRewardRatio: signal.riskRewardRatio,
          vixAtEntry: signal.vixAtEntry,
        })
        .returning();

      console.log(`New signal generated: ${signal.strategy} ${signal.instrument} ${signal.optionType}`);

      await this.logEvent(
        "info",
        "TradingEngine",
        `Signal generated: ${signal.strategy} ${signal.instrument} ${signal.optionType} @ ${signal.entryPrice}`
      );

      this.strategyManager.addActiveSignal(insertedSignal.id, signal);
    } catch (error) {
      console.error("Error processing signal:", error);
      await this.logEvent("error", "TradingEngine", `Error processing signal: ${error}`);
    }
  }

  async updateActiveSignals(): Promise<void> {
    try {
      const activeSignals = await db
        .select()
        .from(signals)
        .where(eq(signals.status, "active"));

      for (const signal of activeSignals) {
        await this.updateSignalPrice(signal);
      }
    } catch (error) {
      console.error("Error updating active signals:", error);
    }
  }

  private async updateSignalPrice(signal: any): Promise<void> {
    try {
      const symbolMap: Record<string, string> = {
        NIFTY: "NIFTY",
        BANKNIFTY: "BANKNIFTY",
        SENSEX: "SENSEX",
      };

      const baseSymbol = symbolMap[signal.instrument];
      if (!baseSymbol) return;

      const expiryDate = this.getNextExpiry(signal.instrument);
      const optionSymbol = `${baseSymbol}${expiryDate}${signal.strikePrice}${signal.optionType}`;

      const ltp = await this.marketDataService.getLTP(optionSymbol, "NFO");
      if (!ltp) return;

      const pnl = ((ltp - signal.entryPrice) / signal.entryPrice) * 100;

      let newStatus = signal.status;
      let exitPrice = null;
      let exitReason = null;

      if (ltp >= signal.target1 && signal.status === "active") {
        newStatus = "target1_hit";
        exitPrice = ltp;
        exitReason = "Target 1 hit";
      } else if (ltp >= signal.target2 && signal.status === "target1_hit") {
        newStatus = "target2_hit";
        exitPrice = ltp;
        exitReason = "Target 2 hit";
      } else if (ltp >= signal.target3 && signal.status === "target2_hit") {
        newStatus = "target3_hit";
        exitPrice = ltp;
        exitReason = "Target 3 hit";
      } else if (ltp <= signal.stoploss) {
        newStatus = "sl_hit";
        exitPrice = ltp;
        exitReason = "Stop loss hit";
      }

      await db
        .update(signals)
        .set({
          currentPrice: ltp,
          pnl,
          status: newStatus,
          exitPrice,
          exitReason,
          closedTime: exitPrice ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(signals.id, signal.id));

      if (exitPrice) {
        this.strategyManager.removeActiveSignal(signal.id);
        console.log(`Signal ${signal.id} closed: ${exitReason}`);
      }
    } catch (error) {
      console.error(`Error updating signal ${signal.id}:`, error);
    }
  }

  private getNextExpiry(instrument: Instrument): string {
    const now = new Date();
    let expiryDate = new Date(now);

    if (instrument === "NIFTY") {
      const daysUntilThursday = (4 - now.getDay() + 7) % 7;
      expiryDate.setDate(now.getDate() + (daysUntilThursday || 7));
    } else if (instrument === "BANKNIFTY") {
      const daysUntilWednesday = (3 - now.getDay() + 7) % 7;
      expiryDate.setDate(now.getDate() + (daysUntilWednesday || 7));
    }

    const day = String(expiryDate.getDate()).padStart(2, "0");
    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const month = monthNames[expiryDate.getMonth()];
    const year = String(expiryDate.getFullYear()).slice(-2);

    return `${day}${month}${year}`;
  }

  private async logEvent(level: string, source: string, message: string): Promise<void> {
    try {
      await db.insert(logs).values({
        level,
        source,
        message,
        createdAt: new Date(),
      });
    } catch (error) {
      console.error("Error logging event:", error);
    }
  }

  getStrategyManager(): StrategyManager {
    return this.strategyManager;
  }

  isEngineRunning(): boolean {
    return this.isRunning;
  }
}
