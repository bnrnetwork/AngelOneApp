/**
 * MULTI-STRATEGY ORCHESTRATOR
 * Coordinates all strategy engines for production-grade trading
 *
 * Integrates:
 * 1. Market Bias Engine
 * 2. Volatility Filter
 * 3. ORB Engine
 * 4. VWAP Reversion Engine
 * 5. Breakout Strength Scorer
 * 6. Regime AI
 * 7. Strategy Router
 * 8. Risk Engine
 * 9. OI Confirmation Engine
 */

import { MarketBiasEngine, type BiasResult } from "./market-bias-engine";
import { VolatilityFilter } from "./volatility-filter";
import { OrbEngine, type ORBRange, type ORBValidation } from "./orb-engine";
import {
  BreakoutStrengthScorer,
  type BreakoutStrengthScore,
  type OIShiftData,
} from "./breakout-strength-scorer";
import {
  VwapReversionEngine,
  type VwapReversionSignal,
} from "./vwap-reversion-engine";
import { RegimeAI, type RegimeResult, type RegimeFeatures } from "./regime-ai";
import { StrategyRouter, type StrategyRoute } from "./strategy-router";
import {
  RiskEngine,
  type RiskConfig,
  type RiskLevels,
  type PositionSize,
} from "./risk-engine";
import {
  OiConfirmationEngine,
  type OILevel,
  type OIConfirmation,
} from "./oi-confirmation-engine";

export interface MarketSnapshot {
  timestamp: number;
  currentPrice: number;
  vwap: number;
  ema20: number;
  ema50: number;
  rsi: number;
  atr5Min: number;
  atrAverage: number;
  volume: number;
  volumeAverage: number;
  vixLevel: number;
}

export interface CandeData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PreviousLevels {
  high: number;
  low: number;
  close: number;
  openTime: string;
}

export interface TradeSignal {
  signalId: string;
  strategy: "ORB" | "VWAP_REVERSION" | "HYBRID";
  direction: "LONG" | "SHORT";
  entryPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  confidence: number;
  regimeConfidence: number;
  riskRewardRatio: number;
  positionSize: PositionSize;
  biasAlignment: "aligned" | "neutral" | "opposed";
  regimeType: string;
  reasoning: string;
  timestamp: number;
}

export interface OrchestratorState {
  marketBias: BiasResult;
  volatilityFilter: any;
  orbValidation: ORBValidation | null;
  breakoutScore: BreakoutStrengthScore | null;
  regimeAnalysis: RegimeResult;
  strategyRoute: StrategyRoute;
  riskMetrics: any;
  oiConfirmation: OIConfirmation | null;
}

export class MultiStrategyOrchestrator {
  private regimeAi: RegimeAI;
  private riskConfig: RiskConfig;

  constructor(riskConfig: RiskConfig, regimeModelPath?: string) {
    this.regimeAi = new RegimeAI(regimeModelPath);
    this.riskConfig = riskConfig;
  }

  /**
   * Initialize ONNX model
   */
  async initialize(): Promise<boolean> {
    return await this.regimeAi.loadModel();
  }

