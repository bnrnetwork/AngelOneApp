/**
 * EMA PULLBACK STRATEGY ENGINE
 * Trend-following pullback strategy using multiple EMAs
 *
 * BUY Setup (CE):
 * - Time: 09:30 - 14:45
 * - Price > EMA50
 * - EMA50 slope upward
 * - EMA9 > EMA21
 * - Price retraces near EMA21 (within 0.1%)
 * - Bullish candle near EMA21
 * - Price > VWAP
 * - Break of pullback candle high
 *
 * SELL Setup (PE):
 * - Reverse all buy conditions
 *
 * SIDEWAYS FILTER:
 * - If first 1-hour range < 0.3%, skip signals
 */

export interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface EmaSet {
  ema9: number;
  ema21: number;
  ema50: number;
}

export interface EmaSlopeAnalysis {
  ema50Slope: number;
  isUptrend: boolean;
  isDowntrend: boolean;
  slopePercent: number;
}

export interface PullbackDetection {
  isPullback: boolean;
  distanceFromEma21: number;
  distancePercent: number;
  pullbackCandle: Candle | null;
  isBullishCandle: boolean;
  isBearishCandle: boolean;
}

export interface BreakoutSignal {
  hasBreakout: boolean;
  breakoutPrice: number;
  breakoutType: "BULLISH" | "BEARISH" | "NONE";
}

export interface MarketRangeAnalysis {
  firstHourHigh: number;
  firstHourLow: number;
  firstHourRange: number;
  rangePercent: number;
  isSideways: boolean;
}

export interface EmaPullbackSetup {
  direction: "CE" | "PE";
  entryPrice: number;
  stopLoss: number;
  target1: number; // RR 1:2
  target2: number; // RR 1:3
  target3: number; // RR 1:4
  trailLevel: number; // EMA9 trail
  confidence: number;
  riskAmount: number;
  reason: string;
}

export interface EmaPullbackSignal {
  isValid: boolean;
  setup: EmaPullbackSetup | null;
  failureReasons: string[];
  marketRange: MarketRangeAnalysis | null;
}

export class EmaPullbackEngine {
  private static readonly PULLBACK_TOLERANCE_PERCENT = 0.1;
  private static readonly SIDEWAYS_RANGE_THRESHOLD = 0.3;
  private static readonly EMA50_SLOPE_PERIODS = 3;
  private static readonly MIN_SLOPE_PERCENT = 0.02;

  /**
   * Calculate EMA for a given period
   */
  static calculateEma(candles: Candle[], period: number): number {
    if (candles.length < period) return 0;

    const multiplier = 2 / (period + 1);
    let ema = candles.slice(0, period).reduce((sum, c) => sum + c.close, 0) / period;

    for (let i = period; i < candles.length; i++) {
      ema = (candles[i].close - ema) * multiplier + ema;
    }

    return ema;
  }

  /**
   * Calculate all required EMAs
   */
  static calculateEmas(candles: Candle[]): EmaSet {
    return {
      ema9: this.calculateEma(candles, 9),
      ema21: this.calculateEma(candles, 21),
      ema50: this.calculateEma(candles, 50),
    };
  }

  /**
   * Analyze EMA50 slope to determine trend direction
   */
  static analyzeEmaSlope(candles: Candle[], currentEma50: number): EmaSlopeAnalysis {
    if (candles.length < 50 + this.EMA50_SLOPE_PERIODS) {
      return {
        ema50Slope: 0,
        isUptrend: false,
        isDowntrend: false,
        slopePercent: 0,
      };
    }

    // Calculate EMA50 from N periods ago
    const previousCandles = candles.slice(0, -this.EMA50_SLOPE_PERIODS);
    const previousEma50 = this.calculateEma(previousCandles, 50);

    const slope = currentEma50 - previousEma50;
    const slopePercent = (slope / previousEma50) * 100;

    return {
      ema50Slope: slope,
      isUptrend: slopePercent > this.MIN_SLOPE_PERCENT,
      isDowntrend: slopePercent < -this.MIN_SLOPE_PERCENT,
      slopePercent,
    };
  }

