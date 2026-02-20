/**
 * VOLATILITY FILTER
 * Uses India VIX to filter trades and adjust position sizing
 * Rules:
 * - VIX < 11 → Block ORB trades
 * - VIX 11-18 → Normal size
 * - VIX > 20 → Reduce size by 50%
 */

export interface VolatilityFilterResult {
  shouldTrade: boolean;
  sizeMultiplier: number; // 0-1
  vixLevel: "LOW" | "NORMAL" | "HIGH" | "EXTREME";
  reason: string;
  vixValue: number;
}

export class VolatilityFilter {
  private static readonly LOW_VIX_THRESHOLD = 11;
  private static readonly NORMAL_VIX_LOW = 11;
  private static readonly NORMAL_VIX_HIGH = 18;
  private static readonly HIGH_VIX_THRESHOLD = 20;
  private static readonly EXTREME_VIX_THRESHOLD = 30;

  /**
   * Apply volatility filter based on India VIX
   */
  static evaluateVIX(vixValue: number): VolatilityFilterResult {
    if (vixValue < this.LOW_VIX_THRESHOLD) {
      return {
        shouldTrade: false,
        sizeMultiplier: 0,
        vixLevel: "LOW",
        reason: `VIX (${vixValue.toFixed(2)}) < ${this.LOW_VIX_THRESHOLD} - Low volatility, ORB trades blocked`,
        vixValue,
      };
    }

    if (vixValue >= this.NORMAL_VIX_LOW && vixValue <= this.NORMAL_VIX_HIGH) {
      return {
        shouldTrade: true,
        sizeMultiplier: 1.0,
        vixLevel: "NORMAL",
        reason: `VIX (${vixValue.toFixed(2)}) in normal range [${this.NORMAL_VIX_LOW}-${this.NORMAL_VIX_HIGH}] - Full size`,
        vixValue,
      };
    }

    if (vixValue > this.NORMAL_VIX_HIGH && vixValue <= this.HIGH_VIX_THRESHOLD) {
      return {
        shouldTrade: true,
        sizeMultiplier: 1.0,
        vixLevel: "NORMAL",
        reason: `VIX (${vixValue.toFixed(2)}) in elevated range - Full size`,
        vixValue,
      };
    }

    if (vixValue > this.HIGH_VIX_THRESHOLD && vixValue < this.EXTREME_VIX_THRESHOLD) {
      return {
        shouldTrade: true,
        sizeMultiplier: 0.5,
        vixLevel: "HIGH",
        reason: `VIX (${vixValue.toFixed(2)}) > ${this.HIGH_VIX_THRESHOLD} - Position size reduced by 50%`,
        vixValue,
      };
    }

    return {
      shouldTrade: true,
      sizeMultiplier: 0.25,
      vixLevel: "EXTREME",
      reason: `VIX (${vixValue.toFixed(2)}) > ${this.EXTREME_VIX_THRESHOLD} - Extreme volatility, position size reduced by 75%`,
      vixValue,
    };
  }

  /**
   * Get position size adjustment based on VIX
   */
  static getPositionSizeAdjustment(vixValue: number, baseQuantity: number): number {
    const filter = this.evaluateVIX(vixValue);
    return Math.floor(baseQuantity * filter.sizeMultiplier);
  }

  /**
   * Check if specific strategy should be traded at this VIX level
   */
  static canTradeStrategy(
    vixValue: number,
    strategy: "ORB" | "VWAP_REVERSION" | "OTHER"
  ): { can: boolean; reason: string } {
    // ORB should not trade in very low volatility
    if (strategy === "ORB" && vixValue < this.LOW_VIX_THRESHOLD) {
      return {
        can: false,
        reason: `VIX ${vixValue.toFixed(2)} too low for ORB trades`,
      };
    }

    // VWAP reversion benefits from normal to elevated volatility
    if (strategy === "VWAP_REVERSION" && vixValue < 10) {
      return {
        can: false,
        reason: `VIX ${vixValue.toFixed(2)} too low for range-bound trades`,
      };
    }

    return { can: true, reason: "VIX level acceptable for strategy" };
  }
}