  /**
   * Run complete analysis and generate trade signal
   */
  async analyzeAndGenerateSignal(
    marketSnapshot: MarketSnapshot,
    previousLevels: PreviousLevels,
    first15MinCandle: CandeData,
    recentCandles: CandeData[],
    previousOI: OILevel | null,
    currentOI: OILevel | null,
    capital: number
  ): Promise<{ signal: TradeSignal | null; state: OrchestratorState }> {
    // 1. Market Bias Analysis
    const biasResult = MarketBiasEngine.calculateBias(
      marketSnapshot.currentPrice,
      previousLevels
    );

    // 2. Volatility Filter
    const volFilter = VolatilityFilter.evaluateVIX(marketSnapshot.vixLevel);

    // 3. ORB Validation
    const orbValidation = OrbEngine.validateOrbSetup(
      first15MinCandle,
      marketSnapshot.atr5Min,
      marketSnapshot.currentPrice,
      previousLevels.close,
      recentCandles
    );

    // 4. Breakout Strength Score (if ORB valid)
    let breakoutScore: BreakoutStrengthScore | null = null;
    if (orbValidation.isValid) {
      const oiData: OIShiftData = {
        callOI: currentOI?.callOI || 0,
        putOI: currentOI?.putOI || 0,
        prevCallOI: previousOI?.callOI || 0,
        prevPutOI: previousOI?.putOI || 0,
      };

      breakoutScore = BreakoutStrengthScorer.calculateScore(
        "LONG", // Will determine direction later
        marketSnapshot.volume,
        marketSnapshot.volumeAverage,
        marketSnapshot.currentPrice,
        marketSnapshot.vwap,
        marketSnapshot.ema20,
        marketSnapshot.ema50,
        marketSnapshot.atr5Min,
        marketSnapshot.atrAverage,
        oiData
      );
    }

    // 5. Regime Analysis (AI or heuristic)
    const regimeFeatures: RegimeFeatures = {
      atrPercent: (marketSnapshot.atr5Min / marketSnapshot.currentPrice) * 100,
      ema20Slope: this.calculateEmaSlope(marketSnapshot.ema20, recentCandles),
      priceDistanceFromVwap:
        ((marketSnapshot.currentPrice - marketSnapshot.vwap) /
          marketSnapshot.vwap) *
        100,
      rsi: marketSnapshot.rsi,
      orbRangePercent: orbValidation.isValid
        ? 1.0
        : 0, // Will refine
      volumeSpikeRatio: marketSnapshot.volume / marketSnapshot.volumeAverage,
      indiaVix: marketSnapshot.vixLevel,
    };

    const regimeAnalysis = await this.regimeAi.predict(regimeFeatures);

    // 6. Strategy Router
    const strategyRoute = StrategyRouter.routeStrategy(
      regimeAnalysis.regime,
      marketSnapshot.vixLevel,
      biasResult.bias
    );

    // 7. OI Confirmation
    let oiConfirmation: OIConfirmation | null = null;
    if (previousOI && currentOI) {
      oiConfirmation = OiConfirmationEngine.checkLongConfirmation(
        previousOI,
        currentOI
      );
    }

    // Generate signal based on analysis
    const signal = this.generateSignalFromAnalysis(
      marketSnapshot,
      previousLevels,
      first15MinCandle,
      recentCandles,
      biasResult,
      volFilter,
      orbValidation,
      breakoutScore,
      regimeAnalysis,
      strategyRoute,
      oiConfirmation,
      capital
    );

    return {
      signal,
      state: {
        marketBias: biasResult,
        volatilityFilter: volFilter,
        orbValidation,
        breakoutScore,
        regimeAnalysis,
        strategyRoute,
        riskMetrics: signal
          ? {
              riskPercent: signal.positionSize.riskPercent,
              riskAmount: signal.positionSize.maxRiskAmount,
            }
          : null,
        oiConfirmation,
      },
    };
  }

