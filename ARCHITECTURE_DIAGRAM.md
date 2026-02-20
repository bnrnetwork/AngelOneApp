# Multi-Strategy Trading Engine - Architecture Diagram

## System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          REAL-TIME MARKET DATA FEED                         │
│  (Tick prices, 5-min OHLCV, RSI, EMA, VWAP, Volume, VIX, OI, Previous Day)  │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                ┌──────────────┴──────────────┐
                │                             │
                ▼                             ▼
        ┌──────────────────────┐    ┌──────────────────────┐
        │  Market Snapshot     │    │  OI Data Snapshot    │
        │  - Price             │    │  - Call OI           │
        │  - EMA/VWAP/RSI      │    │  - Put OI            │
        │  - ATR/Volume        │    │  - PCR Ratio         │
        │  - VIX               │    │  - Timestamps        │
        └──────────┬───────────┘    └──────────┬───────────┘
                   │                            │
                   └────────────┬───────────────┘
                                │
                    ┌───────────▼───────────┐
                    │    ORCHESTRATOR       │ (Multi-Strategy-Orchestrator)
                    │   Coordinator Logic   │
                    └───────────┬───────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
    ┌────────────┐        ┌────────────┐        ┌──────────────┐
    │ BIAS       │        │ VOLATILITY │        │ ORB ENGINE   │
    │ ENGINE     │        │ FILTER     │        │              │
    │            │        │            │        │ - Validate   │
    │ Bullish    │        │ VIX <11    │        │ - Range calc │
    │ Bearish    │        │ 11-20 OK   │        │ - Breakout   │
    │ Neutral    │        │ >20 reduce │        │ - Entry gen  │
    └────────────┘        │ >30 severe │        └──────────────┘
                          └────────────┘
        ▼                       ▼                       ▼
    Bias Result         Vol. Filter Result       ORB Validation
    + Confidence        + Size Multiplier        + Range Levels
                                                  + Skip Reasons
                                                  
        │                       │                       │
        └───────────────────────┼───────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │ BREAKOUT STRENGTH     │
                    │ SCORER (0-100)        │
                    │                       │
                    │ Volume Spike   (25pt) │
                    │ VWAP Distance (20pt)  │
                    │ EMA Align      (15pt) │
                    │ OI Confirm     (20pt) │
                    │ ATR Expansion  (20pt) │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │ REGIME AI CLASSIFIER  │
                    │ (ONNX or Heuristic)   │
                    │                       │
                    │ SIDEWAYS   ◄─┐        │
                    │ TRENDING   ◄─┼─ 7 Features
                    │ BREAKOUT   ◄─┘        │
                    │ + Scores              │
                    │ + Confidence          │
                    └───────────┬───────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
    ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐
    │ STRATEGY     │   │ VWAP         │   │ OI CONFIRMATION  │
    │ ROUTER       │   │ REVERSION    │   │ ENGINE           │
    │              │   │ ENGINE       │   │                  │
    │ TRENDING →   │   │              │   │ Long:  Call ↓   │
    │   ORB        │   │ LONG:        │   │        Put ↑    │
    │ SIDEWAYS →   │   │ P<VWAP-0.5%  │   │ Short: Put ↓    │
    │   VWAP       │   │ RSI < 35     │   │        Call ↑   │
    │ BREAKOUT →   │   │              │   │                  │
    │   ORB Agg    │   │ SHORT:       │   │ Confirmation    │
    └──────────────┘   │ P>VWAP+0.5%  │   │ Confidence      │
                       │ RSI > 65     │   └──────────────────┘
                       └──────────────┘

        │                       │                       │
        └───────────────────────┼───────────────────────┘
                                │
        ┌───────────────────────▼───────────────────────┐
        │ RISK ENGINE - Position Sizing & Management   │
        │                                               │
        │ Position Size = (Capital × Risk%) / (Qty Loss) │
        │ Qty = floor(Position Size)                    │
        │                                               │
        │ ┌─────────────────────────────────────────┐  │
        │ │ Risk Levels (Multi-Target)              │  │
        │ │ - Entry: Actual breakout price          │  │
        │ │ - SL:    ORB opposite + 0.05% buffer   │  │
        │ │ - T1:    Entry + 1R                     │  │
        │ │ - T2:    Entry + 2R                     │  │
        │ │ - T3:    Entry + 3R                     │  │
        │ │                                          │  │
        │ │ ┌──────────────────────────────────────┐ │  │
        │ │ │ Trailing Stop (After 1R Hit)        │ │  │
        │ │ │ - Activates at target1              │ │  │
        │ │ │ - Trails using EMA20 + 5pt buffer  │ │  │
        │ │ │ - Protects gains                    │ │  │
        │ │ └──────────────────────────────────────┘ │  │
        │ │                                          │  │
        │ │ ┌──────────────────────────────────────┐ │  │
        │ │ │ Kill Switch                         │ │  │
        │ │ │ - Max drawdown > limit              │ │  │
        │ │ │ - Daily loss > limit                │ │  │
        │ │ │ - Action: Close all positions       │ │  │
        │ │ └──────────────────────────────────────┘ │  │
        │ └─────────────────────────────────────────┘  │
        └──────────────────────┬───────────────────────┘
                               │
                    ┌──────────▼───────────┐
                    │   TRADE SIGNAL       │
                    │                      │
                    │ Strategy: ORB/VWAP   │
                    │ Direction: L/S       │
                    │ Entry Price          │
                    │ Stop Loss            │
                    │ Target1/2/3          │
                    │ Position Size        │
                    │ Confidence %         │
                    │ Risk:Reward Ratio    │
                    │ Bias Alignment       │
                    │ Regime Type          │
                    │ Reasoning            │
                    └──────────┬───────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
    ┌─────────────┐    ┌──────────────┐    ┌─────────────────┐
    │  DATABASE   │    │  TELEGRAM    │    │  TRADING PANEL  │
    │  STORAGE    │    │  ALERTS      │    │  DASHBOARD      │
    │             │    │              │    │                 │
    │ - Signals   │    │ New Signal   │    │ P&L Graph       │
    │ - Analysis  │    │ Target Hit   │    │ Trade History   │
    │ - Metrics   │    │ SL Hit       │    │ Regime Status   │
    │ - Logs      │    │ Kill Switch  │    │ Risk Metrics    │
    └─────────────┘    └──────────────┘    └─────────────────┘
                               │
                               ▼
                    ┌──────────────────┐
                    │  POSITION MGMT   │
                    │  & MONITORING    │
                    │                  │
                    │ - Track P&L      │
                    │ - Monitor Levels │
                    │ - Exit Signals   │
                    │ - Scale Profit   │
                    └──────────────────┘