  /**
   * Detect pullback to EMA21
   */
  static detectPullback(
    currentPrice: number,
    ema21: number,
    lastCandle: Candle
  ): PullbackDetection {
    const distanceFromEma21 = currentPrice - ema21;
    const distancePercent = Math.abs(distanceFromEma21 / ema21) * 100;

    const isPullback = distancePercent <= this.PULLBACK_TOLERANCE_PERCENT;
    const isBullishCandle = lastCandle.close > lastCandle.open;
    const isBearishCandle = lastCandle.close < lastCandle.open;

    return {
      isPullback,
      distanceFromEma21,
      distancePercent,
      pullbackCandle: isPullback ? lastCandle : null,
      isBullishCandle,
      isBearishCandle,
    };
  }

  /**
   * Detect breakout of pullback candle
   */
  static detectBreakout(
    currentPrice: number,
    pullbackCandle: Candle | null,
    direction: "BULLISH" | "BEARISH"
  ): BreakoutSignal {
    if (!pullbackCandle) {
      return {
        hasBreakout: false,
        breakoutPrice: 0,
        breakoutType: "NONE",
      };
    }

    if (direction === "BULLISH") {
      const hasBreakout = currentPrice > pullbackCandle.high;
      return {
        hasBreakout,
        breakoutPrice: pullbackCandle.high,
        breakoutType: hasBreakout ? "BULLISH" : "NONE",
      };
    } else {
      const hasBreakout = currentPrice < pullbackCandle.low;
      return {
        hasBreakout,
        breakoutPrice: pullbackCandle.low,
        breakoutType: hasBreakout ? "BEARISH" : "NONE",
      };
    }
  }

  /**
   * Analyze first hour range to filter sideways markets
   */
  static analyzeMarketRange(candles: Candle[], currentPrice: number): MarketRangeAnalysis {
    // Get first hour candles (9:15 - 10:15, assuming 5-min candles = 12 candles)
    const firstHourCandles = candles.slice(0, 12);

    if (firstHourCandles.length < 12) {
      return {
        firstHourHigh: 0,
        firstHourLow: 0,
        firstHourRange: 0,
        rangePercent: 0,
        isSideways: false,
      };
    }

    const firstHourHigh = Math.max(...firstHourCandles.map(c => c.high));
    const firstHourLow = Math.min(...firstHourCandles.map(c => c.low));
    const firstHourRange = firstHourHigh - firstHourLow;
    const rangePercent = (firstHourRange / currentPrice) * 100;

    return {
      firstHourHigh,
      firstHourLow,
      firstHourRange,
      rangePercent,
      isSideways: rangePercent < this.SIDEWAYS_RANGE_THRESHOLD,
    };
  }

  /**
   * Check if current time is within trading window
   */
  static isWithinTradingWindow(currentTime: Date): boolean {
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    const timeInMinutes = hours * 60 + minutes;

    const startTime = 9 * 60 + 30; // 09:30
    const endTime = 14 * 60 + 45;  // 14:45

    return timeInMinutes >= startTime && timeInMinutes <= endTime;
  }

