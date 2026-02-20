import { CandleData, TradingSignal, Instrument, StrategyConfig } from "../core/types";
import { RegimeDetector } from "../core/regime-detector";
import { OIAnalyzer } from "../core/oi-analyzer";

export abstract class BaseStrategy {
  protected config: StrategyConfig;
  protected name: string;

  constructor(name: string, config: Partial<StrategyConfig> = {}) {
    this.name = name;
    this.config = {
      enabled: config.enabled ?? true,
      instruments: config.instruments || ["NIFTY", "BANKNIFTY"],
      timeWindow: config.timeWindow || { start: "09:15", end: "15:30" },
      maxPositions: config.maxPositions || 3,
      minConfidence: config.minConfidence || 60,
      riskPerTrade: config.riskPerTrade || 0.02,
      useRegimeFilter: config.useRegimeFilter ?? true,
      useOIConfirmation: config.useOIConfirmation ?? true,
      useVolatilityFilter: config.useVolatilityFilter ?? true,
    };
  }

  abstract analyze(
    instrument: Instrument,
    candles: CandleData[],
    optionChain?: any,
    vix?: number
  ): TradingSignal | null;

  protected isInTradingWindow(): boolean {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentTime = hours * 60 + minutes;

    const [startHour, startMin] = this.config.timeWindow.start.split(":").map(Number);
    const [endHour, endMin] = this.config.timeWindow.end.split(":").map(Number);

    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    return currentTime >= startTime && currentTime <= endTime;
  }

  protected applyRegimeFilter(candles: CandleData[], vix: number = 15): {
    passed: boolean;
    regime: any;
  } {
    if (!this.config.useRegimeFilter) {
      return { passed: true, regime: null };
    }

    const regime = RegimeDetector.analyzeRegime(candles, vix);

    if (regime.confidence < 50) {
      return { passed: false, regime };
    }

    if (regime.regime === "VOLATILE" && regime.volatility > 4) {
      return { passed: false, regime };
    }

    return { passed: true, regime };
  }

  protected calculateTargets(
    entryPrice: number,
    optionType: "CE" | "PE",
    riskRewardRatio: number = 2
  ): {
    target1: number;
    target2: number;
    target3: number;
    stoploss: number;
  } {
    const riskPercent = 0.30;

    const stoploss = optionType === "CE"
      ? entryPrice * (1 - riskPercent)
      : entryPrice * (1 + riskPercent);

    const risk = Math.abs(entryPrice - stoploss);

    const target1 = optionType === "CE"
      ? entryPrice + (risk * riskRewardRatio * 0.5)
      : entryPrice - (risk * riskRewardRatio * 0.5);

    const target2 = optionType === "CE"
      ? entryPrice + (risk * riskRewardRatio)
      : entryPrice - (risk * riskRewardRatio);

    const target3 = optionType === "CE"
      ? entryPrice + (risk * riskRewardRatio * 1.5)
      : entryPrice - (risk * riskRewardRatio * 1.5);

    return {
      target1: Math.round(target1 * 100) / 100,
      target2: Math.round(target2 * 100) / 100,
      target3: Math.round(target3 * 100) / 100,
      stoploss: Math.round(stoploss * 100) / 100,
    };
  }

  protected selectStrike(spotPrice: number, optionType: "CE" | "PE"): number {
    const roundedPrice = Math.round(spotPrice / 50) * 50;

    if (optionType === "CE") {
      return roundedPrice;
    } else {
      return roundedPrice;
    }
  }

  getName(): string {
    return this.name;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getConfig(): StrategyConfig {
    return this.config;
  }
}