```

## Data Dependencies

```
REQUIRED INPUT DATA:

Candle Data (5-min):
├── Open, High, Low, Close, Volume
├── EMA 20, EMA 50 (calculated)
├── RSI (calculated)
├── VWAP (calculated)
├── ATR (calculated)
└── Volume Average

Price & Market Data:
├── Current Price (real-time)
├── India VIX (real-time)
└── Previous Day OHLC

Option Market Data:
├── Call Open Interest
├── Put Open Interest
├── Put-Call Ratio
└── Recent OI shifts

First 15-Min Data:
├── First candle (9:15-9:30)
├── Doji detection
└── Gap analysis
```

## Decision Tree - Strategy Selection

```
START
  │
  ├─▶ Check Volatility Filter
  │   │
  │   ├─ VIX < 11? ──▶ BLOCK ORB ──▶ (check VWAP only)
  │   │
  │   ├─ VIX 11-20? ──▶ NORMAL SIZE
  │   │
  │   └─ VIX > 20? ──▶ REDUCE SIZE
  │
  ├─▶ Run Regime AI
  │   │
  │   ├─ SIDEWAYS (0-100 score)
  │   │   │
  │   │   └─▶ VWAP Reversion
  │   │       ├─ Price < VWAP-0.5%?
  │   │       ├─ RSI < 35?
  │   │       └─ Generate LONG signal
  │   │
  │   ├─ TRENDING (75+ confidence)
  │   │   │
  │   │   └─▶ ORB Strategy  
  │   │       ├─ Validate Setup
  │   │       ├─ Check Breakout
  │   │       └─ Generate signal if Score ≥ 70
  │   │
  │   └─ BREAKOUT (80+ confidence)
  │       │
  │       └─▶ Aggressive ORB
  │           ├─ Validation critical
  │           ├─ Score requirement: ≥ 70
  │           └─ Higher confidence trade
  │
  ├─▶ Check Market Bias
  │   │
  │   ├─ LONG trade ──▶ Bullish bias? ──▶ +20% confidence
  │   │
  │   ├─ SHORT trade ──▶ Bearish bias? ──▶ +20% confidence
  │   │
  │   └─ Neutral bias ──▶ Requires extra confirmation
  │
  ├─▶ Confirm with OI
  │   │
  │   ├─ LONG: Call ↓ + Put ↑? ──▶ +10-20% confidence
  │   │
  │   └─ SHORT: Put ↓ + Call ↑? ──▶ +10-20% confidence
  │
  ├─▶ Calculate Position Size
  │   │
  │   ├─ Qty = (Capital × Risk%) / (Entry - SL)
  │   │
  │   ├─ Apply VIX multiplier
  │   │
  │   └─ Verify capital available
  │
  └─▶ Generate Signal
      │
      ├─ Final Confidence = Base + Bias + OI adjustments
      ├─ If Confidence < 60: Reject or flag for review
      └─ Otherwise: Trade Signal Ready
