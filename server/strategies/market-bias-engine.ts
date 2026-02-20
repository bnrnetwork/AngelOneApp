/**
 * MARKET BIAS ENGINE
 * Determines market bias based on opening price vs previous day levels
 * Rules:
 * - If open > PDH → Bullish
 * - If open < PDL → Bearish
 * - Else → Neutral
 */

export interface PreviousDayLevels {
  high: number;
  low: number;
  close: number;
}

export type MarketBias = "BULLISH" | "BEARISH" | "NEUTRAL";

export interface BiasResult {
  bias: MarketBias;
  openPrice: number;
  previousHigh: number;
  previousLow: number;
  previousClose: number;
  confidence: number; // 0-100
  reason: string;
}

export class MarketBiasEngine {
  /**
   * Calculate market bias based on opening price
   */
  static calculateBias(
    openPrice: number,
    previousLevels: PreviousDayLevels
  ): BiasResult {
    const { high: pdh, low: pdl, close: pdc } = previousLevels;

    let bias: MarketBias;
    let confidence: number;
    let reason: string;

    if (openPrice > pdh) {
      bias = "BULLISH";
      const breakoutStrength = ((openPrice - pdh) / pdh) * 100;
      confidence = Math.min(100, 70 + breakoutStrength * 10);
      reason = `Open (${openPrice.toFixed(2)}) > PDH (${pdh.toFixed(2)}) - Bullish breakout`;
    } else if (openPrice < pdl) {
      bias = "BEARISH";
      const breakdownStrength = ((pdl - openPrice) / pdl) * 100;
      confidence = Math.min(100, 70 + breakdownStrength * 10);
      reason = `Open (${openPrice.toFixed(2)}) < PDL (${pdl.toFixed(2)}) - Bearish breakdown`;
    } else {
      bias = "NEUTRAL";
      const distanceToPdh = ((pdh - openPrice) / openPrice) * 100;
      const distanceToPdl = ((openPrice - pdl) / openPrice) * 100;
      confidence = Math.max(distanceToPdh, distanceToPdl) < 0.5 ? 40 : 60;
      reason = `Open (${openPrice.toFixed(2)}) between PDL (${pdl.toFixed(2)}) and PDH (${pdh.toFixed(2)}) - Neutral`;
    }

    return {
      bias,
      openPrice,
      previousHigh: pdh,
      previousLow: pdl,
      previousClose: pdc,
      confidence,
      reason,
    };
  }

  /**
   * Check if a signal direction is aligned with market bias
   */
  static isAlignedWithBias(
    direction: "LONG" | "SHORT",
    bias: MarketBias
  ): boolean {
    if (bias === "NEUTRAL") return true;
    if (direction === "LONG" && bias === "BULLISH") return true;
    if (direction === "SHORT" && bias === "BEARISH") return true;
    return false;
  }

  /**
   * Get bias-adjusted confidence multiplier
   */
  static getBiasConfidenceMultiplier(bias: MarketBias): number {
    switch (bias) {
      case "BULLISH":
      case "BEARISH":
        return 1.2; // 20% confidence boost for aligned trades
      case "NEUTRAL":
        return 1.0;
    }
  }
}
