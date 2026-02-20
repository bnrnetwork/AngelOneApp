import { BaseStrategy } from "./base-strategy";
import { ORBStrategy } from "./orb-strategy";
import { EMAPullbackStrategy } from "./ema-pullback-strategy";
import { VWAPReversionStrategy } from "./vwap-reversion-strategy";
import { AfternoonVWAPMomentumStrategy } from "./afternoon-vwap-momentum-strategy";
import { TradingSignal, Instrument, CandleData } from "../core/types";
import { RiskManager } from "../core/risk-manager";

export class StrategyManager {
  private strategies: BaseStrategy[];
  private riskManager: RiskManager;
  private activeSignals: Map<string, TradingSignal> = new Map();

  constructor(accountBalance: number = 100000) {
    this.strategies = [
      new ORBStrategy(),
      new EMAPullbackStrategy(),
      new VWAPReversionStrategy(),
      new AfternoonVWAPMomentumStrategy(),
    ];

    this.riskManager = new RiskManager(accountBalance, {
      maxPositions: 5,
      maxRiskPerTrade: 0.02,
      maxDailyLoss: 0.05,
      maxCapitalPerTrade: 0.20,
    });
  }

  analyzeAll(
    instrument: Instrument,
    candles: CandleData[],
    optionChain?: any,
    vix?: number
  ): TradingSignal[] {
    const signals: TradingSignal[] = [];

    for (const strategy of this.strategies) {
      if (!strategy.isEnabled()) {
        continue;
      }

      try {
        const signal = strategy.analyze(instrument, candles, optionChain, vix);
        if (signal) {
          const validation = this.riskManager.validateSignal(
            signal,
            this.activeSignals.size,
            0
          );

          if (validation.isValid) {
            const riskMetrics = this.riskManager.calculatePositionSize(signal);
            signal.riskRewardRatio = riskMetrics.riskRewardRatio;
            signals.push(signal);
          }
        }
      } catch (error) {
        console.error(`Error in strategy ${strategy.getName()}:`, error);
      }
    }

    return this.prioritizeSignals(signals);
  }

  private prioritizeSignals(signals: TradingSignal[]): TradingSignal[] {
    return signals.sort((a, b) => {
      if (a.confidence !== b.confidence) {
        return b.confidence - a.confidence;
      }

      if (a.riskRewardRatio && b.riskRewardRatio) {
        return b.riskRewardRatio - a.riskRewardRatio;
      }

      return 0;
    });
  }

  getBestSignal(
    instrument: Instrument,
    candles: CandleData[],
    optionChain?: any,
    vix?: number
  ): TradingSignal | null {
    const signals = this.analyzeAll(instrument, candles, optionChain, vix);
    return signals.length > 0 ? signals[0] : null;
  }

  addActiveSignal(signalId: string, signal: TradingSignal): void {
    this.activeSignals.set(signalId, signal);
  }

  removeActiveSignal(signalId: string): void {
    this.activeSignals.delete(signalId);
  }

  getActiveSignalsCount(): number {
    return this.activeSignals.size;
  }

  getStrategy(name: string): BaseStrategy | undefined {
    return this.strategies.find(s => s.getName() === name);
  }

  getAllStrategies(): BaseStrategy[] {
    return this.strategies;
  }

  enableStrategy(name: string): void {
    const strategy = this.getStrategy(name);
    if (strategy) {
      strategy.getConfig().enabled = true;
    }
  }

  disableStrategy(name: string): void {
    const strategy = this.getStrategy(name);
    if (strategy) {
      strategy.getConfig().enabled = false;
    }
  }

  resetDailyState(): void {
    this.activeSignals.clear();
    const orbStrategy = this.getStrategy("PRO_ORB") as ORBStrategy;
    if (orbStrategy) {
      orbStrategy.resetDaily();
    }
  }
}
