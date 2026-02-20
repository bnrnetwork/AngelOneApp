/**
 * AFTERNOON VWAP MOMENTUM STRATEGY ENGINE
 * 
 * Time: 13:45 - 15:10 IST (last 90 minutes)
 * 
 * Trades breakdown moves at market extremes (day high/low)
 * with option premium confirmation and OI validation.
 * 
 * BEARISH (PE BUY):
 * - Spot < VWAP, EMA9 < EMA21
 * - Two bearish candles → break day low
 * - Candle range > 1.2 × ATR
 * - Premium breaks 3-candle high + above option VWAP
 * 
 * BULLISH (CE BUY):
 * - Spot > VWAP, EMA9 > EMA21
 * - Two bullish candles → break day high
 * - Candle range > 1.2 × ATR
 * - Premium breaks 3-candle high + above option VWAP
 */

export interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OptionCandle extends Candle {
  // Option-specific premium data
}

export interface OIData {
  ceOI: number;
  peOI: number;
  pcr: number;
  ceOIChange: number; // Percentage change
  peOIChange: number; // Percentage change
  pcrChange: number;  // Percentage change
}

export interface SpotMarketData {
  currentPrice: number;
  vwap: number;
  ema9: number;
  ema21: number;
  atr14: number;
  dayHigh: number;
  dayLow: number;
  candles: Candle[];
}

export interface OptionMarketData {
  currentPremium: number;
  optionVwap: number;
  candles: OptionCandle[];
}

export interface CandleAnalysis {
  isBullish: boolean;
  isBearish: boolean;
  range: number;
  rangePercent: number;
}

export interface ConsecutiveCandlePattern {
  hasTwoBullish: boolean;
  hasTwoBearish: boolean;
  bullishCount: number;
  bearishCount: number;
}

export interface BreakoutDetection {
  breaksDayHigh: boolean;
  breaksDayLow: boolean;
  highDistance: number;
  lowDistance: number;
}

export interface OIConfirmation {
  isConfirmed: boolean;
  confirmationCount: number;
  ceOIIncreasing: boolean;
  peOIIncreasing: boolean;
  ceOIUnwinding: boolean;
  peOIUnwinding: boolean;
  pcrDecreasing: boolean;
  pcrIncreasing: boolean;
}

export interface OptionEntryValidation {
  isPremiumAboveVwap: boolean;
  breaksThreeCandleHigh: boolean;
  volumeAboveAverage: boolean;
  allConditionsMet: boolean;
  highestThreeCandles: number;
  avgVolume: number;
}

export interface AfternoonVwapSetup {
  signal: "BUY_CE" | "BUY_PE" | "NONE";
  entryPrice: number;
  stopLoss: number;
  targets: number[]; // [T1, T2, T3]
  confidenceScore: number;
  reason: string;
  oiConfirmation?: OIConfirmation;
}

export interface AfternoonVwapSignal {
  isValid: boolean;
  setup: AfternoonVwapSetup | null;
  failureReasons: string[];
}

export class AfternoonVwapMomentumEngine {
  private static readonly STOP_LOSS_POINTS = 10;
  private static readonly TARGET_MULTIPLIERS = [1.5, 3, 5]; // R multiples
  private static readonly ATR_MULTIPLIER = 1.2;
  private static readonly MIN_OI_CONFIRMATIONS = 2;
  private static readonly VOLUME_LOOKBACK = 5;
  private static readonly HIGH_LOOKBACK = 3;

  /**
   * Check if current time is within trading window (13:45 - 15:10 IST)
   */
  static isWithinTradingWindow(currentTime: Date): boolean {
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    const timeInMinutes = hours * 60 + minutes;

    const startTime = 13 * 60 + 45; // 13:45
    const endTime = 15 * 60 + 10;   // 15:10

    return timeInMinutes >= startTime && timeInMinutes <= endTime;
  }

  /**
   * Analyze single candle characteristics
   */
  static analyzeCandle(candle: Candle): CandleAnalysis {
    const isBullish = candle.close > candle.open;
    const isBearish = candle.close < candle.open;
    const range = candle.high - candle.low;
    const rangePercent = (range / candle.close) * 100;

    return {
      isBullish,
      isBearish,
      range,
      rangePercent,
    };
  }

  /**
   * Check for consecutive candle patterns
   */
  static analyzeConsecutiveCandles(candles: Candle[]): ConsecutiveCandlePattern {
    if (candles.length < 2) {
      return {
        hasTwoBullish: false,
        hasTwoBearish: false,
        bullishCount: 0,
        bearishCount: 0,
      };
    }

    const lastTwo = candles.slice(-2);
    const bullishCount = lastTwo.filter(c => c.close > c.open).length;
    const bearishCount = lastTwo.filter(c => c.close < c.open).length;

    return {
      hasTwoBullish: bullishCount === 2,
      hasTwoBearish: bearishCount === 2,
      bullishCount,
      bearishCount,
    };
  }

