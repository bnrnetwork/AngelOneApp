import { BaseStrategy } from "./base-strategy";
import { CandleData, TradingSignal, Instrument } from "../core/types";
import { TechnicalIndicators } from "../core/indicators";

export class ORBStrategy extends BaseStrategy {
  private orbHighs: Map<string, number> = new Map();
  private orbLows: Map<string, number> = new Map();
  private breakoutDetected: Map<string, boolean> = new Map();

  constructor() {
    super("PRO_ORB", {
      enabled: true,
      instruments: ["NIFTY", "BANKNIFTY"],
      timeWindow: { start: "09:15", end: "10:30" },
      minConfidence: 65,
      useRegimeFilter: true,
      useOIConfirmation: true,
    });
  }

  analyze(
    instrument: Instrument,
    candles: CandleData[],
    optionChain?: any,
    vix?: number
  ): TradingSignal | null {
    if (!this.isEnabled() || candles.length < 20) {
      return null;
    }

    if (!this.isInTradingWindow()) {
      return null;
    }

    const regimeFilter = this.applyRegimeFilter(candles, vix);
    if (!regimeFilter.passed) {
      return null;
    }

    const orbCandles = this.getORBCandles(candles);
    if (orbCandles.length === 0) {
      return null;
    }

    const orbHigh = Math.max(...orbCandles.map(c => c.high));
    const orbLow = Math.min(...orbCandles.map(c => c.low));

    this.orbHighs.set(instrument, orbHigh);
    this.orbLows.set(instrument, orbLow);

    const currentCandle = candles[candles.length - 1];
    const previousCandle = candles[candles.length - 2];

    const volume = candles.slice(-5).map(c => c.volume);
    const avgVolume = volume.slice(0, -1).reduce((a, b) => a + b, 0) / (volume.length - 1);
    const volumeRatio = currentCandle.volume / avgVolume;

    const atr = TechnicalIndicators.atr(candles, 14);
    const currentAtr = atr[atr.length - 1];
    const breakoutMove = Math.abs(currentCandle.close - previousCandle.close);
    const atrRatio = breakoutMove / currentAtr;

    const alreadyBrokenOut = this.breakoutDetected.get(instrument);
    if (alreadyBrokenOut) {
      return null;
    }

    if (currentCandle.close > orbHigh && previousCandle.close <= orbHigh) {
      if (volumeRatio >= 1.5 && atrRatio >= 0.5) {
        this.breakoutDetected.set(instrument, true);

        const confidence = this.calculateConfidence(volumeRatio, atrRatio, regimeFilter.regime);

        const targets = this.calculateTargets(100, "CE", 2);

        const strike = this.selectStrike(currentCandle.close, "CE");

        return {
          strategy: "PRO_ORB",
          instrument,
          optionType: "CE",
          productType: "INT",
          strikePrice: strike,
          entryPrice: 100,
          ...targets,
          confidence,
          confidenceReason: `ORB Bullish breakout. Volume: ${volumeRatio.toFixed(2)}x, ATR: ${atrRatio.toFixed(2)}x. ${regimeFilter.regime?.reason || ''}`,
          marketBias: "BULLISH",
          marketRegime: regimeFilter.regime?.regime || "TRENDING",
          regimeConfidence: regimeFilter.regime?.confidence,
          breakoutScore: Math.min(95, (volumeRatio * 20) + (atrRatio * 30)),
        };
      }
    }

    if (currentCandle.close < orbLow && previousCandle.close >= orbLow) {
      if (volumeRatio >= 1.5 && atrRatio >= 0.5) {
        this.breakoutDetected.set(instrument, true);

        const confidence = this.calculateConfidence(volumeRatio, atrRatio, regimeFilter.regime);

        const targets = this.calculateTargets(100, "PE", 2);

        const strike = this.selectStrike(currentCandle.close, "PE");

        return {
          strategy: "PRO_ORB",
          instrument,
          optionType: "PE",
          productType: "INT",
          strikePrice: strike,
          entryPrice: 100,
          ...targets,
          confidence,
          confidenceReason: `ORB Bearish breakdown. Volume: ${volumeRatio.toFixed(2)}x, ATR: ${atrRatio.toFixed(2)}x. ${regimeFilter.regime?.reason || ''}`,
          marketBias: "BEARISH",
          marketRegime: regimeFilter.regime?.regime || "TRENDING",
          regimeConfidence: regimeFilter.regime?.confidence,
          breakoutScore: Math.min(95, (volumeRatio * 20) + (atrRatio * 30)),
        };
      }
    }

    return null;
  }

  private getORBCandles(candles: CandleData[]): CandleData[] {
    const now = new Date();
    const orbEndTime = new Date(now);
    orbEndTime.setHours(9, 30, 0, 0);

    return candles.filter(candle => {
      const candleTime = new Date(candle.timestamp);
      return candleTime >= new Date(now.setHours(9, 15, 0, 0)) &&
             candleTime <= orbEndTime;
    });
  }

  private calculateConfidence(
    volumeRatio: number,
    atrRatio: number,
    regime: any
  ): number {
    let confidence = 60;

    if (volumeRatio >= 2) confidence += 15;
    else if (volumeRatio >= 1.5) confidence += 10;

    if (atrRatio >= 1) confidence += 15;
    else if (atrRatio >= 0.5) confidence += 10;

    if (regime && regime.confidence >= 70) {
      confidence += 10;
    }

    return Math.min(confidence, 95);
  }

  resetDaily(): void {
    this.orbHighs.clear();
    this.orbLows.clear();
    this.breakoutDetected.clear();
  }
}
