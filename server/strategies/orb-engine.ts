/**
 * PRO ORB (OPENING RANGE BREAKOUT) ENGINE
 * Sophisticated opening range breakout strategy with multiple filters
 *
 * ORB Range = Max(
 *   First 15 min high-low,
 *   ATR(5min) * 1.2
 * )
 *
 * Skip trade if:
 * - First 15-min candle is Doji
 * - Gap > 0.8% without pullback
 * - ATR% < 0.6%
 */

export interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ORBRange {
  high: number;
  low: number;
  range: number;
  rangePercent: number;
  source: "CANDLE" | "ATR";
  rawCandleRange: number;
  atrAdjustedRange: number;
}

export interface GapAnalysis {
  hasGap: boolean;
  gapSize: number;
  gapPercent: number;
  isPullback: boolean;
  direction: "UP" | "DOWN" | "NONE";
  reason: string;
}

export interface ORBValidation {
  isValid: boolean;
  isDoji: boolean;
  dojiRatio: number;
  gapAnalysis: GapAnalysis;
  atrPercent: number;
  atrValid: boolean;
  skipReasons: string[];
}

export interface ORBSignal {
  direction: "LONG" | "SHORT";
  entryPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  riskRewardRatio: number;
  confidence: number;
}

export class OrbEngine {
  private static readonly DOJI_RATIO_THRESHOLD = 0.1; // BodyRange < 10% of full range
  private static readonly GAP_THRESHOLD_PERCENT = 0.8;
  private static readonly MIN_ATR_PERCENT = 0.6;
  private static readonly ATR_MULTIPLIER = 1.2;

  /**
   * Calculate ORB range from first 15-minute candle and ATR
   */
  static calculateOrbRange(
    first15MinCandle: Candle,
    atr5Min: number,
    currentPrice: number
  ): ORBRange {
    const candleRange = first15MinCandle.high - first15MinCandle.low;
    const candleRangePercent = (candleRange / currentPrice) * 100;

    const atrAdjustedRange = atr5Min * this.ATR_MULTIPLIER;
    const atrRangePercent = (atrAdjustedRange / currentPrice) * 100;

    // Use the maximum of the two
    const finalRange = Math.max(candleRange, atrAdjustedRange);
    const finalRangePercent = (finalRange / currentPrice) * 100;

    return {
      high: first15MinCandle.high,
      low: first15MinCandle.low,
      range: finalRange,
      rangePercent: finalRangePercent,
      source: candleRange >= atrAdjustedRange ? "CANDLE" : "ATR",
      rawCandleRange: candleRange,
      atrAdjustedRange,
    };
  }

  /**
   * Check if first candle is a Doji
   */
  static isDoji(candle: Candle): { isDoji: boolean; ratio: number } {
    const bodySize = Math.abs(candle.close - candle.open);
    const totalRange = candle.high - candle.low;

    if (totalRange === 0) {
      return { isDoji: true, ratio: 0 };
    }

    const ratio = bodySize / totalRange;
    return {
      isDoji: ratio < this.DOJI_RATIO_THRESHOLD,
      ratio,
    };
  }

  /**
   * Analyze gap from previous close to current open
   */
  static analyzeGap(
    previousClose: number,
    currentOpen: number,
    currentPrice: number,
    recentCandles: Candle[]
  ): GapAnalysis {
    const gapSize = Math.abs(currentOpen - previousClose);
    const gapPercent = (gapSize / previousClose) * 100;
    const hasGap = gapPercent > 0.1;

    let direction: "UP" | "DOWN" | "NONE" = "NONE";
    if (currentOpen > previousClose) direction = "UP";
    else if (currentOpen < previousClose) direction = "DOWN";

    // Check for pullback - has price retraced towards previous close?
    let isPullback = false;
    if (recentCandles.length > 0) {
      const latestCandle = recentCandles[recentCandles.length - 1];
      if (direction === "UP") {
        // Check if price came down from open
        isPullback = latestCandle.low < currentOpen - gapSize * 0.5;
      } else if (direction === "DOWN") {
        // Check if price came up from open
        isPullback = latestCandle.high > currentOpen + gapSize * 0.5;
      }
    }

    const tooLargeGap = gapPercent > this.GAP_THRESHOLD_PERCENT && !isPullback;

    return {
      hasGap,
      gapSize,
      gapPercent,
      isPullback,
      direction,
      reason: tooLargeGap
        ? `Large gap (${gapPercent.toFixed(2)}%) without pullback - Skip ORB`
        : `Gap ${gapPercent.toFixed(2)}% ${isPullback ? "with pullback" : ""}`,
    };
  }