  /**
   * Generate BUY signal (CE)
   */
  static generateBuySignal(
    currentPrice: number,
    emas: EmaSet,
    vwap: number,
    candles: Candle[],
    currentTime: Date
  ): EmaPullbackSignal {
    const failureReasons: string[] = [];

    // Check time window
    if (!this.isWithinTradingWindow(currentTime)) {
      failureReasons.push("Outside trading window (09:30 - 14:45)");
      return { isValid: false, setup: null, failureReasons, marketRange: null };
    }

    // Check sideways filter
    const marketRange = this.analyzeMarketRange(candles, currentPrice);
    if (marketRange.isSideways) {
      failureReasons.push(`Sideways market: First hour range ${marketRange.rangePercent.toFixed(2)}% < 0.3%`);
      return { isValid: false, setup: null, failureReasons, marketRange };
    }

    // Condition 1: Price above EMA50
    if (currentPrice <= emas.ema50) {
      failureReasons.push("Price not above EMA50");
    }

    // Condition 2: EMA50 slope upward
    const slopeAnalysis = this.analyzeEmaSlope(candles, emas.ema50);
    if (!slopeAnalysis.isUptrend) {
      failureReasons.push(`EMA50 not in uptrend (slope: ${slopeAnalysis.slopePercent.toFixed(3)}%)`);
    }

    // Condition 3: EMA9 > EMA21
    if (emas.ema9 <= emas.ema21) {
      failureReasons.push("EMA9 not above EMA21");
    }

    // Condition 4: Price near EMA21 (pullback)
    const lastCandle = candles[candles.length - 1];
    const pullback = this.detectPullback(currentPrice, emas.ema21, lastCandle);
    if (!pullback.isPullback) {
      failureReasons.push(`Price too far from EMA21 (distance: ${pullback.distancePercent.toFixed(2)}%)`);
    }

    // Condition 5: Bullish candle near EMA21
    if (!pullback.isBullishCandle) {
      failureReasons.push("Not a bullish candle");
    }

    // Condition 6: Price above VWAP
    if (currentPrice <= vwap) {
      failureReasons.push("Price not above VWAP");
    }

    // Condition 7: Breakout of pullback candle high
    const breakout = this.detectBreakout(currentPrice, pullback.pullbackCandle, "BULLISH");
    if (!breakout.hasBreakout) {
      failureReasons.push("No breakout of pullback candle high");
    }

    // If any condition fails, return invalid signal
    if (failureReasons.length > 0) {
      return { isValid: false, setup: null, failureReasons, marketRange };
    }

    // All conditions met - generate setup
    const entry = breakout.breakoutPrice;
    const stopLoss = pullback.pullbackCandle!.low;
    const riskAmount = entry - stopLoss;

    const target1 = entry + (riskAmount * 2); // RR 1:2
    const target2 = entry + (riskAmount * 3); // RR 1:3
    const target3 = entry + (riskAmount * 4); // RR 1:4
    const trailLevel = emas.ema9;

    // Calculate confidence
    let confidence = 75;
    if (slopeAnalysis.slopePercent > 0.05) confidence += 5;
    if (emas.ema9 > emas.ema21 * 1.002) confidence += 5; // EMA9 > EMA21 by 0.2%
    if (currentPrice > vwap * 1.001) confidence += 5; // Price > VWAP by 0.1%
    if (pullback.distancePercent < 0.05) confidence += 5; // Very close to EMA21

    const setup: EmaPullbackSetup = {
      direction: "CE",
      entryPrice: entry,
      stopLoss,
      target1,
      target2,
      target3,
      trailLevel,
      confidence: Math.min(95, confidence),
      riskAmount,
      reason: `Bullish pullback to EMA21, breakout at ${entry.toFixed(2)} with RR 1:2/1:3/1:4`,
    };

    return {
      isValid: true,
      setup,
      failureReasons: [],
      marketRange,
    };
  }

