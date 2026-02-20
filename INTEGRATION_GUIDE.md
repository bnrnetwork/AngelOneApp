# Integration Guide: Multi-Strategy Trading Engine

**Purpose**: Step-by-step instructions for integrating the production-grade trading engine into your application.

---

## Directory Structure

```
server/
├── strategies/
│   ├── market-bias-engine.ts          # Market bias calculator
│   ├── volatility-filter.ts           # VIX-based volatility filtering
│   ├── orb-engine.ts                  # Pro ORB strategy engine
│   ├── vwap-reversion-engine.ts       # VWAP mean reversion strategy
│   ├── breakout-strength-scorer.ts    # Breakout quality scoring
│   ├── regime-ai.ts                   # ONNX-based regime classifier
│   ├── strategy-router.ts             # Strategy selection logic
│   ├── risk-engine.ts                 # Position sizing & risk management
│   ├── oi-confirmation-engine.ts      # Option OI confirmation
│   └── multi-strategy-orchestrator.ts # Main orchestrator (integrates all)
```

# Step 1: Installation & Setup

## Install Dependencies
```bash
npm install onnxruntime-node
```

## Database Migration
```bash
# Apply migration to add new tables and fields
drizzle-kit push
```

# Step 2: Initialize Orchestrator

```typescript
import { MultiStrategyOrchestrator } from './server/strategies/multi-strategy-orchestrator';

const riskConfig = {
  maxRiskPerTrade: 1,        // 1% of capital per trade
  maxDrawdown: 5,            // 5% drawdown limit
  maxOpenPositions: 3,       // Max 3 concurrent positions
  dailyLossLimit: 2,         // 2% daily loss limit
  capitalProtectionLevel: 8, // 8% triggers kill switch
};

const orchestrator = new MultiStrategyOrchestrator(
  riskConfig,
  '/path/to/regime_model.onnx' // Optional ONNX model
);

// Initialize AI models
await orchestrator.initialize();
```

# Step 3: Market Data Collection

Before generating signals, ensure you have:

```typescript
interface MarketSnapshot {
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

interface CandeData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PreviousLevels {
  high: number;
  low: number;
  close: number;
  openTime: string;
}

interface OILevel {
  callOI: number;
  putOI: number;
  totalOI: number;
  putCallRatio: number;
  timestamp: string;
}
```

# Step 4: Generate Trading Signals

```typescript
const signal = await orchestrator.analyzeAndGenerateSignal(
  marketSnapshot,
  previousLevels,
  first15MinCandle,
  recentCandles,
  previousOI,
  currentOI,
  currentCapital
);

if (signal.signal) {
  // Store signal in database
  await db.insert(signals).values({
    strategy: signal.signal.strategy,
    instrument: 'NIFTY',
    optionType: signal.signal.direction === 'LONG' ? 'CE' : 'PE',
    strikePrice: calculateStrike(signal.signal.entryPrice),
    entryPrice: signal.signal.entryPrice,
    target1: signal.signal.target1,
    target2: signal.signal.target2,
    target3: signal.signal.target3,
    stoploss: signal.signal.stopLoss,
    confidence: signal.signal.confidence,
    riskRewardRatio: signal.signal.riskRewardRatio,
    marketBias: signal.state.marketBias.bias,
    marketRegime: signal.state.regimeAnalysis.regime,
    breakoutScore: signal.state.breakoutScore?.totalScore,
    vixAtEntry: marketSnapshot.vixLevel,
    // ... other fields
  });
}
```

# Step 5: Signal Monitoring & Exits

```typescript
// Check if targets/SL hit
function checkSignalStatus(signal: Signal, currentPrice: number) {
  if (signal.status === 'active') {
    if (signal.strategy === 'LONG') {
      if (currentPrice >= signal.target1) {
        // Partially exit at T1, trail SL
      }
      if (currentPrice <= signal.stoploss) {
        // SL hit - exit
      }
    }
    // ... similar for SHORT
  }
}

// Update trailing stop if active
if (signal.trailingStopActive) {
  const newSl = RiskEngine.updateTrailingStop(
    signal.direction,
    currentPrice,
    ema20,
    riskLevels,
    trailingStop
  );
  // Update SL in database
}
```

