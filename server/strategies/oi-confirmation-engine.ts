/**
 * OPTION OI CONFIRMATION ENGINE
 * Confirms directional bias using Open Interest shifts
 *
 * LONG confirmation:
 * - Call OI unwinding (decreasing)
 * - Put OI buildup (increasing)
 *
 * SHORT confirmation:
 * - Put OI unwinding (decreasing)
 * - Call OI buildup (increasing)
 */

export interface OILevel {
  callOI: number;
  putOI: number;
  totalOI: number;
  putCallRatio: number;
  timestamp: string;
}

export interface OIShift {
  callOiChange: number;
  callOiChangePercent: number;
  putOiChange: number;
  putOiChangePercent: number;
  netOiChange: number;
  isUnwinding: boolean; // Total OI decreasing
  isBuildup: boolean; // Total OI increasing
}

export interface OIConfirmation {
  confirmed: boolean;
  confidence: number; // 0-100
  direction: "LONG" | "SHORT" | "NEUTRAL";
  reasoning: string;
  callSignal: "UNWINDING" | "BUILDUP" | "NEUTRAL";
  putSignal: "UNWINDING" | "BUILDUP" | "NEUTRAL";
  pcRatio: number; // Put-Call ratio
}

export class OiConfirmationEngine {
  private static readonly MIN_OI_CHANGE_PERCENT = 0.5; // At least 0.5% change to consider significant
  private static readonly PUT_CALL_RATIO_BULLISH = 1.2; // PCR > 1.2 suggests put buildup (bullish)
  private static readonly PUT_CALL_RATIO_BEARISH = 0.8; // PCR < 0.8 suggests call buildup (bearish)

  /**
   * Calculate OI shift from previous to current
   */
  static calculateOiShift(
    previousOI: OILevel,
    currentOI: OILevel
  ): OIShift {
    const callOiChange = currentOI.callOI - previousOI.callOI;
    const putOiChange = currentOI.putOI - previousOI.putOI;
    const totalOiChange = currentOI.totalOI - previousOI.totalOI;

    const callOiChangePercent = (callOiChange / previousOI.callOI) * 100;
    const putOiChangePercent = (putOiChange / previousOI.putOI) * 100;

    return {
      callOiChange,
      callOiChangePercent,
      putOiChange,
      putOiChangePercent,
      netOiChange: totalOiChange,
      isUnwinding: totalOiChange < 0,
      isBuildup: totalOiChange > 0,
    };
  }

  /**
   * Check LONG confirmation
   * Expects: Call OI unwinding + Put OI buildup
   */
  static checkLongConfirmation(
    previousOI: OILevel,
    currentOI: OILevel
  ): OIConfirmation {
    const oiShift = this.calculateOiShift(previousOI, currentOI);

    let confidence = 50;
    let callSignal: "UNWINDING" | "BUILDUP" | "NEUTRAL" = "NEUTRAL";
    let putSignal: "UNWINDING" | "BUILDUP" | "NEUTRAL" = "NEUTRAL";

    // Analyze call OI
    if (
      Math.abs(oiShift.callOiChangePercent) >
      this.MIN_OI_CHANGE_PERCENT
    ) {
      if (oiShift.callOiChange < 0) {
        callSignal = "UNWINDING";
        confidence += 20;
      } else if (oiShift.callOiChange > 0) {
        callSignal = "BUILDUP";
        confidence -= 15;
      }
    }

    // Analyze put OI
    if (
      Math.abs(oiShift.putOiChangePercent) >
      this.MIN_OI_CHANGE_PERCENT
    ) {
      if (oiShift.putOiChange > 0) {
        putSignal = "BUILDUP";
        confidence += 20;
      } else if (oiShift.putOiChange < 0) {
        putSignal = "UNWINDING";
        confidence -= 15;
      }
    }

    // Check PCR ratio
    if (
      currentOI.putCallRatio >
      this.PUT_CALL_RATIO_BULLISH
    ) {
      confidence += 10; // Higher PCR suggests puts > calls (bullish)
    } else if (
      currentOI.putCallRatio <
      this.PUT_CALL_RATIO_BEARISH
    ) {
      confidence -= 10; // Lower PCR suggests calls > puts (bearish)
    }

    const confirmed =
      callSignal === "UNWINDING" && putSignal === "BUILDUP";

    const reasoning =
      callSignal === "UNWINDING"
        ? `Call OI unwinding (${oiShift.callOiChangePercent.toFixed(2)}%) `
        : "";
    const reasoning2 =
      putSignal === "BUILDUP"
        ? `Put OI building (${oiShift.putOiChangePercent.toFixed(2)}%)`
        : "";

    return {
      confirmed,
      confidence: Math.max(0, Math.min(100, confidence)),
      direction: "LONG",
      reasoning: reasoning + reasoning2 || "Mixed OI signals",
      callSignal,
      putSignal,
      pcRatio: currentOI.putCallRatio,
    };
  }