  /**
   * Generate SELL signal (PE)
   */
  static generateSellSignal(
    currentPrice: number,
    emas: EmaSet,
    vwap: number,
    candles: Candle[],
    currentTime: Date
  ): EmaPullbackSignal {
    const failureReasons: string[] = [];

    // Check time window
    if (!this.isWithinTradingWindow(currentTime)) {
      failureReasons.push("Outside trading window (09:30 - 14:45)");
      return { isValid: false, setup: null, failureReasons, marketRange: null };
    }

    // Check sideways filter
    const marketRange = this.analyzeMarketRange(candles, currentPrice);
    if (marketRange.isSideways) {
      failureReasons.push(`Sideways market: First hour range ${marketRange.rangePercent.toFixed(2)}% < 0.3%`);
      return { isValid: false, setup: null, failureReasons, marketRange };
    }

    // Condition 1: Price below EMA50
    if (currentPrice >= emas.ema50) {
      failureReasons.push("Price not below EMA50");
    }

    // Condition 2: EMA50 slope downward
    const slopeAnalysis = this.analyzeEmaSlope(candles, emas.ema50);
    if (!slopeAnalysis.isDowntrend) {
      failureReasons.push(`EMA50 not in downtrend (slope: ${slopeAnalysis.slopePercent.toFixed(3)}%)`);
    }

    // Condition 3: EMA9 < EMA21
    if (emas.ema9 >= emas.ema21) {
      failureReasons.push("EMA9 not below EMA21");
    }

    // Condition 4: Price near EMA21 (pullback)
    const lastCandle = candles[candles.length - 1];
    const pullback = this.detectPullback(currentPrice, emas.ema21, lastCandle);
    if (!pullback.isPullback) {
      failureReasons.push(`Price too far from EMA21 (distance: ${pullback.distancePercent.toFixed(2)}%)`);
    }

    // Condition 5: Bearish candle near EMA21
    if (!pullback.isBearishCandle) {
      failureReasons.push("Not a bearish candle");
    }

    // Condition 6: Price below VWAP
    if (currentPrice >= vwap) {
      failureReasons.push("Price not below VWAP");
    }

    // Condition 7: Breakout of pullback candle low
    const breakout = this.detectBreakout(currentPrice, pullback.pullbackCandle, "BEARISH");
    if (!breakout.hasBreakout) {
      failureReasons.push("No breakdown of pullback candle low");
    }

    // If any condition fails, return invalid signal
    if (failureReasons.length > 0) {
      return { isValid: false, setup: null, failureReasons, marketRange };
    }

    // All conditions met - generate setup
    const entry = breakout.breakoutPrice;
    const stopLoss = pullback.pullbackCandle!.high;
    const riskAmount = stopLoss - entry;

    const target1 = entry - (riskAmount * 2); // RR 1:2
    const target2 = entry - (riskAmount * 3); // RR 1:3
    const target3 = entry - (riskAmount * 4); // RR 1:4
    const trailLevel = emas.ema9;

    // Calculate confidence
    let confidence = 75;
    if (slopeAnalysis.slopePercent < -0.05) confidence += 5;
    if (emas.ema9 < emas.ema21 * 0.998) confidence += 5; // EMA9 < EMA21 by 0.2%
    if (currentPrice < vwap * 0.999) confidence += 5; // Price < VWAP by 0.1%
    if (pullback.distancePercent < 0.05) confidence += 5; // Very close to EMA21

    const setup: EmaPullbackSetup = {
      direction: "PE",
      entryPrice: entry,
      stopLoss,
      target1,
      target2,
      target3,
      trailLevel,
      confidence: Math.min(95, confidence),
      riskAmount,
      reason: `Bearish pullback to EMA21, breakdown at ${entry.toFixed(2)} with RR 1:2/1:3/1:4`,
    };

    return {
      isValid: true,
      setup,
      failureReasons: [],
      marketRange,
    };
  }

  /**
   * Main analysis function - checks both BUY and SELL setups
   */
  static analyze(
    currentPrice: number,
    vwap: number,
    candles: Candle[],
    currentTime: Date = new Date()
  ): EmaPullbackSignal {
    if (candles.length < 50) {
      return {
        isValid: false,
        setup: null,
        failureReasons: ["Insufficient candles for EMA50 calculation"],
        marketRange: null,
      };
    }

    const emas = this.calculateEmas(candles);

    // Try BUY signal first
    const buySignal = this.generateBuySignal(currentPrice, emas, vwap, candles, currentTime);
    if (buySignal.isValid) {
      return buySignal;
    }

    // Try SELL signal
    const sellSignal = this.generateSellSignal(currentPrice, emas, vwap, candles, currentTime);
    if (sellSignal.isValid) {
      return sellSignal;
    }

    // No valid signal
    return {
      isValid: false,
      setup: null,
      failureReasons: [...buySignal.failureReasons, ...sellSignal.failureReasons],
      marketRange: buySignal.marketRange || sellSignal.marketRange,
    };
  }
}
