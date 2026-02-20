/**
 * STRATEGY ROUTER
 * Routes trades to appropriate strategy based on market regime
 *
 * - TRENDING → Use ORB
 * - SIDEWAYS → Use VWAP Reversion
 * - BREAKOUT → ORB aggressive
 * - VOLATILE → Reduce size
 */

import type { MarketRegime } from "./regime-ai";

export type StrategyType = "ORB" | "VWAP_REVERSION" | "HYBRID" | "NONE";

export interface StrategyRoute {
  strategy: StrategyType;
  regime: MarketRegime;
  sizeMultiplier: number;
  aggressiveness: "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE";
  confidence: number;
  rationale: string;
}

export interface RouterState {
  currentRegime: MarketRegime;
  vixLevel: number;
  volatilityFilter: "LOW" | "NORMAL" | "HIGH" | "EXTREME";
  marketBias: "BULLISH" | "BEARISH" | "NEUTRAL";
  timestamp: number;
}

export class StrategyRouter {
  /**
   * Route to appropriate strategy based on regime and market conditions
   */
  static routeStrategy(
    regime: MarketRegime,
    vixLevel: number,
    marketBias: "BULLISH" | "BEARISH" | "NEUTRAL"
  ): StrategyRoute {
    let strategy: StrategyType;
    let sizeMultiplier: number;
    let aggressiveness: "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE";
    let confidence: number;
    let rationale: string;

    // Determine volatility filter
    const volatilityFilter = this.getVolatilityFilter(vixLevel);

    // Route based on regime
    if (regime === "TRENDING") {
      strategy = "ORB";
      aggressiveness = "MODERATE";
      confidence = 75;
      rationale = "TRENDING regime: use ORB strategy with trend confirmation";

      // Adjust for VIX
      if (volatilityFilter === "EXTREME") {
        sizeMultiplier = 0.5;
        confidence -= 10;
        rationale += " (VIX extreme - reduced size)";
      } else if (volatilityFilter === "HIGH") {
        sizeMultiplier = 0.7;
        confidence -= 5;
        rationale += " (VIX high - moderate size reduction)";
      } else {
        sizeMultiplier = 1.0;
      }

      // Boost confidence with aligned bias
      if (marketBias !== "NEUTRAL") {
        confidence += 10;
        rationale += `, bias-aligned`;
      }
    } else if (regime === "SIDEWAYS") {
      strategy = "VWAP_REVERSION";
      aggressiveness = "CONSERVATIVE";
      confidence = 65;
      rationale = "SIDEWAYS regime: use VWAP mean reversion, focus on range";

      if (volatilityFilter === "LOW") {
        sizeMultiplier = 0.8;
        confidence -= 10;
        rationale += " (VIX very low - limited volatility)";
      } else if (volatilityFilter === "EXTREME") {
        sizeMultiplier = 0.4;
        confidence -= 20;
        rationale += " (VIX extreme - too volatile for range trades)";
      } else {
        sizeMultiplier = 1.0;
      }
    } else if (regime === "BREAKOUT") {
      strategy = "ORB";
      aggressiveness = "AGGRESSIVE";
      confidence = 80;
      rationale = "BREAKOUT regime: use aggressive ORB, maximum setup confirmation";

      if (volatilityFilter === "EXTREME") {
        sizeMultiplier = 0.6;
        confidence -= 5;
        aggressiveness = "MODERATE";
      } else if (volatilityFilter === "HIGH") {
        sizeMultiplier = 0.8;
      } else {
        sizeMultiplier = 1.2; // Increase size for clean breakouts
      }

      // Breakouts should be aligned with bias
      if (marketBias === "NEUTRAL") {
        confidence -= 15;
        rationale += " (neutral bias - requires extra confirmation)";
      } else {
        confidence += 5;
      }
    } else {
      strategy = "NONE";
      sizeMultiplier = 0;
      aggressiveness = "CONSERVATIVE";
      confidence = 0;
      rationale = "Unknown regime - no strategy assigned";
    }

    return {
      strategy,
      regime,
      sizeMultiplier: Math.min(1.5, Math.max(0, sizeMultiplier)),
      aggressiveness,
      confidence: Math.min(100, Math.max(0, confidence)),
      rationale,
    };
  }

  /**
   * Determine volatility filter level based on VIX
   */
  private static getVolatilityFilter(vixLevel: number): "LOW" | "NORMAL" | "HIGH" | "EXTREME" {
    if (vixLevel < 11) return "LOW";
    if (vixLevel < 18) return "NORMAL";
    if (vixLevel < 30) return "HIGH";
    return "EXTREME";
  }

  /**
   * Get strategy-specific parameters
   */
  static getStrategyParams(
    strategy: StrategyType,
    routes: StrategyRoute
  ): Record<string, any> {
    const baseParams = {
      maxDrawdown: 5, // %
      profitTarget: 2, // %
      riskPerTrade: 1, // %
    };

    if (strategy === "ORB") {
      return {
        ...baseParams,
        minBreakoutStrengthScore: 70,
        orbBufferPercent: 0.05,
        useVwapConfirmation: true,
        useEmaAlignment: true,
        volumeSpikeMultiplier: 1.8,
        trailingStopActivation: "1R", // Use EMA20 after 1R profit
      };
    } else if (strategy === "VWAP_REVERSION") {
      return {
        ...baseParams,
        vwapDistancePercent: 0.5,
        rsiOversold: 35,
        rsiOverbought: 65,
        minRiskRewardRatio: 1.2,
        targetRr: 1.0, // Take profits at VWAP
      };
    } else if (strategy === "HYBRID") {
      return {
        ...baseParams,
        orbWeight: 0.6,
        vwapWeight: 0.4,
        minScore: 65,
      };
    }

    return baseParams;
  }

  /**
   * Check if strategy trading should be suspended
   */
  static shouldSuspendTrading(
    regime: MarketRegime,
    vixLevel: number,
    isMarketOpen: boolean
  ): { suspended: boolean; reason: string } {
    if (!isMarketOpen) {
      return { suspended: true, reason: "Market closed" };
    }

    if (vixLevel > 50) {
      return { suspended: true, reason: "VIX critically high (>50) - market panic" };
    }

    // Don't suspend based on regime alone - all regimes are tradeable
    return { suspended: false, reason: "Normal trading conditions" };
  }
}
