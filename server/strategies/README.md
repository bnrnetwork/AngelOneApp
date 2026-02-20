# Advanced Trading Strategies - Production Documentation

**Purpose**: Comprehensive reference for all NIFTY 50 options trading strategy engines and their implementation.

---

A sophisticated, institutional-level algorithmic trading system with AI-driven regime classification, dynamic strategy routing, and comprehensive risk management.

## Features

### 1. **Market Bias Engine**
- **Previous Day Level Analysis**: Compares opening price with PDH/PDL to determine market bias
- **Bias Types**: BULLISH (open > PDH), BEARISH (open < PDL), NEUTRAL (between)
- **Confidence Scoring**: Adjusts based on breakout/breakdown strength
- **Trade Filtering**: Only allows trades aligned with bias direction

### 2. **Volatility Filter (India VIX)**
- VIX < 11: ORB trades blocked (insufficient volatility)
- VIX 11-18: Normal position sizing (100%)
- VIX 18-20: Normal position sizing (100%)
- VIX 20-30: Position size reduced to 50%
- VIX > 30: Position size reduced to 25% (extreme volatility)

### 3. **Pro ORB Engine**
- **Range Calculation**: `Max(First-15-min high-low, ATR(5min) × 1.2)`
- **Entry Conditions**:
  - Price breakout above ORB High (LONG) or below ORB Low (SHORT)
  - Volume spike > 1.8x average
  - VWAP distance confirmation
  - EMA 20/50 alignment
  
- **Smart Filters**:
  - Rejects Doji candles (body < 10% of range)
  - Blocks trades with gaps > 0.8% without pullback
  - Requires minimum ATR% > 0.6%

### 4. **Breakout Strength Scorer (0-100)**
Multi-factor breakout quality assessment:
- **Volume Spike** (25 pts): 1.8x average volume
- **VWAP Distance** (20 pts): Price strength relative to VWAP
- **EMA Alignment** (15 pts): EMA 20/50 configuration
- **OI Confirmation** (20 pts): Call/Put unwinding patterns
- **ATR Expansion** (20 pts): Current vs average ATR

Only generates signals with Score ≥ 70.

### 5. **VWAP Mean Reversion Engine**
Activates in SIDEWAYS regime:
- **LONG Setup**: Price < VWAP - 0.5% AND RSI < 35
- **SHORT Setup**: Price > VWAP + 0.5% AND RSI > 65
- **Target**: Return to VWAP
- **SL**: Previous swing high/low

### 6. **Regime AI Classifier (ONNX)**
Machine learning-based market regime detection:

**Input Features (5-min):**
- ATR %
- EMA 20 slope
- Price distance from VWAP
- RSI
- ORB range %
- Volume spike ratio
- India VIX

**Output Regimes:**
- **SIDEWAYS**: Low volatility, range-bound (use VWAP)
- **TRENDING**: Directional bias (use ORB)
- **BREAKOUT**: Strong momentum starting (aggressive ORB)

Includes heuristic fallback if ONNX unavailable.

### 7. **Strategy Router**
Dynamic strategy selection:
- **TRENDING + BULLISH** → ORB LONG (1.0x size, 75% conf)
- **SIDEWAYS + Oversold** → VWAP LONG (1.0x size, 65% conf)
- **BREAKOUT + High Vol** → Aggressive ORB (1.2x size, 80% conf)
- **VIX > 20** → Size reduction (0.5x-0.8x)

### 8. **Risk Engine**
Comprehensive position sizing & capital protection:

**Position Sizing:**
```
Qty = (Capital × MaxRiskPerTrade%) / RiskAmount
```

**Multi-Target System:**
- T1 = Entry + 1R (1 Risk)
- T2 = Entry + 2R
- T3 = Entry + 3R

**Trailing Stop:**
- Activates after 1R profit
- Trails using EMA 20 with 5-point buffer
- Never moves closer than entry price

**Kill Switch:**
- Triggers at max drawdown limit
- Closes all positions if daily loss exceeds limit

### 9. **Option OI Confirmation**
Uses Open Interest shifts for directional confirmation:

**LONG Confirmation:**
- Call OI unwinding (decreasing)
- Put OI buildup (increasing)
- PCR > 1.2 (more puts than calls)

**SHORT Confirmation:**
- Put OI unwinding (decreasing)
- Call OI buildup (increasing)
- PCR < 0.8 (more calls than puts)

Adds 10-20% confidence boost when confirmed.

## Architecture

```
MultiStrategyOrchestrator (main coordinator)
├── MarketBiasEngine (bias calculation)
├── VolatilityFilter (VIX filtering)
├── OrbEngine (ORB setup & entry)
├── BreakoutStrengthScorer (quality scoring)
├── VwapReversionEngine (mean reversion)
├── RegimeAI (ONNX classifier)
├── StrategyRouter (strategy selection)
├── RiskEngine (position sizing & risk)
└── OiConfirmationEngine (OI validation)
```

## Installation