  /**
   * Validate ORB setup
   */
  static validateOrbSetup(
    first15MinCandle: Candle,
    atr5Min: number,
    currentPrice: number,
    previousClose: number,
    recentCandles: Candle[]
  ): ORBValidation {
    const skipReasons: string[] = [];

    // Check for Doji
    const dojiCheck = this.isDoji(first15MinCandle);
    if (dojiCheck.isDoji) {
      skipReasons.push(
        `Doji candle detected (ratio: ${dojiCheck.ratio.toFixed(3)}) - Skip ORB`
      );
    }

    // Check gap
    const gapAnalysis = this.analyzeGap(
      previousClose,
      first15MinCandle.open,
      currentPrice,
      recentCandles
    );
    if (!gapAnalysis.isPullback && gapAnalysis.gapPercent > this.GAP_THRESHOLD_PERCENT) {
      skipReasons.push(gapAnalysis.reason);
    }

    // Check ATR
    const atrPercent = (atr5Min / currentPrice) * 100;
    const atrValid = atrPercent >= this.MIN_ATR_PERCENT;
    if (!atrValid) {
      skipReasons.push(
        `Low ATR (${atrPercent.toFixed(3)}% < ${this.MIN_ATR_PERCENT}%) - Skip ORB`
      );
    }

    return {
      isValid: skipReasons.length === 0,
      isDoji: dojiCheck.isDoji,
      dojiRatio: dojiCheck.ratio,
      gapAnalysis,
      atrPercent,
      atrValid,
      skipReasons,
    };
  }

  /**
   * Generate ORB entry signal
   */
  static generateOrbSignal(
    direction: "LONG" | "SHORT",
    orbRange: ORBRange,
    orbHigh: number,
    orbLow: number,
    currentPrice: number,
    bufferPercent: number = 0.05
  ): ORBSignal {
    const buffer = (currentPrice * bufferPercent) / 100;

    let entryPrice: number;
    let stopLoss: number;
    let target1: number;
    let target2: number;
    let target3: number;

    if (direction === "LONG") {
      entryPrice = orbHigh;
      stopLoss = orbLow - buffer;
      const riskAmount = entryPrice - stopLoss;
      target1 = entryPrice + riskAmount;
      target2 = entryPrice + riskAmount * 2;
      target3 = entryPrice + riskAmount * 3;
    } else {
      entryPrice = orbLow;
      stopLoss = orbHigh + buffer;
      const riskAmount = stopLoss - entryPrice;
      target1 = entryPrice - riskAmount;
      target2 = entryPrice - riskAmount * 2;
      target3 = entryPrice - riskAmount * 3;
    }

    const riskAmount = Math.abs(entryPrice - stopLoss);
    const riskRewardRatio = riskAmount > 0 ? (target1 - entryPrice) / riskAmount : 1;

    return {
      direction,
      entryPrice,
      stopLoss,
      target1,
      target2,
      target3,
      riskRewardRatio,
      confidence: Math.min(100, 75 + orbRange.rangePercent * 5),
    };
  }

  /**
   * Check if price has broken above/below ORB
   */
  static checkBreakout(
    direction: "LONG" | "SHORT",
    currentPrice: number,
    orbHigh: number,
    orbLow: number
  ): boolean {
    if (direction === "LONG") {
      return currentPrice > orbHigh;
    } else {
      return currentPrice < orbLow;
    }
  }
}