  /**
   * Detect day high/low breakout
   */
  static detectBreakout(
    currentPrice: number,
    currentHigh: number,
    currentLow: number,
    dayHigh: number,
    dayLow: number
  ): BreakoutDetection {
    return {
      breaksDayHigh: currentHigh > dayHigh,
      breaksDayLow: currentLow < dayLow,
      highDistance: currentHigh - dayHigh,
      lowDistance: dayLow - currentLow,
    };
  }

  /**
   * Validate ATR expansion condition
   */
  static validateATRExpansion(candleRange: number, atr14: number): boolean {
    return candleRange > (atr14 * this.ATR_MULTIPLIER);
  }

  /**
   * Analyze OI data for confirmations (optional but boosts confidence)
   */
  static analyzeOIConfirmation(
    oiData: OIData | null,
    direction: "BEARISH" | "BULLISH"
  ): OIConfirmation {
    if (!oiData) {
      return {
        isConfirmed: false,
        confirmationCount: 0,
        ceOIIncreasing: false,
        peOIIncreasing: false,
        ceOIUnwinding: false,
        peOIUnwinding: false,
        pcrDecreasing: false,
        pcrIncreasing: false,
      };
    }

    const ceOIIncreasing = oiData.ceOIChange > 5;
    const peOIIncreasing = oiData.peOIChange > 5;
    const ceOIUnwinding = oiData.ceOIChange < -5;
    const peOIUnwinding = oiData.peOIChange < -5;
    const pcrDecreasing = oiData.pcrChange < -3;
    const pcrIncreasing = oiData.pcrChange > 3;

    let confirmationCount = 0;

    if (direction === "BEARISH") {
      // For PE BUY: CE OI increasing, PE OI unwinding, PCR decreasing
      if (ceOIIncreasing) confirmationCount++;
      if (peOIUnwinding) confirmationCount++;
      if (pcrDecreasing) confirmationCount++;
    } else {
      // For CE BUY: PE OI increasing, CE OI unwinding, PCR increasing
      if (peOIIncreasing) confirmationCount++;
      if (ceOIUnwinding) confirmationCount++;
      if (pcrIncreasing) confirmationCount++;
    }

    return {
      isConfirmed: confirmationCount >= this.MIN_OI_CONFIRMATIONS,
      confirmationCount,
      ceOIIncreasing,
      peOIIncreasing,
      ceOIUnwinding,
      peOIUnwinding,
      pcrDecreasing,
      pcrIncreasing,
    };
  }

  /**
   * Validate option chart entry conditions
   */
  static validateOptionEntry(optionData: OptionMarketData): OptionEntryValidation {
    const { currentPremium, optionVwap, candles } = optionData;

    // Condition 1: Premium > option VWAP
    const isPremiumAboveVwap = currentPremium > optionVwap;

    // Condition 2: Premium breaks last 3-candle high
    const lastThree = candles.slice(-this.HIGH_LOOKBACK);
    const highestThreeCandles = lastThree.length > 0 
      ? Math.max(...lastThree.map(c => c.high))
      : 0;
    const breaksThreeCandleHigh = currentPremium > highestThreeCandles;

    // Condition 3: Volume > previous 5-candle average
    const lastFive = candles.slice(-this.VOLUME_LOOKBACK);
    const avgVolume = lastFive.length > 0
      ? lastFive.reduce((sum, c) => sum + c.volume, 0) / lastFive.length
      : 0;
    const currentVolume = candles[candles.length - 1]?.volume || 0;
    const volumeAboveAverage = currentVolume > avgVolume;

    return {
      isPremiumAboveVwap,
      breaksThreeCandleHigh,
      volumeAboveAverage,
      allConditionsMet: isPremiumAboveVwap && breaksThreeCandleHigh && volumeAboveAverage,
      highestThreeCandles,
      avgVolume,
    };
  }

  /**
   * Calculate confidence score
   */
  static calculateConfidence(
    oiConfirmation: OIConfirmation,
    atr14: number,
    candles: Candle[]
  ): number {
    let confidence = 60; // Base

    // +10 if OI confirmation present (2+ confirmations)
    if (oiConfirmation.isConfirmed) {
      confidence += 10;
    }

    // +10 if ATR > 1.5 × ATR average
    if (candles.length >= 20) {
      const recentATRs: number[] = [];
      for (let i = candles.length - 20; i < candles.length; i++) {
        if (i >= 14) {
          // Calculate ATR for each point (simplified)
          const range = candles[i].high - candles[i].low;
          recentATRs.push(range);
        }
      }
      const avgATR = recentATRs.reduce((sum, val) => sum + val, 0) / recentATRs.length;
      if (atr14 > avgATR * 1.5) {
        confidence += 10;
      }
    }

    return Math.min(80, confidence);
  }

