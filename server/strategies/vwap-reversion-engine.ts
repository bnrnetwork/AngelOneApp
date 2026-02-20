/**
 * VWAP MEAN REVERSION ENGINE
 * Activates only in sideways/neutral market regime
 *
 * LONG Setup:
 * - Price < VWAP - 0.5%
 * - RSI < 35
 * - Target = VWAP
 * - SL = recent swing low
 *
 * SHORT Setup (Opposite logic)
 */

export interface SwingLevel {
  level: number;
  timestamp: string;
  candleIndex: number;
}

export interface VwapReversionSetup {
  direction: "LONG" | "SHORT";
  entryPrice: number;
  target: number;
  stopLoss: number;
  riskRewardRatio: number;
  confidence: number;
  reason: string;
}

export interface VwapReversionSignal {
  isValid: boolean;
  setup: VwapReversionSetup | null;
  failureReasons: string[];
}

export interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class VwapReversionEngine {
  private static readonly VWAP_DISTANCE_PERCENT = 0.5;
  private static readonly RSI_LONG_THRESHOLD = 35;
  private static readonly RSI_SHORT_THRESHOLD = 65;
  private static readonly MIN_REVERSION_POTENTIAL = 0.3; // Minimum 0.3% reversion potential

  /**
   * Find recent swing high (for SHORT entries)
   */
  static findRecentSwingHigh(
    candles: Candle[],
    lookbackPeriod: number = 20
  ): SwingLevel {
    if (candles.length < 3) {
      return { level: 0, timestamp: "", candleIndex: 0 };
    }

    const recentCandles = candles.slice(-lookbackPeriod);
    let swingHigh = recentCandles[0].high;
    let swingIndex = 0;

    for (let i = 1; i < recentCandles.length; i++) {
      if (recentCandles[i].high > swingHigh) {
        swingHigh = recentCandles[i].high;
        swingIndex = i;
      }
    }

    return {
      level: swingHigh,
      timestamp: recentCandles[swingIndex].timestamp,
      candleIndex: swingIndex,
    };
  }

  /**
   * Find recent swing low (for LONG entries)
   */
  static findRecentSwingLow(
    candles: Candle[],
    lookbackPeriod: number = 20
  ): SwingLevel {
    if (candles.length < 3) {
      return { level: 0, timestamp: "", candleIndex: 0 };
    }

    const recentCandles = candles.slice(-lookbackPeriod);
    let swingLow = recentCandles[0].low;
    let swingIndex = 0;

    for (let i = 1; i < recentCandles.length; i++) {
      if (recentCandles[i].low < swingLow) {
        swingLow = recentCandles[i].low;
        swingIndex = i;
      }
    }

    return {
      level: swingLow,
      timestamp: recentCandles[swingIndex].timestamp,
      candleIndex: swingIndex,
    };
  }

  /**
   * Check LONG reversion setup
   * Entry: Price < VWAP - 0.5%
   * RSI < 35
   * Target: VWAP
   */
  static checkLongReversion(
    currentPrice: number,
    vwap: number,
    rsi: number,
    candles: Candle[]
  ): VwapReversionSignal {
    const failureReasons: string[] = [];

    // Check price distance from VWAP
    const vwapLowerBound = vwap * (1 - this.VWAP_DISTANCE_PERCENT / 100);
    if (currentPrice > vwapLowerBound) {
      failureReasons.push(
        `Price ${currentPrice.toFixed(2)} not below VWAP-0.5% (${vwapLowerBound.toFixed(2)})`
      );
    }

    // Check RSI
    if (rsi > this.RSI_LONG_THRESHOLD) {
      failureReasons.push(
        `RSI ${rsi.toFixed(2)} > ${this.RSI_LONG_THRESHOLD} - Not oversold`
      );
    }

    if (failureReasons.length > 0) {
      return { isValid: false, setup: null, failureReasons };
    }

    const swingLow = this.findRecentSwingLow(candles);
    const riskReward = (vwap - currentPrice) / (currentPrice - swingLow.level);

    const setup: VwapReversionSetup = {
      direction: "LONG",
      entryPrice: currentPrice,
      target: vwap,
      stopLoss: swingLow.level,
      riskRewardRatio: riskReward,
      confidence: Math.min(100, 60 + (35 - rsi) * 2), // Higher confidence with lower RSI
      reason: `LONG: Price ${currentPrice.toFixed(2)} below VWAP ${vwap.toFixed(2)}, RSI ${rsi.toFixed(2)} oversold`,
    };

    return { isValid: true, setup, failureReasons: [] };
  }

  /**
   * Check SHORT reversion setup
   * Entry: Price > VWAP + 0.5%
   * RSI > 65
   * Target: VWAP
   */
  static checkShortReversion(
    currentPrice: number,
    vwap: number,
    rsi: number,
    candles: Candle[]
  ): VwapReversionSignal {
    const failureReasons: string[] = [];

    // Check price distance from VWAP
    const vwapUpperBound = vwap * (1 + this.VWAP_DISTANCE_PERCENT / 100);
    if (currentPrice < vwapUpperBound) {
      failureReasons.push(
        `Price ${currentPrice.toFixed(2)} not above VWAP+0.5% (${vwapUpperBound.toFixed(2)})`
      );
    }

    // Check RSI
    if (rsi < this.RSI_SHORT_THRESHOLD) {
      failureReasons.push(
        `RSI ${rsi.toFixed(2)} < ${this.RSI_SHORT_THRESHOLD} - Not overbought`
      );
    }

    if (failureReasons.length > 0) {
      return { isValid: false, setup: null, failureReasons };
    }

    const swingHigh = this.findRecentSwingHigh(candles);
    const riskReward = (currentPrice - vwap) / (swingHigh.level - currentPrice);

    const setup: VwapReversionSetup = {
      direction: "SHORT",
      entryPrice: currentPrice,
      target: vwap,
      stopLoss: swingHigh.level,
      riskRewardRatio: riskReward,
      confidence: Math.min(100, 60 + (rsi - this.RSI_SHORT_THRESHOLD) * 2),
      reason: `SHORT: Price ${currentPrice.toFixed(2)} above VWAP ${vwap.toFixed(2)}, RSI ${rsi.toFixed(2)} overbought`,
    };

    return { isValid: true, setup, failureReasons: [] };
  }

  /**
   * Check if reversion has valid risk-reward
   */
  static isRiskRewardAcceptable(riskRewardRatio: number, minRatio: number = 1): boolean {
    return riskRewardRatio >= minRatio;
  }

  /**
   * Calculate reversion targets for multi-target strategy
   */
  static calculateReversionTargets(
    entryPrice: number,
    targetPrice: number,
    direction: "LONG" | "SHORT"
  ) {
    const riskAmount = Math.abs(targetPrice - entryPrice);

    if (direction === "LONG") {
      return {
        target1: targetPrice,
        target2: targetPrice + riskAmount * 0.5,
        target3: targetPrice + riskAmount,
      };
    } else {
      return {
        target1: targetPrice,
        target2: targetPrice - riskAmount * 0.5,
        target3: targetPrice - riskAmount,
      };
    }
  }
}