```

## Signal Quality Pyramid

```
              ┌─────────────────┐
              │   Score ≥ 85    │
              │  EXCELLENT      │
              │  Max Size 100%  │
              ├────────────────▲┤
              │   Score 75-84   │
              │   VERY GOOD     │
              │   Size 100%     │
              ├────────────────▲┤
              │   Score 70-74   │
              │   GOOD          │
              │   Size 80%      │
              ├────────────────▲┤
              │   Score 60-69   │
              │   ACCEPTABLE    │
              │   Size 60%      │
              │  (Requires OI)  │
              ├────────────────▲┤
              │   Score < 60    │
              │   WEAK - REJECT │
              │   DO NOT TRADE  │
              └────────────────▼┘
              
              Score = Formula:
              ├─ Volume Spike: 0-25pts
              ├─ VWAP Distance: 0-20pts
              ├─ EMA Alignment: 0-15pts
              ├─ OI Confirmation: 0-20pts
              └─ ATR Expansion: 0-20pts
              
              Total: 0-100 points
```

## Risk Management Layers

```
Layer 1: Entry Filters
├─ Bias Alignment
├─ Volatility Filter (VIX)
├─ ORB Setup Validation
└─ Breakout Strength Score (≥70)

Layer 2: Sizing Control
├─ Max Risk Per Trade (1%)
├─ Position Size Calculation
└─ VIX-based Size Adjustment

Layer 3: Exit Management
├─ Stop Loss (ORB opposite + buffer)
├─ Multi-target exits (T1, T2, T3)
├─ Trailing Stop (EMA20 after 1R)
└─ Time-based exits

Layer 4: Portfolio Control
├─ Max Open Positions (3)
├─ Max Drawdown (5%)
├─ Daily Loss Limit (2%)
└─ Kill Switch (8% trigger)

Layer 5: Broker/System
├─ Connection Health
├─ Data Feed Quality
├─ Order Execution Speed
└─ Error Handling
```

## Performance Metrics

```
Expected Results:
├─ Win Rate: 55-65%
│  └─ 55%+ maintains profitability with 1.5:1 R:R
│
├─ Average R:R: 1.5:1 to 2:1
│  └─ Entry to T1 = 1R (risk-free)
│  └─ T1 to T2 = 1R gain
│  └─ T2 to T3 = 1R gain
│
├─ Max Drawdown: 5%
│  └─ Hard stop via kill switch
│
├─ Capital Utilization: 30-40%
│  └─ 3 concurrent positions × 1% risk = 3% used
│
└─ Signals Per Day: 20-30 total
   └─ Best quality: 5-10 traded per day
```

---

This architecture provides institutional-grade structure with:
- ✅ Multi-factor confirmation
- ✅ Risk management at every level
- ✅ Ai-driven adaptability
- ✅ Production reliability
- ✅ Comprehensive monitoring