  /**
   * Generate BEARISH setup (PE BUY)
   */
  static generateBearishSetup(
    spotData: SpotMarketData,
    optionData: OptionMarketData,
    oiData: OIData | null,
    currentTime: Date
  ): AfternoonVwapSignal {
    const failureReasons: string[] = [];

    // Time filter
    if (!this.isWithinTradingWindow(currentTime)) {
      failureReasons.push("Outside trading window (13:45 - 15:10)");
      return { isValid: false, setup: null, failureReasons };
    }

    // Condition 1: Spot < VWAP
    if (spotData.currentPrice >= spotData.vwap) {
      failureReasons.push("Spot price not below VWAP");
    }

    // Condition 2: EMA9 < EMA21
    if (spotData.ema9 >= spotData.ema21) {
      failureReasons.push("EMA9 not below EMA21");
    }

    // Condition 3: Two consecutive bearish candles
    const pattern = this.analyzeConsecutiveCandles(spotData.candles);
    if (!pattern.hasTwoBearish) {
      failureReasons.push(`Only ${pattern.bearishCount}/2 consecutive bearish candles`);
    }

    // Condition 4: Current candle breaks day low
    const currentCandle = spotData.candles[spotData.candles.length - 1];
    const breakout = this.detectBreakout(
      spotData.currentPrice,
      currentCandle.high,
      currentCandle.low,
      spotData.dayHigh,
      spotData.dayLow
    );
    if (!breakout.breaksDayLow) {
      failureReasons.push("Current candle does not break day low");
    }

    // Condition 5: Candle range > 1.2 × ATR
    const candleAnalysis = this.analyzeCandle(currentCandle);
    const atrExpansion = this.validateATRExpansion(candleAnalysis.range, spotData.atr14);
    if (!atrExpansion) {
      failureReasons.push(`Candle range ${candleAnalysis.range.toFixed(2)} < 1.2×ATR (${(spotData.atr14 * this.ATR_MULTIPLIER).toFixed(2)})`);
    }

    // Option entry validation
    const optionEntry = this.validateOptionEntry(optionData);
    if (!optionEntry.isPremiumAboveVwap) {
      failureReasons.push("Premium not above option VWAP");
    }
    if (!optionEntry.breaksThreeCandleHigh) {
      failureReasons.push("Premium does not break last 3-candle high");
    }
    if (!optionEntry.volumeAboveAverage) {
      failureReasons.push("Volume not above 5-candle average");
    }

    // Check if all mandatory conditions met
    if (failureReasons.length > 0) {
      return { isValid: false, setup: null, failureReasons };
    }

    // OI confirmation (optional)
    const oiConfirmation = this.analyzeOIConfirmation(oiData, "BEARISH");

    // Calculate targets
    const entryPrice = optionData.currentPremium;
    const stopLoss = entryPrice - this.STOP_LOSS_POINTS;
    const targets = this.TARGET_MULTIPLIERS.map(mult => 
      entryPrice + (this.STOP_LOSS_POINTS * mult)
    );

    // Calculate confidence
    const confidenceScore = this.calculateConfidence(
      oiConfirmation,
      spotData.atr14,
      spotData.candles
    );

    const setup: AfternoonVwapSetup = {
      signal: "BUY_PE",
      entryPrice,
      stopLoss,
      targets,
      confidenceScore,
      reason: `Bearish breakdown: Day low broken at ${spotData.currentPrice.toFixed(2)}, premium ${entryPrice.toFixed(2)} above VWAP with volume confirmation`,
      oiConfirmation,
    };

    return {
      isValid: true,
      setup,
      failureReasons: [],
    };
  }