  /**
   * Generate actual trade signal from all analyses
   */
  private generateSignalFromAnalysis(
    market: MarketSnapshot,
    prevLevels: PreviousLevels,
    first15MinCandle: CandeData,
    recentCandles: CandeData[],
    bias: any,
    volFilter: any,
    orbVal: ORBValidation,
    breakoutScore: BreakoutStrengthScore | null,
    regime: RegimeResult,
    route: StrategyRoute,
    oiConf: OIConfirmation | null,
    capital: number
  ): TradeSignal | null {
    // Check if we should trade
    if (!volFilter.shouldTrade) {
      console.log(`Volatility filter blocked trade: ${volFilter.reason}`);
      return null;
    }

    if (route.strategy === "NONE") {
      console.log("No valid strategy route");
      return null;
    }

    // ORB Strategy
    if (route.strategy === "ORB" && orbVal.isValid && breakoutScore) {
      // Determine direction based on bias and confirmation
      const direction =
        bias.bias === "BULLISH" ? "LONG" : bias.bias === "BEARISH" ? "SHORT" : "LONG";

      // Check breakout strength
      if (breakoutScore.totalScore < 70) {
        console.log(
          `Breakout score too low: ${breakoutScore.totalScore}/100`
        );
        return null;
      }

      // Score the direction specifically
      const dirScoreForDirection = BreakoutStrengthScorer.calculateScore(
        direction,
        market.volume,
        market.volumeAverage,
        market.currentPrice,
        market.vwap,
        market.ema20,
        market.ema50,
        market.atr5Min,
        market.atrAverage,
        {
          callOI: oiConf?.callSignal === "UNWINDING" ? 100 : 0,
          putOI: oiConf?.putSignal === "BUILDUP" ? 100 : 0,
          prevCallOI: 100,
          prevPutOI: 100,
        }
      );

      if (dirScoreForDirection.totalScore < 70) return null;

      // Generate ORB levels
      const orbRange = OrbEngine.calculateOrbRange(
        first15MinCandle,
        market.atr5Min,
        market.currentPrice
      );

      const orbSignal = OrbEngine.generateOrbSignal(
        direction,
        orbRange,
        orbRange.high,
        orbRange.low,
        market.currentPrice
      );

      // Check for actual breakout
      if (!OrbEngine.checkBreakout(direction, market.currentPrice, orbRange.high, orbRange.low)) {
        console.log("Waiting for breakout confirmation");
        return null;
      }

      // Calculate position size
      const posSize = RiskEngine.calculatePositionSize(
        capital,
        orbSignal.entryPrice,
        orbSignal.stopLoss,
        this.riskConfig
      );

      if (posSize.quantity === 0) {
        console.log("Insufficient capital for trade");
        return null;
      }

      const biasAlignment = MarketBiasEngine.isAlignedWithBias(
        direction,
        bias.bias
      )
        ? "aligned"
        : bias.bias === "NEUTRAL"
          ? "neutral"
          : "opposed";

      return {
        signalId: `ORB_${Date.now()}_${direction}`,
        strategy: "ORB",
        direction,
        entryPrice: orbSignal.entryPrice,
        stopLoss: orbSignal.stopLoss,
        target1: orbSignal.target1,
        target2: orbSignal.target2,
        target3: orbSignal.target3,
        confidence: Math.round(
          dirScoreForDirection.confidence * route.sizeMultiplier
        ),
        regimeConfidence: Math.round(regime.confidence),
        riskRewardRatio: orbSignal.riskRewardRatio,
        positionSize: posSize,
        biasAlignment,
        regimeType: regime.regime,
        reasoning: `ORB ${direction}: Score ${dirScoreForDirection.totalScore.toFixed(0)}/100, ${regime.reasoning}`,
        timestamp: market.timestamp,
      };
    }

    // VWAP Reversion Strategy
    if (route.strategy === "VWAP_REVERSION") {
      const longReversion = VwapReversionEngine.checkLongReversion(
        market.currentPrice,
        market.vwap,
        market.rsi,
        recentCandles
      );

      let signal: any = null;

      if (longReversion.isValid && longReversion.setup) {
        signal = longReversion.setup;
      } else {
        const shortReversion = VwapReversionEngine.checkShortReversion(
          market.currentPrice,
          market.vwap,
          market.rsi,
          recentCandles
        );

        if (shortReversion.isValid && shortReversion.setup) {
          signal = shortReversion.setup;
        }
      }

      if (!signal) {
        console.log("No valid VWAP reversion setup");
        return null;
      }

      const posSize = RiskEngine.calculatePositionSize(
        capital,
        signal.entryPrice,
        signal.stopLoss,
        this.riskConfig
      );

      if (posSize.quantity === 0) {
        console.log("Insufficient capital for trade");
        return null;
      }

      const riskLevels = RiskEngine.generateRiskLevels(
        signal.direction,
        signal.entryPrice,
        signal.stopLoss,
        signal.target
      );

      return {
        signalId: `VWAP_${Date.now()}_${signal.direction}`,
        strategy: "VWAP_REVERSION",
        direction: signal.direction,
        entryPrice: signal.entryPrice,
        stopLoss: signal.stopLoss,
        target1: riskLevels.target1,
        target2: riskLevels.target2,
        target3: riskLevels.target3,
        regimeConfidence: Math.round(regime.confidence),
        confidence: signal.confidence,
        riskRewardRatio: signal.riskRewardRatio,
        positionSize: posSize,
        biasAlignment: "neutral", // VWAP is neutral
        regimeType: regime.regime,
        reasoning: `VWAP ${signal.direction}: ${signal.reason}`,
        timestamp: market.timestamp,
      };
    }

    return null;
  }

  /**
   * Calculate EMA slope for trend strength
   */
  private calculateEmaSlope(currentEma: number, recentCandles: CandeData[]): number {
    if (recentCandles.length < 2) return 0;

    const lastCandle = recentCandles[recentCandles.length - 1];
    const prevCandle = recentCandles[recentCandles.length - 2];

    // Approximate slope change
    return (currentEma - prevCandle.close) / prevCandle.close;
  }
}