  /**
   * Check SHORT confirmation
   * Expects: Put OI unwinding + Call OI buildup
   */
  static checkShortConfirmation(
    previousOI: OILevel,
    currentOI: OILevel
  ): OIConfirmation {
    const oiShift = this.calculateOiShift(previousOI, currentOI);

    let confidence = 50;
    let callSignal: "UNWINDING" | "BUILDUP" | "NEUTRAL" = "NEUTRAL";
    let putSignal: "UNWINDING" | "BUILDUP" | "NEUTRAL" = "NEUTRAL";

    // Analyze call OI
    if (
      Math.abs(oiShift.callOiChangePercent) >
      this.MIN_OI_CHANGE_PERCENT
    ) {
      if (oiShift.callOiChange > 0) {
        callSignal = "BUILDUP";
        confidence += 20;
      } else if (oiShift.callOiChange < 0) {
        callSignal = "UNWINDING";
        confidence -= 15;
      }
    }

    // Analyze put OI
    if (
      Math.abs(oiShift.putOiChangePercent) >
      this.MIN_OI_CHANGE_PERCENT
    ) {
      if (oiShift.putOiChange < 0) {
        putSignal = "UNWINDING";
        confidence += 20;
      } else if (oiShift.putOiChange > 0) {
        putSignal = "BUILDUP";
        confidence -= 15;
      }
    }

    // Check PCR ratio
    if (
      currentOI.putCallRatio <
      this.PUT_CALL_RATIO_BEARISH
    ) {
      confidence += 10; // Lower PCR suggests calls > puts (bearish)
    } else if (
      currentOI.putCallRatio >
      this.PUT_CALL_RATIO_BULLISH
    ) {
      confidence -= 10; // Higher PCR suggests puts > calls (bullish)
    }

    const confirmed =
      putSignal === "UNWINDING" && callSignal === "BUILDUP";

    const reasoning =
      putSignal === "UNWINDING"
        ? `Put OI unwinding (${oiShift.putOiChangePercent.toFixed(2)}%) `
        : "";
    const reasoning2 =
      callSignal === "BUILDUP"
        ? `Call OI building (${oiShift.callOiChangePercent.toFixed(2)}%)`
        : "";

    return {
      confirmed,
      confidence: Math.max(0, Math.min(100, confidence)),
      direction: "SHORT",
      reasoning: reasoning + reasoning2 || "Mixed OI signals",
      callSignal,
      putSignal,
      pcRatio: currentOI.putCallRatio,
    };
  }

  /**
   * Get OI confirmation strength (0-100)
   */
  static getConfirmationStrength(
    oiConfirmation: OIConfirmation
  ): number {
    let strengthBonus = 0;

    if (oiConfirmation.callSignal !== "NEUTRAL") strengthBonus += 15;
    if (oiConfirmation.putSignal !== "NEUTRAL") strengthBonus += 15;

    return Math.min(100, oiConfirmation.confidence + strengthBonus);
  }

  /**
   * Generate composite confirmation score
   */
  static getCompositeScore(
    confirmations: OIConfirmation[]
  ): {
    direction: "LONG" | "SHORT" | "NEUTRAL";
    strength: number;
    consensus: number;
  } {
    if (confirmations.length === 0) {
      return { direction: "NEUTRAL", strength: 0, consensus: 0 };
    }

    const longCount = confirmations.filter(
      (c) => c.confirmed && c.direction === "LONG"
    ).length;
    const shortCount = confirmations.filter(
      (c) => c.confirmed && c.direction === "SHORT"
    ).length;

    let direction: "LONG" | "SHORT" | "NEUTRAL" = "NEUTRAL";
    if (longCount > shortCount) direction = "LONG";
    else if (shortCount > longCount) direction = "SHORT";

    const avgConfidence =
      confirmations.reduce((sum, c) => sum + c.confidence, 0) /
      confirmations.length;

    const consensus = (Math.max(longCount, shortCount) / confirmations.length) * 100;

    return {
      direction,
      strength: Math.min(100, avgConfidence),
      consensus,
    };
  }
}
