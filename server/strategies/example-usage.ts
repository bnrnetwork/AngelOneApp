/**
 * PRODUCTION ENGINE EXAMPLE USAGE
 * Demonstrates how to integrate and use the multi-strategy orchestrator
 */

import { MultiStrategyOrchestrator} from './multi-strategy-orchestrator';
import { MarketBiasEngine } from './market-bias-engine';
import { VolatilityFilter } from './volatility-filter';
import { OrbEngine } from './orb-engine';
import { RiskEngine, type RiskConfig } from './risk-engine';
import { RegimeAI } from './regime-ai';

// ============================================================================
// EXAMPLE 1: Basic Setup
// ============================================================================

export async function initializeEngine() {
  const riskConfig: RiskConfig = {
    maxRiskPerTrade: 1,        // 1% of portfolio per trade
    maxDrawdown: 5,            // 5% maximum drawdown
    maxOpenPositions: 3,       // Max 3 concurrent positions
    dailyLossLimit: 2,         // 2% daily loss limit
    capitalProtectionLevel: 8, // Triggers kill switch at 8% loss
  };

  const orchestrator = new MultiStrategyOrchestrator(
    riskConfig,
    './models/regime_classifier.onnx' // Optional ONNX model
  );

  // Initialize AI models (gracefully handles if ONNX unavailable)
  const modelLoaded = await orchestrator.initialize();
  console.log(`AI initialization: ${modelLoaded ? 'Success' : 'Using heuristic mode'}`);

  return orchestrator;
}

// ============================================================================
// EXAMPLE 2: Market Bias Analysis
// ============================================================================

export function analyzeBias() {
  const previousDay = {
    high: 19500,
    low: 19300,
    close: 19400,
  };

  const openPrice = 19550; // Gap up scenario

  const bias = MarketBiasEngine.calculateBias(openPrice, previousDay);

  console.log(`Market Bias: ${bias.bias}`);
  console.log(`Confidence: ${bias.confidence}%`);
  console.log(`Reason: ${bias.reason}`);

  // Check if trade direction aligns with bias
  const longAligned = MarketBiasEngine.isAlignedWithBias('LONG', bias.bias);
  console.log(`LONG trades aligned: ${longAligned}`);
}

// ============================================================================
// EXAMPLE 3: Volatility Filtering
// ============================================================================

export function checkVolatilityFilter() {
  const scenarios = [
    { vix: 10, label: "Very Low VIX" },
    { vix: 14, label: "Normal VIX" },
    { vix: 22, label: "High VIX" },
    { vix: 35, label: "Extreme VIX" },
  ];

  scenarios.forEach(({ vix, label }) => {
    const filter = VolatilityFilter.evaluateVIX(vix);
    console.log(`${label}: ${filter.reason}`);
    console.log(`  Size multiplier: ${filter.sizeMultiplier}`);
    console.log(`  Can trade ORB: ${VolatilityFilter.canTradeStrategy(vix, 'ORB').can}`);
  });
}

// ============================================================================
// EXAMPLE 4: ORB Validation & Entry
// ============================================================================

export function demonstrateOrbSetup() {
  // Sample 15-min opening candle
  const first15MinCandle = {
    timestamp: '2025-02-14T09:15:00Z',
    open: 19500,
    high: 19550,
    low: 19480,
    close: 19525,
    volume: 1250000,
  };

  const atr5Min = 40; // 5-min ATR
  const currentPrice = 19560; // Price now
  const previousClose = 19400;

  // Validate ORB setup
  const validation = OrbEngine.validateOrbSetup(
    first15MinCandle,
    atr5Min,
    currentPrice,
    previousClose,
    [] // recentCandles
  );

  if (validation.isValid) {
    console.log("ORB Setup Valid ✓");

    // Calculate ORB range
    const orbRange = OrbEngine.calculateOrbRange(
      first15MinCandle,
      atr5Min,
      currentPrice
    );

    console.log(`ORB High: ${orbRange.high}`);
    console.log(`ORB Low: ${orbRange.low}`);
    console.log(`Range: ${orbRange.range} (${orbRange.rangePercent.toFixed(2)}%)`);
    console.log(`Source: ${orbRange.source} (Candle or ATR)`);

    // Check for breakout
    const isLongBreakout = OrbEngine.checkBreakout(
      'LONG',
      currentPrice,
      orbRange.high,
      orbRange.low
    );

    if (isLongBreakout) {
      console.log("Price above ORB High - LONG entry valid");

      // Generate entry signal
      const orbSignal = OrbEngine.generateOrbSignal(
        'LONG',
        orbRange,
        orbRange.high,
        orbRange.low,
        currentPrice
      );

      console.log(`Entry: ${orbSignal.entryPrice}`);
      console.log(`SL: ${orbSignal.stopLoss}`);
      console.log(`T1 (1R): ${orbSignal.target1}`);
      console.log(`T2 (2R): ${orbSignal.target2}`);
      console.log(`T3 (3R): ${orbSignal.target3}`);
      console.log(`R:R Ratio: ${orbSignal.riskRewardRatio.toFixed(2)}`);
    }
  } else {
    console.log("ORB Setup Invalid ✗");
    validation.skipReasons.forEach((reason) => {
      console.log(`  - ${reason}`);
    });
  }
}

