/**
 * RISK ENGINE
 * Comprehensive risk management and position sizing
 *
 * Rules:
 * - Stop loss = ORB opposite + 0.05% buffer
 * - Targets:
 *   T1 = 1R
 *   T2 = 2R
 *   T3 = 3R
 * - Trail using EMA20 after 1R hit
 * - Capital protection and kill switch logic
 */

export interface RiskConfig {
  maxRiskPerTrade: number; // % of capital
  maxDrawdown: number; // % of capital
  maxOpenPositions: number;
  dailyLossLimit: number; // % of capital
  capitalProtectionLevel: number; // % drawdown before kill switch
}

export interface PositionSize {
  quantity: number;
  costPerLot: number;
  totalCost: number;
  maxRiskAmount: number;
  riskPercent: number;
}

export interface RiskLevels {
  entryPrice: number;
  stopLoss: number;
  target1: number; // 1R
  target2: number; // 2R
  target3: number; // 3R
  riskRewardRatio: number;
  riskAmount: number;
  maxProfit: number;
}

export interface TrailingStop {
  active: boolean;
  activationLevel: number; // Price level to activate trailing stop
  stopPrice: number; // Current trailing stop price
  lastEma20: number;
}

export class RiskEngine {
  /**
   * Calculate position size based on risk
   */
  static calculatePositionSize(
    capital: number,
    entryPrice: number,
    stopLoss: number,
    config: RiskConfig,
    strikePrice?: number // For options pricing influence
  ): PositionSize {
    const riskAmount = Math.abs(entryPrice - stopLoss);
    if (riskAmount === 0) {
      return {
        quantity: 0,
        costPerLot: entryPrice,
        totalCost: 0,
        maxRiskAmount: 0,
        riskPercent: 0,
      };
    }

    const maxRiskAmount = (capital * config.maxRiskPerTrade) / 100;
    const quantity = Math.floor(maxRiskAmount / riskAmount);

    const totalCost = quantity * entryPrice;
    const actualRiskPercent = (riskAmount * quantity / capital) * 100;

    return {
      quantity: Math.max(1, quantity),
      costPerLot: entryPrice,
      totalCost,
      maxRiskAmount,
      riskPercent: Math.min(config.maxRiskPerTrade, actualRiskPercent),
    };
  }

  /**
   * Generate multi-target risk levels
   */
  static generateRiskLevels(
    direction: "LONG" | "SHORT",
    entryPrice: number,
    stopLoss: number,
    tradeTarget?: number // Override T1 if provided
  ): RiskLevels {
    const riskAmount = Math.abs(entryPrice - stopLoss);
    const maxProfit = riskAmount * 3; // Use 3R as max profit target

    let t1, t2, t3;

    if (direction === "LONG") {
      t1 = tradeTarget || entryPrice + riskAmount;
      t2 = entryPrice + riskAmount * 2;
      t3 = entryPrice + riskAmount * 3;
    } else {
      t1 = tradeTarget || entryPrice - riskAmount;
      t2 = entryPrice - riskAmount * 2;
      t3 = entryPrice - riskAmount * 3;
    }

    return {
      entryPrice,
      stopLoss,
      target1: t1,
      target2: t2,
      target3: t3,
      riskRewardRatio: riskAmount > 0 ? (t1 - entryPrice) / riskAmount : 1,
      riskAmount,
      maxProfit,
    };
  }

  /**
   * Check if position should trigger kill switch
   */
  static checkKillSwitch(
    capital: number,
    currentDrawdown: number,
    dailyLoss: number,
    config: RiskConfig
  ): { triggered: boolean; reason: string } {
    const drawdownPercent = (currentDrawdown / capital) * 100;
    const dailyLossPercent = (dailyLoss / capital) * 100;

    if (drawdownPercent >= config.capitalProtectionLevel) {
      return {
        triggered: true,
        reason: `Drawdown limit hit: ${drawdownPercent.toFixed(2)}% >= ${config.capitalProtectionLevel}%`,
      };
    }

    if (dailyLossPercent >= config.dailyLossLimit) {
      return {
        triggered: true,
        reason: `Daily loss limit hit: ${dailyLossPercent.toFixed(2)}% >= ${config.dailyLossLimit}%`,
      };
    }

    return { triggered: false, reason: "Normal risk parameters" };
  }

  /**
   * Calculate trailing stop using EMA20
   */
  static updateTrailingStop(
    direction: "LONG" | "SHORT",
    currentPrice: number,
    ema20: number,
    riskLevels: RiskLevels,
    trailingStop: TrailingStop
  ): TrailingStop {
    // Activate trailing stop after 1R profit
    const hasHit1R =
      direction === "LONG"
        ? currentPrice >= riskLevels.target1
        : currentPrice <= riskLevels.target1;

    if (!hasHit1R) {
      return { ...trailingStop, active: false };
    }

    if (!trailingStop.active) {
      // First activation
      const stopPrice =
        direction === "LONG"
          ? Math.max(ema20, riskLevels.entryPrice + riskLevels.riskAmount * 0.5)
          : Math.min(ema20, riskLevels.entryPrice - riskLevels.riskAmount * 0.5);

      return {
        active: true,
        activationLevel: currentPrice,
        stopPrice,
        lastEma20: ema20,
      };
    }

    // Update trailing stop
    let newStopPrice = trailingStop.stopPrice;

    if (direction === "LONG") {
      // For longs, move stop up with EMA20
      newStopPrice = Math.max(trailingStop.stopPrice, ema20 - 5); // Keep slight buffer
    } else {
      // For shorts, move stop down with EMA20
      newStopPrice = Math.min(trailingStop.stopPrice, ema20 + 5);
    }

    // Ensure we never move stop closer than entry
    if (direction === "LONG" && newStopPrice >= riskLevels.entryPrice) {
      newStopPrice = riskLevels.entryPrice - 1;
    }
    if (direction === "SHORT" && newStopPrice <= riskLevels.entryPrice) {
      newStopPrice = riskLevels.entryPrice + 1;
    }

    return {
      active: true,
      activationLevel: trailingStop.activationLevel,
      stopPrice: newStopPrice,
      lastEma20: ema20,
    };
  }

  /**
   * Calculate current P&L
   */
  static calculatePnl(
    direction: "LONG" | "SHORT",
    entryPrice: number,
    currentPrice: number,
    quantity: number,
    pointSize: number = 1 // For calculating rupee value
  ): { pnlPoints: number; pnlRupees: number; pnlPercent: number } {
    const pnlPoints =
      direction === "LONG"
        ? currentPrice - entryPrice
        : entryPrice - currentPrice;

    const pnlRupees = pnlPoints * quantity * pointSize;
    const pnlPercent = ((pnlPoints / entryPrice) * 100);

    return { pnlPoints, pnlRupees, pnlPercent };
  }

  /**
   * Get risk metrics summary
   */
  static getRiskMetrics(
    capital: number,
    openPositions: number,
    totalRiskAmount: number,
    dailyLoss: number,
    config: RiskConfig
  ): {
    portfolioRiskPercent: number;
    riskReward: string;
    positionCount: string;
    dailyLossPercent: number;
    remainingCapital: number;
  } {
    return {
      portfolioRiskPercent: (totalRiskAmount / capital) * 100,
      riskReward: `${openPositions} positions`,
      positionCount: `${openPositions}/${config.maxOpenPositions}`,
      dailyLossPercent: (dailyLoss / capital) * 100,
      remainingCapital: capital - totalRiskAmount,
    };
  }
}
