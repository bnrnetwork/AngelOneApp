import { BaseStrategy } from "./base-strategy";
import { CandleData, TradingSignal, Instrument } from "../core/types";
import { TechnicalIndicators } from "../core/indicators";

export class EMAPullbackStrategy extends BaseStrategy {
  constructor() {
    super("EMA_PULLBACK", {
      enabled: true,
      instruments: ["NIFTY", "BANKNIFTY"],
      timeWindow: { start: "09:30", end: "14:30" },
      minConfidence: 65,
      useRegimeFilter: true,
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

    if (regimeFilter.regime?.regime === "SIDEWAYS") {
      return null;
    }

    const closes = candles.map(c => c.close);
    const ema20 = TechnicalIndicators.ema(closes, 20);
    const ema50 = TechnicalIndicators.ema(closes, 50);
    const rsi = TechnicalIndicators.rsi(closes, 14);

    const currentPrice = closes[closes.length - 1];
    const currentEma20 = ema20[ema20.length - 1];
    const currentEma50 = ema50[ema50.length - 1];
    const currentRsi = rsi[rsi.length - 1];

    const previousPrice = closes[closes.length - 2];
    const previousEma20 = ema20[ema20.length - 2];

    if (currentEma20 > currentEma50 && regimeFilter.regime?.bias === "BULLISH") {
      if (previousPrice < previousEma20 && currentPrice > currentEma20) {
        if (currentRsi > 40 && currentRsi < 70) {
          const confidence = this.calculateConfidence(
            currentRsi,
            regimeFilter.regime,
            "BULLISH"
          );

          if (confidence >= this.config.minConfidence) {
            const targets = this.calculateTargets(100, "CE", 2.5);
            const strike = this.selectStrike(currentPrice, "CE");

            return {
              strategy: "EMA_PULLBACK",
              instrument,
              optionType: "CE",
              productType: "INT",
              strikePrice: strike,
              entryPrice: 100,
              ...targets,
              confidence,
              confidenceReason: `Bullish EMA pullback. RSI: ${currentRsi.toFixed(1)}, Trend strength: ${regimeFilter.regime.trendStrength.toFixed(1)}`,
              marketBias: "BULLISH",
              marketRegime: regimeFilter.regime?.regime || "TRENDING",
              regimeConfidence: regimeFilter.regime?.confidence,
            };
          }
        }
      }
    }

    if (currentEma20 < currentEma50 && regimeFilter.regime?.bias === "BEARISH") {
      if (previousPrice > previousEma20 && currentPrice < currentEma20) {
        if (currentRsi < 60 && currentRsi > 30) {
          const confidence = this.calculateConfidence(
            currentRsi,
            regimeFilter.regime,
            "BEARISH"
          );

          if (confidence >= this.config.minConfidence) {
            const targets = this.calculateTargets(100, "PE", 2.5);
            const strike = this.selectStrike(currentPrice, "PE");

            return {
              strategy: "EMA_PULLBACK",
              instrument,
              optionType: "PE",
              productType: "INT",
              strikePrice: strike,
              entryPrice: 100,
              ...targets,
              confidence,
              confidenceReason: `Bearish EMA pullback. RSI: ${currentRsi.toFixed(1)}, Trend strength: ${Math.abs(regimeFilter.regime.trendStrength).toFixed(1)}`,
              marketBias: "BEARISH",
              marketRegime: regimeFilter.regime?.regime || "TRENDING",
              regimeConfidence: regimeFilter.regime?.confidence,
            };
          }
        }
      }
    }

    return null;
  }

  private calculateConfidence(
    rsi: number,
    regime: any,
    direction: "BULLISH" | "BEARISH"
  ): number {
    let confidence = 60;

    if (direction === "BULLISH") {
      if (rsi >= 50 && rsi <= 60) confidence += 15;
      else if (rsi >= 45 && rsi <= 65) confidence += 10;
    } else {
      if (rsi >= 40 && rsi <= 50) confidence += 15;
      else if (rsi >= 35 && rsi <= 55) confidence += 10;
    }

    if (regime && Math.abs(regime.trendStrength) > 60) {
      confidence += 15;
    } else if (regime && Math.abs(regime.trendStrength) > 50) {
      confidence += 10;
    }

    return Math.min(confidence, 95);
  }
}