// ============================================================================
// EXAMPLE 5: Position Sizing & Risk
// ============================================================================

export function demonstrateRiskManagement() {
  const capital = 100000; // 1 Lakh
  const entryPrice = 19550;
  const stopLoss = 19500;

  const riskConfig: RiskConfig = {
    maxRiskPerTrade: 1,
    maxDrawdown: 5,
    maxOpenPositions: 3,
    dailyLossLimit: 2,
    capitalProtectionLevel: 8,
  };

  // Calculate position size
  const posSize = RiskEngine.calculatePositionSize(
    capital,
    entryPrice,
    stopLoss,
    riskConfig
  );

  console.log("Position Sizing:");
  console.log(`  Position size: ${posSize.quantity} lots`);
  console.log(`  Cost per lot: ${posSize.costPerLot}`);
  console.log(`  Total capital required: ${posSize.totalCost}`);
  console.log(`  Max risk amount: ${posSize.maxRiskAmount}`);
  console.log(`  Risk % of capital: ${posSize.riskPercent.toFixed(2)}%`);

  // Generate risk levels
  const riskLevels = RiskEngine.generateRiskLevels('LONG', entryPrice, stopLoss);

  console.log("\nRisk Levels:");
  console.log(`  Entry: ${riskLevels.entryPrice}`);
  console.log(`  SL: ${riskLevels.stopLoss}`);
  console.log(`  T1: ${riskLevels.target1}`);
  console.log(`  T2: ${riskLevels.target2}`);
  console.log(`  T3: ${riskLevels.target3}`);
  console.log(`  Risk-Reward: ${riskLevels.riskRewardRatio.toFixed(2)}`);

  // Check kill switch
  const currentDrawdown = 7000; // 7000 loss
  const dailyLoss = 1500;

  const killSwitch = RiskEngine.checkKillSwitch(
    capital,
    currentDrawdown,
    dailyLoss,
    riskConfig
  );

  if (!killSwitch.triggered) {
    console.log("\nRisk Management: ✓ All checks passed");
  } else {
    console.log(`\nKill Switch: ⚠ ${killSwitch.reason}`);
  }
}

// ============================================================================
// EXAMPLE 6: Regime Analysis
// ============================================================================

export async function demonstrateRegimeAnalysis() {
  const regimeAi = new RegimeAI();
  await regimeAi.loadModel();

  // Example market features
  const features = {
    atrPercent: 1.2,           // 1.2% ATR
    ema20Slope: 0.003,         // Uptrend
    priceDistanceFromVwap: 0.4, // 0.4% above VWAP
    rsi: 65,                   // Overbought
    orbRangePercent: 0.8,      // 0.8% range
    volumeSpikeRatio: 2.1,     // 2.1x average volume
    indiaVix: 17,              // Normal VIX
  };

  const result = await regimeAi.predict(features);

  console.log(`Market Regime: ${result.regime}`);
  console.log(`Confidence: ${result.confidence.toFixed(1)}%`);
  console.log(`Reasoning: ${result.reasoning}`);
  console.log("\nRegime Probabilities:");
  console.log(`  SIDEWAYS: ${result.scores.sideways.toFixed(1)}%`);
  console.log(`  TRENDING: ${result.scores.trending.toFixed(1)}%`);
  console.log(`  BREAKOUT: ${result.scores.breakout.toFixed(1)}%`);
}

// ============================================================================
// EXAMPLE 7: Strategy Router
// ============================================================================