  /**
   * Generate BULLISH setup (CE BUY)
   */
  static generateBullishSetup(
    spotData: SpotMarketData,
    optionData: OptionMarketData,
    oiData: OIData | null,
    currentTime: Date
  ): AfternoonVwapSignal {
    const failureReasons: string[] = [];

    // Time filter
    if (!this.isWithinTradingWindow(currentTime)) {
      failureReasons.push("Outside trading window (13:45 - 15:10)");
      return { isValid: false, setup: null, failureReasons };
    }

    // Condition 1: Spot > VWAP
    if (spotData.currentPrice <= spotData.vwap) {
      failureReasons.push("Spot price not above VWAP");
    }

    // Condition 2: EMA9 > EMA21
    if (spotData.ema9 <= spotData.ema21) {
      failureReasons.push("EMA9 not above EMA21");
    }

    // Condition 3: Two consecutive bullish candles
    const pattern = this.analyzeConsecutiveCandles(spotData.candles);
    if (!pattern.hasTwoBullish) {
      failureReasons.push(`Only ${pattern.bullishCount}/2 consecutive bullish candles`);
    }

    // Condition 4: Current candle breaks day high
    const currentCandle = spotData.candles[spotData.candles.length - 1];
    const breakout = this.detectBreakout(
      spotData.currentPrice,
      currentCandle.high,
      currentCandle.low,
      spotData.dayHigh,
      spotData.dayLow
    );
    if (!breakout.breaksDayHigh) {
      failureReasons.push("Current candle does not break day high");
    }

    // Condition 5: Candle range > 1.2 × ATR
    const candleAnalysis = this.analyzeCandle(currentCandle);
    const atrExpansion = this.validateATRExpansion(candleAnalysis.range, spotData.atr14);
    if (!atrExpansion) {
      failureReasons.push(`Candle range ${candleAnalysis.range.toFixed(2)} < 1.2×ATR (${(spotData.atr14 * this.ATR_MULTIPLIER).toFixed(2)})`);
    }

    // Option entry validation
    const optionEntry = this.validateOptionEntry(optionData);
    if (!optionEntry.isPremiumAboveVwap) {
      failureReasons.push("Premium not above option VWAP");
    }
    if (!optionEntry.breaksThreeCandleHigh) {
      failureReasons.push("Premium does not break last 3-candle high");
    }
    if (!optionEntry.volumeAboveAverage) {
      failureReasons.push("Volume not above 5-candle average");
    }

    // Check if all mandatory conditions met
    if (failureReasons.length > 0) {
      return { isValid: false, setup: null, failureReasons };
    }

    // OI confirmation (optional)
    const oiConfirmation = this.analyzeOIConfirmation(oiData, "BULLISH");

    // Calculate targets
    const entryPrice = optionData.currentPremium;
    const stopLoss = entryPrice - this.STOP_LOSS_POINTS;
    const targets = this.TARGET_MULTIPLIERS.map(mult => 
      entryPrice + (this.STOP_LOSS_POINTS * mult)
    );

    // Calculate confidence
    const confidenceScore = this.calculateConfidence(
      oiConfirmation,
      spotData.atr14,
      spotData.candles
    );

    const setup: AfternoonVwapSetup = {
      signal: "BUY_CE",
      entryPrice,
      stopLoss,
      targets,
      confidenceScore,
      reason: `Bullish breakout: Day high broken at ${spotData.currentPrice.toFixed(2)}, premium ${entryPrice.toFixed(2)} above VWAP with volume confirmation`,
      oiConfirmation,
    };

    return {
      isValid: true,
      setup,
      failureReasons: [],
    };
  }

  /**
   * Main analysis function - checks both BULLISH and BEARISH setups
   */
  static analyze(
    spotData: SpotMarketData,
    optionDataCE: OptionMarketData,
    optionDataPE: OptionMarketData,
    oiData: OIData | null = null,
    currentTime: Date = new Date()
  ): AfternoonVwapSignal {
    // Validate minimum data
    if (spotData.candles.length < 2) {
      return {
        isValid: false,
        setup: null,
        failureReasons: ["Insufficient candle data (minimum 2 required)"],
      };
    }

    // Try BEARISH setup (PE BUY)
    const bearishSignal = this.generateBearishSetup(spotData, optionDataPE, oiData, currentTime);
    if (bearishSignal.isValid) {
      return bearishSignal;
    }

    // Try BULLISH setup (CE BUY)
    const bullishSignal = this.generateBullishSetup(spotData, optionDataCE, oiData, currentTime);
    if (bullishSignal.isValid) {
      return bullishSignal;
    }

    // No valid signal
    return {
      isValid: false,
      setup: null,
      failureReasons: [...bearishSignal.failureReasons, ...bullishSignal.failureReasons],
    };
  }

  /**
   * Check trailing stop conditions after entry
   */
  static checkTrailingStop(
    currentPremium: number,
    entryPrice: number,
    stopLoss: number,
    targets: number[],
    optionEma9: number,
    targetsHit: number // 0, 1, 2, or 3
  ): {
    newStopLoss: number;
    exitSignal: boolean;
    reason: string;
  } {
    let newStopLoss = stopLoss;
    let exitSignal = false;
    let reason = "";

    // After T1 hit → SL to cost
    if (targetsHit >= 1 && newStopLoss < entryPrice) {
      newStopLoss = entryPrice;
      reason = "T1 hit - SL moved to cost";
    }

    // After T2 hit → Trail to T1
    if (targetsHit >= 2 && newStopLoss < targets[0]) {
      newStopLoss = targets[0];
      reason = "T2 hit - SL trailed to T1";
    }

    // Exit if premium closes below EMA(9)
    if (currentPremium < optionEma9) {
      exitSignal = true;
      reason = `Premium ${currentPremium.toFixed(2)} closed below EMA9 ${optionEma9.toFixed(2)}`;
    }

    return {
      newStopLoss,
      exitSignal,
      reason,
    };
  }
}
