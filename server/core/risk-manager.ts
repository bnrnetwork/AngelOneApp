import { TradingSignal, RiskMetrics } from "./types";

export interface PositionLimits {
  maxPositions: number;
  maxRiskPerTrade: number;
  maxDailyLoss: number;
  maxCapitalPerTrade: number;
}

export class RiskManager {
  private readonly limits: PositionLimits;
  private accountBalance: number;

  constructor(accountBalance: number, limits?: Partial<PositionLimits>) {
    this.accountBalance = accountBalance;
    this.limits = {
      maxPositions: limits?.maxPositions || 5,
      maxRiskPerTrade: limits?.maxRiskPerTrade || 0.02,
      maxDailyLoss: limits?.maxDailyLoss || 0.05,
      maxCapitalPerTrade: limits?.maxCapitalPerTrade || 0.20,
    };
  }

  calculatePositionSize(signal: TradingSignal): RiskMetrics {
    const riskPerShare = Math.abs(signal.entryPrice - signal.stoploss);
    const riskAmount = this.accountBalance * this.limits.maxRiskPerTrade;

    let positionSize = Math.floor(riskAmount / riskPerShare);

    const maxCapital = this.accountBalance * this.limits.maxCapitalPerTrade;
    const capitalRequired = positionSize * signal.entryPrice;

    if (capitalRequired > maxCapital) {
      positionSize = Math.floor(maxCapital / signal.entryPrice);
    }

    const profit = signal.target1 - signal.entryPrice;
    const riskRewardRatio = Math.abs(profit / riskPerShare);

    const winProbability = this.estimateWinProbability(signal.confidence, riskRewardRatio);

    const expectedValue = (winProbability * profit * positionSize) -
                          ((1 - winProbability) * riskPerShare * positionSize);

    return {
      positionSize,
      riskAmount: positionSize * riskPerShare,
      riskRewardRatio,
      maxLoss: positionSize * riskPerShare,
      winProbability,
      expectedValue,
    };
  }

  private estimateWinProbability(confidence: number, rrRatio: number): number {
    let baseProbability = confidence / 100;

    if (rrRatio >= 2) {
      baseProbability *= 0.95;
    } else if (rrRatio >= 1.5) {
      baseProbability *= 0.90;
    } else if (rrRatio < 1) {
      baseProbability *= 0.70;
    }

    return Math.max(0.1, Math.min(0.9, baseProbability));
  }

  validateSignal(signal: TradingSignal, currentPositions: number, todayLoss: number): {
    isValid: boolean;
    reason: string;
  } {
    if (currentPositions >= this.limits.maxPositions) {
      return {
        isValid: false,
        reason: `Max positions limit reached (${this.limits.maxPositions})`
      };
    }

    const maxDailyLossAmount = this.accountBalance * this.limits.maxDailyLoss;
    if (todayLoss >= maxDailyLossAmount) {
      return {
        isValid: false,
        reason: `Daily loss limit reached (${(this.limits.maxDailyLoss * 100).toFixed(1)}%)`
      };
    }

    const riskPerShare = Math.abs(signal.entryPrice - signal.stoploss);
    const riskPercent = (riskPerShare / signal.entryPrice) * 100;

    if (riskPercent > 50) {
      return {
        isValid: false,
        reason: `Risk per share too high (${riskPercent.toFixed(1)}%)`
      };
    }

    const profit = signal.target1 - signal.entryPrice;
    const rrRatio = Math.abs(profit / riskPerShare);

    if (rrRatio < 1) {
      return {
        isValid: false,
        reason: `Poor risk-reward ratio (${rrRatio.toFixed(2)}:1)`
      };
    }

    if (signal.confidence < 50) {
      return {
        isValid: false,
        reason: `Low confidence score (${signal.confidence})`
      };
    }

    return {
      isValid: true,
      reason: "Signal passed all risk checks"
    };
  }

  shouldAdjustStoploss(
    entryPrice: number,
    currentPrice: number,
    stoploss: number,
    profitPercent: number
  ): { shouldAdjust: boolean; newStoploss?: number } {
    if (profitPercent < 50) {
      return { shouldAdjust: false };
    }

    const profitCapture = entryPrice + ((currentPrice - entryPrice) * 0.5);

    if (profitCapture > stoploss) {
      return {
        shouldAdjust: true,
        newStoploss: profitCapture
      };
    }

    return { shouldAdjust: false };
  }

  calculateKellyCriterion(winRate: number, avgWin: number, avgLoss: number): number {
    if (avgLoss === 0) return 0;

    const winLossRatio = avgWin / Math.abs(avgLoss);
    const kelly = (winRate * winLossRatio - (1 - winRate)) / winLossRatio;

    return Math.max(0, Math.min(kelly * 0.5, 0.25));
  }

  getMaxPositionSizeForStrategy(
    strategyWinRate: number,
    strategyAvgWin: number,
    strategyAvgLoss: number
  ): number {
    const kelly = this.calculateKellyCriterion(strategyWinRate, strategyAvgWin, strategyAvgLoss);
    const maxCapital = this.accountBalance * kelly;
    return maxCapital;
  }
}