```bash
# Install ONNX runtime
npm install onnxruntime-node

# Apply database migration
npm run db:migrate
```

## Quick Start

```typescript
import { MultiStrategyOrchestrator } from './strategies/multi-strategy-orchestrator';

const riskConfig = {
  maxRiskPerTrade: 1,        // 1% per trade
  maxDrawdown: 5,            // 5% max loss
  maxOpenPositions: 3,
  dailyLossLimit: 2,
  capitalProtectionLevel: 8,
};

const orchestrator = new MultiStrategyOrchestrator(riskConfig);
await orchestrator.initialize();

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
  // Trade generated!
  console.log(`${signal.strategy} ${signal.direction} entry: ${signal.entryPrice}`);
}
```

## Required Market Data

```typescript
MarketSnapshot {
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

CandeData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

OILevel {
  callOI: number;
  putOI: number;
  totalOI: number;
  putCallRatio: number;
  timestamp: string;
}
```

## Signal Output

```typescript
TradeSignal {
  signalId: string;
  strategy: "ORB" | "VWAP_REVERSION" | "HYBRID";
  direction: "LONG" | "SHORT";
  entryPrice: number;
  stopLoss: number;
  target1: number;         // 1R target
  target2: number;         // 2R target
  target3: number;         // 3R target
  confidence: number;      // 50-100%
  riskRewardRatio: number; // E.g., 1.5
  positionSize: {
    quantity: number;
    costPerLot: number;
    totalCost: number;
    maxRiskAmount: number;
    riskPercent: number;
  };
  biasAlignment: "aligned" | "neutral" | "opposed";
  regimeType: string;      // SIDEWAYS/TRENDING/BREAKOUT
  reasoning: string;
  timestamp: number;
}
```

## Database Schema Additions

New tables created by migration:
- `regime_analysis`: Historical regime classifications
- `orb_validations`: ORB setup validation logs
- `breakout_scores`: Breakout quality scores
- `oi_confirmations`: OI shift confirmations
- `risk_metrics`: Position sizing logs

## Performance Targeting

**Expected Win Rate:** 55-65% (breakeven to profitable)
**Average Risk-Reward:** 1.5:1 to 2:1
**Max Drawdown:** Limited to 5% via kill switch
**Capital Utilization:** ~30-40% with 3 concurrent positions

## Customization

### Risk Configuration
```typescript
const riskConfig = {
  maxRiskPerTrade: 0.75,      // 0.75% for conservative
  maxDrawdown: 3,             // 3% for aggressive
  maxOpenPositions: 5,        // Up to 5 positions
  dailyLossLimit: 3,
  capitalProtectionLevel: 5,  // Tight stops
};
```

### Strategy Parameters
Edit `StrategyRouter.getStrategyParams()`:
```typescript
{
  minBreakoutStrengthScore: 70,    // Raise for quality
  orbBufferPercent: 0.05,
  useVwapConfirmation: true,
  volumeSpikeMultiplier: 1.8,
  trailingStopActivation: "1R",
}
```

### Regime Thresholds
Adjust in `RegimeAI` class:
- `SIDEWAYS.maxAtrPercent`: Lower = stricter range conditions
- `TRENDING.minAtrPercent`: Higher = require stronger trends
- `BREAKOUT.minVolumeSpikeRatio`: Higher = require bigger volume

## Monitoring

Key metrics to track:
1. **Regime Accuracy**: How often regime AI predicts correctly
2. **Score Distribution**: Histogram of breakout scores
3. **Win Rate by Regime**: Profitability per market condition
4. **Average R:R**: Risk-reward quality
5. **Capital Preservation**: Actual drawdown vs configured limits

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No signals | Check VIX levels, regime analysis, minimum capital |
| Too many signals | Raise breakout score threshold |
| High losing trades | Review bias alignment, volatility filter |
| Model load failure | Check ONNX file path, falls back to heuristic |
| Kill switch triggered | Review drawdown/daily loss limits |

## Files

- `market-bias-engine.ts` - Bias calculation
- `volatility-filter.ts` - VIX-based filtering
- `orb-engine.ts` - Opening range breakout
- `vwap-reversion-engine.ts` - Mean reversion strategy
- `breakout-strength-scorer.ts` - Quality scoring (0-100)
- `regime-ai.ts` - ONNX-based regime detection
- `strategy-router.ts` - Strategy selection logic
- `risk-engine.ts` - Position sizing & risk management
- `oi-confirmation-engine.ts` - OI pattern analysis
- `multi-strategy-orchestrator.ts` - Main coordinator
- `example-usage.ts` - Implementation examples

## Next Steps

1. Configure risk settings for your capital
2. Set up market data feed (candledata, indicators, OI)
3. Train or import ONNX regime model (optional)
4. Run example scenarios to verify logic
5. Backtest on historical data
6. Deploy with paper trading first
7. Monitor regime accuracy and profitability metrics

---

**Version:** 1.0  
**Last Updated:** February 2025  
**Status:** Production-Ready

