import { BaseStrategy } from "./base-strategy";
import { CandleData, TradingSignal, Instrument } from "../core/types";
import { TechnicalIndicators } from "../core/indicators";

export class AfternoonVWAPMomentumStrategy extends BaseStrategy {
  constructor() {
    super("AFTERNOON_VWAP_MOMENTUM", {
      enabled: true,
      instruments: ["NIFTY", "BANKNIFTY"],
      timeWindow: { start: "13:00", end: "15:00" },
      minConfidence: 70,
      useRegimeFilter: true,
      useVolatilityFilter: true,
    });
  }

  analyze(
    instrument: Instrument,
    candles: CandleData[],
    optionChain?: any,
    vix?: number
  ): TradingSignal | null {
    if (!this.isEnabled() || candles.length < 50) {
      return null;
    }

    if (!this.isInTradingWindow()) {
      return null;
    }

    const regimeFilter = this.applyRegimeFilter(candles, vix);
    if (!regimeFilter.passed) {
      return null;
    }

    const vwapValues = TechnicalIndicators.vwap(candles);
    const closes = candles.map(c => c.close);
    const ema20 = TechnicalIndicators.ema(closes, 20);
    const rsi = TechnicalIndicators.rsi(closes, 14);

    const currentPrice = closes[closes.length - 1];
    const currentVWAP = vwapValues[vwapValues.length - 1];
    const currentEma20 = ema20[ema20.length - 1];
    const currentRsi = rsi[rsi.length - 1];

    const previousPrice = closes[closes.length - 2];
    const previousVWAP = vwapValues[vwapValues.length - 2];

    const recentVolume = candles.slice(-10).map(c => c.volume);
    const avgVolume = recentVolume.slice(0, -1).reduce((a, b) => a + b, 0) / (recentVolume.length - 1);
    const currentVolume = candles[candles.length - 1].volume;
    const volumeRatio = currentVolume / avgVolume;

    if (
      currentPrice > currentVWAP &&
      currentPrice > currentEma20 &&
      previousPrice <= previousVWAP &&
      volumeRatio >= 1.3
    ) {
      if (currentRsi > 50 && currentRsi < 75) {
        const confidence = this.calculateConfidence(
          volumeRatio,
          currentRsi,
          regimeFilter.regime,
          "BULLISH"
        );

        if (confidence >= this.config.minConfidence) {
          const targets = this.calculateTargets(100, "CE", 2);
          const strike = this.selectStrike(currentPrice, "CE");

          return {
            strategy: "AFTERNOON_VWAP_MOMENTUM",
            instrument,
            optionType: "CE",
            productType: "INT",
            strikePrice: strike,
            entryPrice: 100,
            ...targets,
            confidence,
            confidenceReason: `Afternoon bullish momentum above VWAP. Volume: ${volumeRatio.toFixed(2)}x, RSI: ${currentRsi.toFixed(1)}`,
            marketBias: "BULLISH",
            marketRegime: regimeFilter.regime?.regime || "TRENDING",
            regimeConfidence: regimeFilter.regime?.confidence,
          };
        }
      }
    }

    if (
      currentPrice < currentVWAP &&
      currentPrice < currentEma20 &&
      previousPrice >= previousVWAP &&
      volumeRatio >= 1.3
    ) {
      if (currentRsi < 50 && currentRsi > 25) {
        const confidence = this.calculateConfidence(
          volumeRatio,
          currentRsi,
          regimeFilter.regime,
          "BEARISH"
        );

        if (confidence >= this.config.minConfidence) {
          const targets = this.calculateTargets(100, "PE", 2);
          const strike = this.selectStrike(currentPrice, "PE");

          return {
            strategy: "AFTERNOON_VWAP_MOMENTUM",
            instrument,
            optionType: "PE",
            productType: "INT",
            strikePrice: strike,
            entryPrice: 100,
            ...targets,
            confidence,
            confidenceReason: `Afternoon bearish momentum below VWAP. Volume: ${volumeRatio.toFixed(2)}x, RSI: ${currentRsi.toFixed(1)}`,
            marketBias: "BEARISH",
            marketRegime: regimeFilter.regime?.regime || "TRENDING",
            regimeConfidence: regimeFilter.regime?.confidence,
          };
        }
      }
    }

    return null;
  }

  private calculateConfidence(
    volumeRatio: number,
    rsi: number,
    regime: any,
    direction: "BULLISH" | "BEARISH"
  ): number {
    let confidence = 65;

    if (volumeRatio >= 2) confidence += 15;
    else if (volumeRatio >= 1.5) confidence += 10;
    else if (volumeRatio >= 1.3) confidence += 5;

    if (direction === "BULLISH") {
      if (rsi >= 55 && rsi <= 65) confidence += 10;
      else if (rsi >= 50 && rsi <= 70) confidence += 5;
    } else {
      if (rsi >= 35 && rsi <= 45) confidence += 10;
      else if (rsi >= 30 && rsi <= 50) confidence += 5;
    }

    if (regime && regime.confidence >= 70) {
      confidence += 10;
    }

    return Math.min(confidence, 95);
  }
}