# Step 6: Regime-Based Strategy Selection

The orchestrator automatically routes trades:
- **TRENDING** → Use ORB strategy
- **SIDEWAYS** → Use VWAP reversion
- **BREAKOUT** → Aggressive ORB

Each has different parameters and sizing adjustments.

# Step 7: Risk Management Features

## Capital Protection
```typescript
const killSwitch = RiskEngine.checkKillSwitch(
  capital,
  currentDrawdown,
  dailyLoss,
  riskConfig
);

if (killSwitch.triggered) {
  // Close all positions
  console.log(`Kill switch activated: ${killSwitch.reason}`);
}
```

## Position Sizing
```typescript
const posSize = RiskEngine.calculatePositionSize(
  capital,
  entryPrice,
  stopLoss,
  riskConfig
);

// Adjust for volatility
const adjustedQty = VolatilityFilter.getPositionSizeAdjustment(
  vixLevel,
  posSize.quantity
);
```

# Step 8: Performance Monitoring

Track key metrics:
- Breakout score distribution
- Win rate by regime
- Risk-reward performance
- Capital utilization
- Regime AI accuracy

```typescript
const metrics = {
  totalSignals: await db.select().from(signals).where(...),
  winRate: calculateWinRate(),
  avgRr: calculateAverageRiskReward(),
  regimeAccuracy: calculateRegimeAccuracy(),
  profitByRegime: groupAndCalculate('market_regime'),
};
```

# Quick Reference

## Market Bias Effects
- Bullish bias: Increases LONG signal confidence by 20%
- Bearish bias: Increases SHORT signal confidence by 20%
- Neutral: No adjustment, requires extra confirmation

## Volatility Filter Effects
- VIX < 11: ORB trades blocked
- VIX 11-18: Normal position size
- VIX 18-20: Normal position size
- VIX 20-30: Position size reduced to 50%
- VIX > 30: Position size reduced to 25%

## Breakout Score Requirements
Score >= 70: Trade signal generated
Score 75+: "VERY_GOOD" strength
Score 85+: "EXCELLENT" strength

## ORB Setup Filters
Skip ORB if:
- First 15-min candle is Doji
- Gap > 0.8% without pullback
- ATR% < 0.6%

## Risk-Reward Targets
- Entry: Actual breakout level
- SL: ORB opposite + 0.05% buffer
- T1: Entry + 1R
- T2: Entry + 2R
- T3: Entry + 3R
- After T1: Trail with EMA20

# Troubleshooting

## No signals generated?
- Check VIX levels (too low blocks ORB)
- Verify market regime (SIDEWAYS requires oversold RSI)
- Check breakout score >= 70
- Verify sufficient capital for position sizing

## ONNX Model not loading?
- Falls back to heuristic classification
- Check model file exists at specified path
- Ensure onnxruntime-node is installed

## Kill switch triggered?
- Check daily loss limit
- Check maximum drawdown limit
- Review positions for forced exit

# Advanced: Training Regime AI Model

To create an optimal ONNX model for regime classification:

1. Collect historical data with labeled regimes
2. Extract 7 input features:
   - ATR %
   - EMA20 slope
   - Price distance from VWAP
   - RSI
   - ORB range %
   - Volume spike ratio
   - India VIX

3. Train multi-class classifier (SIDEWAYS/TRENDING/BREAKOUT)
4. Export as ONNX format
5. Load with RegimeAI.loadModel()

# Support

For issues or questions about specific components:
- Market Bias: Check previous day OHLC levels
- Volatility: Verify VIX data source
- ORB: Check 15-min candle generation
- VWAP: Verify volume-weighted calculation
- Regime: Check ONNX model or heuristic scoring
- Risk: Check position sizing formula

---
Last Updated: Feb 2025
Version: 1.0
