/**
 * BREAKOUT STRENGTH SCORE CALCULATOR
 * Calculates comprehensive breakout quality (0-100 scale)
 *
 * Score components:
 * - Volume spike (1.8x avg) → 25 points
 * - VWAP distance strength → 20 points
 * - EMA 20/50 alignment → 15 points
 * - Option OI shift confirmation → 20 points
 * - ATR expansion → 20 points
 *
 * Only take trade if Score >= 70
 */

export interface BreakoutStrengthScore {
  totalScore: number;
  components: {
    volumeSpike: number;
    vwapDistance: number;
    emaAlignment: number;
    oiConfirmation: number;
    atrExpansion: number;
  };
  breakdown: {
    volumeSpike: string;
    vwapDistance: string;
    emaAlignment: string;
    oiConfirmation: string;
    atrExpansion: string;
  };
  shouldTrade: boolean;
  confidence: number;
}

export interface OIShiftData {
  callOI: number;
  putOI: number;
  prevCallOI: number;
  prevPutOI: number;
}

export class BreakoutStrengthScorer {
  private static readonly VOLUME_SPIKE_MULTIPLIER = 1.8;
  private static readonly MIN_SCORE_TO_TRADE = 70;
  private static readonly MAX_COMPONENT_SCORE = 100;

  /**
   * Calculate volume spike score (0-25)
   */
  static scoreVolumeSpike(currentVolume: number, avgVolume: number): number {
    if (avgVolume === 0) return 0;

    const spikeRatio = currentVolume / avgVolume;

    if (spikeRatio < 1) return 0;
    if (spikeRatio < this.VOLUME_SPIKE_MULTIPLIER) return 10;
    if (spikeRatio < 2.5) return 18;
    if (spikeRatio < 3.5) return 23;
    return 25;
  }

  /**
   * Calculate VWAP distance strength score (0-20)
   * Higher score if price is significantly away from VWAP in direction of trade
   */
  static scoreVwapDistance(
    currentPrice: number,
    vwap: number,
    direction: "LONG" | "SHORT"
  ): number {
    const distance = Math.abs(currentPrice - vwap);
    const distancePercent = (distance / vwap) * 100;

    // Check direction alignment
    const isAligned =
      (direction === "LONG" && currentPrice > vwap) ||
      (direction === "SHORT" && currentPrice < vwap);

    if (!isAligned) return 0;

    if (distancePercent < 0.1) return 5;
    if (distancePercent < 0.3) return 10;
    if (distancePercent < 0.6) return 15;
    return 20;
  }

  /**
   * Calculate EMA alignment score (0-15)
   * Awards points for bullish/bearish EMA configuration
   */
  static scoreEmaAlignment(
    ema20: number,
    ema50: number,
    direction: "LONG" | "SHORT"
  ): number {
    const isAligned =
      (direction === "LONG" && ema20 > ema50) ||
      (direction === "SHORT" && ema20 < ema50);

    if (!isAligned) return 0;

    const deviation = Math.abs(ema20 - ema50) / ema50;
    const deviationPercent = deviation * 100;

    if (deviationPercent < 0.05) return 5;
    if (deviationPercent < 0.15) return 10;
    return 15;
  }

  /**
   * Calculate OI confirmation score (0-20)
   * - Long: Call OI unwinding + Put OI buildup
   * - Short: Put OI unwinding + Call OI buildup
   */
  static scoreOiConfirmation(
    oiData: OIShiftData,
    direction: "LONG" | "SHORT"
  ): number {
    const callOiChange = oiData.callOI - oiData.prevCallOI;
    const putOiChange = oiData.putOI - oiData.prevPutOI;

    let callUnwinding = false;
    let putBuildup = false;

    if (direction === "LONG") {
      callUnwinding = callOiChange < 0; // Calls decreasing
      putBuildup = putOiChange > 0; // Puts increasing
    } else {
      callUnwinding = callOiChange > 0; // Calls increasing (unwinding shorts)
      putBuildup = putOiChange < 0; // Puts decreasing
    }

    let score = 0;
    if (callUnwinding) score += 10;
    if (putBuildup) score += 10;

    return Math.min(20, score);
  }

  /**
   * Calculate ATR expansion score (0-20)
   * Higher score if current ATR is above average ATR
   */
  static scoreAtrExpansion(currentAtr: number, avgAtr: number): number {
    if (avgAtr === 0) return 0;

    const atrRatio = currentAtr / avgAtr;

    if (atrRatio < 0.8) return 0;
    if (atrRatio < 1.0) return 8;
    if (atrRatio < 1.3) return 14;
    if (atrRatio < 1.6) return 18;
    return 20;
  }

  /**
   * Calculate comprehensive breakout strength score
   */
  static calculateScore(
    direction: "LONG" | "SHORT",
    currentVolume: number,
    avgVolume: number,
    currentPrice: number,
    vwap: number,
    ema20: number,
    ema50: number,
    currentAtr: number,
    avgAtr: number,
    oiData: OIShiftData
  ): BreakoutStrengthScore {
    const volumeScore = this.scoreVolumeSpike(currentVolume, avgVolume);
    const vwapScore = this.scoreVwapDistance(currentPrice, vwap, direction);
    const emaScore = this.scoreEmaAlignment(ema20, ema50, direction);
    const oiScore = this.scoreOiConfirmation(oiData, direction);
    const atrScore = this.scoreAtrExpansion(currentAtr, avgAtr);

    const totalScore = volumeScore + vwapScore + emaScore + oiScore + atrScore;

    return {
      totalScore: Math.min(100, totalScore),
      components: {
        volumeSpike: volumeScore,
        vwapDistance: vwapScore,
        emaAlignment: emaScore,
        oiConfirmation: oiScore,
        atrExpansion: atrScore,
      },
      breakdown: {
        volumeSpike: `${volumeScore}/25 (Volume: ${(currentVolume / avgVolume).toFixed(2)}x avg)`,
        vwapDistance: `${vwapScore}/20 (VWAP dist: ${((Math.abs(currentPrice - vwap) / vwap) * 100).toFixed(3)}%)`,
        emaAlignment: `${emaScore}/15 (EMA20: ${ema20.toFixed(2)}, EMA50: ${ema50.toFixed(2)})`,
        oiConfirmation: `${oiScore}/20 (Call OI: ${oiData.callOI}, Put OI: ${oiData.putOI})`,
        atrExpansion: `${atrScore}/20 (ATR: ${currentAtr.toFixed(3)}, Avg: ${avgAtr.toFixed(3)})`,
      },
      shouldTrade: totalScore >= this.MIN_SCORE_TO_TRADE,
      confidence: Math.max(50, (totalScore / 100) * 100),
    };
  }

  /**
   * Get score interpretation
   */
  static interpretScore(score: number): string {
    if (score >= 85) return "EXCELLENT";
    if (score >= 75) return "VERY_GOOD";
    if (score >= 70) return "GOOD";
    if (score >= 60) return "ACCEPTABLE";
    return "WEAK";
  }
}
