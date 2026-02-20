# Production Deployment Checklist

**Purpose**: Comprehensive pre-flight verification guide for deploying the trading engine to production.

---

# ✅ Pre-Deployment Verification

## Phase 1: Core Engine Setup

- [ ] Install dependencies
  ```bash
  npm install onnxruntime-node
  ```

- [ ] Update database schema
  ```bash
  npm run db:migrate:dev
  ```

- [ ] Copy strategy files to `server/strategies/`
  ```
  ✓ market-bias-engine.ts
  ✓ volatility-filter.ts
  ✓ orb-engine.ts
  ✓ vwap-reversion-engine.ts
  ✓ breakout-strength-scorer.ts
  ✓ regime-ai.ts
  ✓ strategy-router.ts
  ✓ risk-engine.ts
  ✓ oi-confirmation-engine.ts
  ✓ multi-strategy-orchestrator.ts
  ```

## Phase 2: Configuration

- [ ] **Risk Config**
  ```typescript
  // server/config/trading-config.ts
  export const RISK_CONFIG = {
    maxRiskPerTrade: 1,        // Your risk appetite
    maxDrawdown: 5,            // Conservative: 3, Moderate: 5, Aggressive: 8
    maxOpenPositions: 3,       // Start with 2-3, adjust based on capital
    dailyLossLimit: 2,         // Stop trading after 2% loss
    capitalProtectionLevel: 8, // Kill switch at 8% loss
  };
  ```

- [ ] **Market Data Feed Setup**
  - [ ] Real-time price feed (tick data)
  - [ ] 5-min OHLCV candles
  - [ ] EMA 20, EMA 50 calculation
  - [ ] RSI calculation
  - [ ] VIX data source
  - [ ] ATR calculation
  - [ ] VWAP calculation
  - [ ] Volume average tracking
  - [ ] Previous day OHLC levels

- [ ] **OI Data Collection**
  - [ ] Call OI tracking
  - [ ] Put OI tracking
  - [ ] Historical OI snapshots
  - [ ] PCR ratio calculation

- [ ] **ONNX Model (Optional)**
  - [ ] If using ML regime classification:
    - [ ] Train on historical data
    - [ ] Export to ONNX format
    - [ ] Place in `./models/regime_classifier.onnx`
    - [ ] Test model loading

## Phase 3: Integration

- [ ] **Initialize Orchestrator**
  ```typescript
  // server/engine/trading-orchestrator.ts
  import { MultiStrategyOrchestrator } from '../strategies/multi-strategy-orchestrator';
  import { RISK_CONFIG } from '../config/trading-config';
  
  export const tradingEngine = new MultiStrategyOrchestrator(
    RISK_CONFIG,
    './models/regime_classifier.onnx'
  );
  
  export async function initEngine() {
    await tradingEngine.initialize();
  }
  ```

- [ ] **Signal Generation Loop**
  ```typescript
  // Run on every 5-min candle close after 9:15 AM
  async function generateSignals() {
    const { signal, state } = await tradingEngine.analyzeAndGenerateSignal(
      marketSnapshot,
      previousLevels,
      first15MinCandle,
      recentCandles,
      previousOI,
      currentOI,
      currentCapital
    );
    
    if (signal) {
      await storeSignal(signal, state);
      await sendTelegramAlert(signal);
    }
  }
  ```

- [ ] **Signal Monitoring**
  ```typescript
  // Run every minute during market hours
  async function monitorOpenSignals() {
    const activeSignals = await getActiveSignals();
    
    for (const signal of activeSignals) {
      const status = checkSignalStatus(signal, currentPrice);
      
      if (status.targetHit) {
        await partialExit(signal, status.target);
      }
      
      if (status.slHit) {
        await exitPosition(signal, 'SL_HIT');
      }
      
      if (signal.trailingStopActive) {
        const newSl = updateTrailingStop(signal, currentPrice, ema20);
        await updateSignalSL(signal, newSl);
      }
    }
  }
  ```

## Phase 4: Testing

- [ ] **Unit Tests**
  - [ ] Test each engine independently
  - [ ] Verify calculations (bias, scores, levels)
  - [ ] Test edge cases (gaps, doji, extreme VIX)

- [ ] **Integration Tests**
  - [ ] Run orchestrator with sample data
  - [ ] Verify signal generation
  - [ ] Test risk calculations
  - [ ] Verify database storage

- [ ] **Backtesting** (Highly Recommended)
  ```typescript
  // backtest/runner.ts
  - [ ] 3 months of historical data
  - [ ] All market regimes (trending, sideways, volatile)
  - [ ] Various bias conditions
  - [ ] Different VIX levels
  
  Expected metrics:
  - Win rate: 55-65%
  - Avg R:R: 1.5:1 to 2:1
  - Max drawdown: < configured limit
  - Profit factor: > 1.5
  ```

- [ ] **Paper Trading** (Minimum 1 week)
  - [ ] Generate signals without real money
  - [ ] Verify signal quality
  - [ ] Check integration with broker API
  - [ ] Monitor regime classification accuracy
  - [ ] Review P&L simulation

## Phase 5: Monitoring & Alerts

- [ ] **Logging Setup**
  ```typescript
  - [ ] Signal generation logs
  - [ ] Regime analysis logs
  - [ ] Risk calculation logs
  - [ ] Trade entry/exit logs
  - [ ] Error logs
  ```

- [ ] **Telegram Alerts** (in existing system)
  ```typescript
  - [ ] New signal alerts
  - [ ] Target hit alerts
  - [ ] SL hit alerts
  - [ ] Kill switch alerts
  - [ ] Critical error alerts
  ```