export function demonstrateStrategyRouter() {
  const scenarios = [
    {
      regime: 'TRENDING' as const,
      vix: 15,
      bias: 'BULLISH' as const,
      label: "Bullish trending with normal VIX",
    },
    {
      regime: 'SIDEWAYS' as const,
      vix: 10,
      bias: 'NEUTRAL' as const,
      label: "Sideways with low VIX",
    },
    {
      regime: 'BREAKOUT' as const,
      vix: 25,
      bias: 'BEARISH' as const,
      label: "Breakout mode with high volatility",
    },
  ];

  scenarios.forEach(({ regime, vix, bias, label }) => {
    console.log(`\nScenario: ${label}`);
    const route = require('./strategy-router').StrategyRouter.routeStrategy(regime, vix, bias);
    console.log(`  Strategy: ${route.strategy}`);
    console.log(`  Aggressiveness: ${route.aggressiveness}`);
    console.log(`  Size multiplier: ${route.sizeMultiplier.toFixed(2)}x`);
    console.log(`  Confidence: ${route.confidence}%`);
  });
}

// ============================================================================
// EXAMPLE 8: Full Orchestrator Usage
// ============================================================================

export async function demonstrateFullOrchestrator() {
  const orchestrator = await initializeEngine();

  // Market snapshot
  const marketSnapshot = {
    timestamp: Date.now(),
    currentPrice: 19560,
    vwap: 19500,
    ema20: 19520,
    ema50: 19480,
    rsi: 62,
    atr5Min: 40,
    atrAverage: 35,
    volume: 1500000,
    volumeAverage: 1000000,
    vixLevel: 14,
  };

  // Previous day levels
  const previousLevels = {
    high: 19500,
    low: 19300,
    close: 19400,
    openTime: '2025-02-13T09:15:00Z',
  };

  // First 15-min candle
  const first15MinCandle = {
    timestamp: '2025-02-14T09:15:00Z',
    open: 19500,
    high: 19550,
    low: 19480,
    close: 19525,
    volume: 1250000,
  };

  // Recent candles data
  const recentCandles = [
    {
      timestamp: '2025-02-14T09:20:00Z',
      open: 19525,
      high: 19545,
      low: 19510,
      close: 19540,
      volume: 950000,
    },
    {
      timestamp: '2025-02-14T09:25:00Z',
      open: 19540,
      high: 19560,
      low: 19535,
      close: 19560,
      volume: 1100000,
    },
  ];

  // OI data
  const previousOI = {
    callOI: 5000000,
    putOI: 4500000,
    totalOI: 9500000,
    putCallRatio: 0.9,
    timestamp: '2025-02-13T15:30:00Z',
  };

  const currentOI = {
    callOI: 4800000,
    putOI: 5200000,
    totalOI: 10000000,
    putCallRatio: 1.08,
    timestamp: '2025-02-14T09:25:00Z',
  };

  const capital = 100000;

  // Generate signal
  const { signal, state } = await orchestrator.analyzeAndGenerateSignal(
    marketSnapshot,
    previousLevels,
    first15MinCandle,
    recentCandles,
    previousOI,
    currentOI,
    capital
  );

  if (signal) {
    console.log("\n✓ SIGNAL GENERATED");
    console.log(`  Strategy: ${signal.strategy}`);
    console.log(`  Direction: ${signal.direction}`);
    console.log(`  Entry: ${signal.entryPrice}`);
    console.log(`  SL: ${signal.stopLoss}`);
    console.log(`  T1/T2/T3: ${signal.target1} / ${signal.target2} / ${signal.target3}`);
    console.log(`  Qty: ${signal.positionSize.quantity}`);
    console.log(`  Confidence: ${signal.confidence}%`);
    console.log(`  R:R: ${signal.riskRewardRatio.toFixed(2)}`);
    console.log(`  Reasoning: ${signal.reasoning}`);
  } else {
    console.log("\n✗ No signal generated");
    console.log("State analysis:");
    console.log(`  Bias: ${state.marketBias.bias} (${state.marketBias.confidence}% confidence)`);
    console.log(`  Regime: ${state.regimeAnalysis.regime} (${state.regimeAnalysis.confidence.toFixed(1)}% confidence)`);
    console.log(`  Volatility: ${state.volatilityFilter.vixLevel} - ${state.volatilityFilter.reason}`);
  }
}

// Run examples
if (require.main === module) {
  console.log("=== MULTI-STRATEGY TRADING ENGINE EXAMPLES ===\n");

  console.log("1. Market Bias Analysis");
  analyzeBias();

  console.log("\n2. Volatility Filtering");
  checkVolatilityFilter();

  console.log("\n3. ORB Setup & Entry");
  demonstrateOrbSetup();

  console.log("\n4. Risk Management");
  demonstrateRiskManagement();

  console.log("\n5. Strategy Router");
  demonstrateStrategyRouter();

  console.log("\n6. Full Orchestrator (async)");
  demonstrateFullOrchestrator().catch(console.error);
}
