import { BaseStrategy } from "./base-strategy";
import { CandleData, TradingSignal, Instrument } from "../core/types";
import { TechnicalIndicators } from "../core/indicators";

export class VWAPReversionStrategy extends BaseStrategy {
  constructor() {
    super("VWAP_REVERSION", {
      enabled: true,
      instruments: ["NIFTY", "BANKNIFTY"],
      timeWindow: { start: "10:00", end: "15:00" },
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
    if (!this.isEnabled() || candles.length < 30) {
      return null;
    }

    if (!this.isInTradingWindow()) {
      return null;
    }

    const regimeFilter = this.applyRegimeFilter(candles, vix);
    if (!regimeFilter.passed) {
      return null;
    }

    if (regimeFilter.regime?.regime === "BREAKOUT") {
      return null;
    }

    const vwapValues = TechnicalIndicators.vwap(candles);
    const closes = candles.map(c => c.close);
    const rsi = TechnicalIndicators.rsi(closes, 14);

    const currentPrice = closes[closes.length - 1];
    const currentVWAP = vwapValues[vwapValues.length - 1];
    const currentRsi = rsi[rsi.length - 1];

    const deviationPercent = ((currentPrice - currentVWAP) / currentVWAP) * 100;

    const previousPrice = closes[closes.length - 2];
    const previousVWAP = vwapValues[vwapValues.length - 2];

    if (deviationPercent < -0.5 && previousPrice < previousVWAP && currentPrice > currentVWAP) {
      if (currentRsi > 30 && currentRsi < 50) {
        const confidence = this.calculateConfidence(
          Math.abs(deviationPercent),
          currentRsi,
          regimeFilter.regime,
          "BULLISH"
        );

        if (confidence >= this.config.minConfidence) {
          const targets = this.calculateTargets(100, "CE", 2);
          const strike = this.selectStrike(currentPrice, "CE");

          return {
            strategy: "VWAP_REVERSION",
            instrument,
            optionType: "CE",
            productType: "INT",
            strikePrice: strike,
            entryPrice: 100,
            ...targets,
            confidence,
            confidenceReason: `VWAP reversion long. Deviation: ${deviationPercent.toFixed(2)}%, RSI: ${currentRsi.toFixed(1)}`,
            marketBias: "BULLISH",
            marketRegime: regimeFilter.regime?.regime || "SIDEWAYS",
            regimeConfidence: regimeFilter.regime?.confidence,
          };
        }
      }
    }

    if (deviationPercent > 0.5 && previousPrice > previousVWAP && currentPrice < currentVWAP) {
      if (currentRsi < 70 && currentRsi > 50) {
        const confidence = this.calculateConfidence(
          Math.abs(deviationPercent),
          currentRsi,
          regimeFilter.regime,
          "BEARISH"
        );

        if (confidence >= this.config.minConfidence) {
          const targets = this.calculateTargets(100, "PE", 2);
          const strike = this.selectStrike(currentPrice, "PE");

          return {
            strategy: "VWAP_REVERSION",
            instrument,
            optionType: "PE",
            productType: "INT",
            strikePrice: strike,
            entryPrice: 100,
            ...targets,
            confidence,
            confidenceReason: `VWAP reversion short. Deviation: ${deviationPercent.toFixed(2)}%, RSI: ${currentRsi.toFixed(1)}`,
            marketBias: "BEARISH",
            marketRegime: regimeFilter.regime?.regime || "SIDEWAYS",
            regimeConfidence: regimeFilter.regime?.confidence,
          };
        }
      }
    }

    return null;
  }

  private calculateConfidence(
    deviation: number,
    rsi: number,
    regime: any,
    direction: "BULLISH" | "BEARISH"
  ): number {
    let confidence = 60;

    if (deviation >= 1) confidence += 15;
    else if (deviation >= 0.5) confidence += 10;

    if (direction === "BULLISH") {
      if (rsi >= 30 && rsi <= 40) confidence += 15;
      else if (rsi >= 25 && rsi <= 45) confidence += 10;
    } else {
      if (rsi >= 60 && rsi <= 70) confidence += 15;
      else if (rsi >= 55 && rsi <= 75) confidence += 10;
    }

    if (regime && regime.regime === "SIDEWAYS") {
      confidence += 10;
    }

    return Math.min(confidence, 95);
  }
}