- [ ] **Dashboard Metrics**
  ```
  - [ ] Total P&L (today, week, month)
  - [ ] Win rate (by strategy, by regime)
  - [ ] Average trade duration
  - [ ] Drawdown (current, max)
  - [ ] Regime accuracy
  - [ ] Capital utilization
  - [ ] Active positions count
  ```

- [ ] **Performance Tracking**
  - [ ] Store all signals & analysis
  - [ ] Track regime AI accuracy over time
  - [ ] Monitor strategy win rates
  - [ ] Analyze P&L by time, regime, bias

## Phase 6: Safety Measures

- [ ] **Failsafes**
  - [ ] Market close protection (auto-exit)
  - [ ] Circuit breaker on extreme losses
  - [ ] Max position limits per instrument
  - [ ] Liquidity check before entry
  - [ ] Price movement anomaly detection

- [ ] **Error Handling**
  - [ ] Graceful ONNX model load failure
  - [ ] Broker API connection failures
  - [ ] Market data feed interruption
  - [ ] Database connection issues
  - [ ] Alert system failures

- [ ] **Manual Overrides**
  - [ ] Pause trading button
  - [ ] Close all positions button
  - [ ] Adjust risk parameters (with restrictions)
  - [ ] Kill switch manual trigger

## Phase 7: Production Deployment

- [ ] **Infrastructure**
  ```
  - [ ] Dedicated trading server (low latency)
  - [ ] Backup server for failover
  - [ ] 24/7 monitoring
  - [ ] Network redundancy
  - [ ] Power backup (UPS)
  ```

- [ ] **Broker Integration Verification**
  - [ ] API connectivity test
  - [ ] Order placement test (paper trading)
  - [ ] Real-time data feed test
  - [ ] Order cancellation test
  - [ ] Margin calculation verification

- [ ] **Database**
  - [ ] Production database ready
  - [ ] Backups scheduled
  - [ ] Query optimization done
  - [ ] Retention policy set

- [ ] **Documentation**
  - [ ] Configuration documented
  - [ ] Incident procedures documented
  - [ ] Escalation contacts listed
  - [ ] Recovery procedures documented

## ⚠️ CRITICAL CHECKS

```typescript
BEFORE GOING LIVE:

1. Risk Settings
   ✓ maxRiskPerTrade: 1% (conservative start)
   ✓ maxDrawdown: 5% (aggressive limit)
   ✓ dailyLossLimit: 2% (hard stop)
   ✓ capitalProtectionLevel: 8% (kill switch)

2. Market Data
   ✓ Real-time price feed verified
   ✓ 5-min candles generating correctly
   ✓ Indicators calculating accurately
   ✓ OI data available every minute

3. Integration
   ✓ Orchestrator initializing
   ✓ Signals generating correctly
   ✓ Positions sizing accurately
   ✓ Database storing signals

4. Testing
   ✓ Unit tests passing
   ✓ Integration tests passing
   ✓ Backtest profitable
   ✓ Paper trading clean

5. Monitoring
   ✓ Logging active
   ✓ Telegram alerts working
   ✓ Dashboard accessible
   ✓ Error alerts configured
```

## 📊 PRODUCTION TARGETS

**Phase 1 (Weeks 1-2): Testing**
- Capital: 10,000 (paper trading)
- Signals: 20-30 per day
- Win rate: Target 55%+
- Max loss per trade: 1% capital
- Daily loss limit: 2%

**Phase 2 (Weeks 3-4): Small Live**
- Capital: 50,000 (start small)
- Risk per trade: 0.5% (conservative)
- Signals: 5-10 best setups only
- Monitor drawdown closely
- Adjust parameters based on results

**Phase 3 (Month 2+): Scale Up**
- When profitable with consistent 55%+ win rate
- Gradually increase capital allocation
- Move to 1% risk per trade
- Monitor regime AI accuracy
- Optimize strategy parameters

## 🔴 RED FLAGS - STOP TRADING IF:

1. **Regime AI** accuracy drops below 50%
2. **Win rate** drops below 45% for 50+ trades
3. **Max drawdown** exceeds configured limit
4. **Broker** API issues (>99% uptime required)
5. **Market data** feed interruption >1 minute
6. **Database** failures or data loss
7. **Consecutive losses** > 3 in a row
8. **Unusual spreads** or low liquidity
9. **Model loading** failure (no fallback working)
10. **Telegram alerts** not delivering

## 📋 DAILY OPERATIONS CHECKLIST

```
☐ Market Open (9:15 AM IST)
  □ Verify data feeds active
  □ Check previous day metrics
  □ Enable signal generation
  □ Monitor first ORB candle
  
☐ During Trading (9:15 AM - 3:30 PM)
  □ Monitor signals as they generate
  □ Watch for target/SL hits
  □ Check P&L
  □ Verify alerts working
  
☐ Pre-Close (3:20 PM)
  □ Review open positions
  □ Plan early exits if needed
  □ Check daily P&L
  
☐ Market Close (3:30 PM)
  □ Exit all positions
  □ Record daily metrics
  □ Generate reports
  
☐ Post-Market
  □ Review trades
  □ Check regime accuracy
  □ Log issues if any
  □ Prepare next day
```

## 📞 ESCALATION CONTACTS

```
Critical Issues:
- Broker API Down: [Contact/Failover plan]
- Data Feed Down: [Contact/Backup source]
- Server Down: [Contact/Failover IP]
- Database Issue: [Contact/Restore procedure]
- Network Issue: [Contact/Backup network]

Support:
- Strategy Questions: Review README.md
- Configuration: Review INTEGRATION_GUIDE.md
- Debugging: Check logs in [log_location]
```

---

**Status**: Ready for deployment  
**Last Updated**: Feb 2025  
**Next Review**: After first week of live trading
