import { CandleData, RegimeAnalysis, MarketRegime, MarketBias } from "./types";
import { TechnicalIndicators } from "./indicators";

export class RegimeDetector {
  static analyzeRegime(
    candles: CandleData[],
    vix: number = 15
  ): RegimeAnalysis {
    if (candles.length < 50) {
      return {
        regime: "SIDEWAYS",
        confidence: 0,
        bias: "NEUTRAL",
        volatility: vix,
        trendStrength: 0,
        reason: "Insufficient data for regime analysis"
      };
    }

    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);

    const ema20 = TechnicalIndicators.ema(closes, 20);
    const ema50 = TechnicalIndicators.ema(closes, 50);
    const atr = TechnicalIndicators.atr(candles, 14);

    const currentPrice = closes[closes.length - 1];
    const currentEma20 = ema20[ema20.length - 1];
    const currentEma50 = ema50[ema50.length - 1];
    const currentAtr = atr[atr.length - 1];

    const bias = this.detectBias(currentPrice, currentEma20, currentEma50);

    const volatility = this.calculateVolatility(candles, currentAtr, vix);

    const regime = this.detectRegime(candles, ema20, ema50, volatility, currentAtr);

    const trendStrength = this.calculateTrendStrength(closes, ema20, ema50);

    const confidence = this.calculateConfidence(regime, trendStrength, volatility, candles.length);

    const reason = this.generateReason(regime, bias, trendStrength, volatility);

    return {
      regime,
      confidence,
      bias,
      volatility,
      trendStrength,
      reason
    };
  }

  private static detectBias(
    price: number,
    ema20: number,
    ema50: number
  ): MarketBias {
    if (price > ema20 && ema20 > ema50) {
      return "BULLISH";
    } else if (price < ema20 && ema20 < ema50) {
      return "BEARISH";
    }
    return "NEUTRAL";
  }

  private static calculateVolatility(
    candles: CandleData[],
    currentAtr: number,
    vix: number
  ): number {
    const recentCandles = candles.slice(-20);
    const avgRange = recentCandles.reduce((sum, c) => sum + (c.high - c.low), 0) / recentCandles.length;
    const avgPrice = recentCandles.reduce((sum, c) => sum + c.close, 0) / recentCandles.length;

    const atrPercent = (currentAtr / avgPrice) * 100;
    const rangePercent = (avgRange / avgPrice) * 100;
    const vixWeight = vix / 15;

    return (atrPercent + rangePercent + vixWeight) / 3;
  }

  private static detectRegime(
    candles: CandleData[],
    ema20: number[],
    ema50: number[],
    volatility: number,
    currentAtr: number
  ): MarketRegime {
    const recentCandles = candles.slice(-20);
    const recentEma20 = ema20.slice(-20);
    const recentEma50 = ema50.slice(-20);

    if (volatility > 3 || currentAtr > recentCandles[recentCandles.length - 1].close * 0.03) {
      return "VOLATILE";
    }

    const emaSpread = Math.abs(recentEma20[recentEma20.length - 1] - recentEma50[recentEma50.length - 1]);
    const avgPrice = recentCandles.reduce((sum, c) => sum + c.close, 0) / recentCandles.length;

    if (emaSpread / avgPrice > 0.02) {
      const isBreakingOut = this.detectBreakout(recentCandles);
      if (isBreakingOut) {
        return "BREAKOUT";
      }
      return "TRENDING";
    }

    return "SIDEWAYS";
  }

  private static detectBreakout(candles: CandleData[]): boolean {
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);

    const recentHigh = Math.max(...highs.slice(-10));
    const recentLow = Math.min(...lows.slice(-10));
    const currentClose = closes[closes.length - 1];

    const historicalHigh = Math.max(...highs.slice(0, -10));
    const historicalLow = Math.min(...lows.slice(0, -10));

    return currentClose > historicalHigh || currentClose < historicalLow;
  }

  private static calculateTrendStrength(
    closes: number[],
    ema20: number[],
    ema50: number[]
  ): number {
    const recentCloses = closes.slice(-20);
    const recentEma20 = ema20.slice(-20);
    const recentEma50 = ema50.slice(-20);

    const priceAboveEma20 = recentCloses.filter((c, i) => c > recentEma20[i]).length;
    const ema20AboveEma50 = recentEma20.filter((e, i) => e > recentEma50[i]).length;

    const priceStrength = (priceAboveEma20 / recentCloses.length) * 100;
    const emaStrength = (ema20AboveEma50 / recentEma20.length) * 100;

    if (priceStrength > 50 && emaStrength > 50) {
      return ((priceStrength + emaStrength) / 2);
    } else if (priceStrength < 50 && emaStrength < 50) {
      return -((100 - priceStrength + 100 - emaStrength) / 2);
    }

    return 0;
  }

  private static calculateConfidence(
    regime: MarketRegime,
    trendStrength: number,
    volatility: number,
    dataPoints: number
  ): number {
    let confidence = 50;

    if (dataPoints >= 100) confidence += 20;
    else if (dataPoints >= 50) confidence += 10;

    if (Math.abs(trendStrength) > 70) confidence += 20;
    else if (Math.abs(trendStrength) > 50) confidence += 10;

    if (regime === "TRENDING" || regime === "BREAKOUT") {
      confidence += 10;
    }

    if (volatility < 1.5) confidence += 10;

    return Math.min(confidence, 95);
  }

  private static generateReason(
    regime: MarketRegime,
    bias: MarketBias,
    trendStrength: number,
    volatility: number
  ): string {
    const reasons: string[] = [];

    reasons.push(`Market regime: ${regime}`);
    reasons.push(`Bias: ${bias}`);

    if (Math.abs(trendStrength) > 70) {
      reasons.push(`Strong trend (${trendStrength.toFixed(1)}%)`);
    } else if (Math.abs(trendStrength) > 50) {
      reasons.push(`Moderate trend (${trendStrength.toFixed(1)}%)`);
    } else {
      reasons.push(`Weak trend (${trendStrength.toFixed(1)}%)`);
    }

    if (volatility > 3) {
      reasons.push("High volatility environment");
    } else if (volatility < 1.5) {
      reasons.push("Low volatility environment");
    }

    return reasons.join(". ");
  }
}
