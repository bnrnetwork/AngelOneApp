# Complete Code Refactor - Trading System v2

## Overview
This is a comprehensive refactor of the AngelOne trading application with institutional-grade architecture, clean code principles, and modular design.

## Architecture Highlights

### 1. **Core Module** (`server/core/`)
Clean, reusable components for the entire system:

- **types.ts** - TypeScript interfaces and types for type-safe development
- **indicators.ts** - Technical indicators (EMA, SMA, RSI, ATR, VWAP, Bollinger Bands, Supertrend)
- **oi-analyzer.ts** - Option chain analysis engine with OI interpretation
- **regime-detector.ts** - Market regime detection (SIDEWAYS, TRENDING, BREAKOUT, VOLATILE)
- **risk-manager.ts** - Position sizing, risk validation, Kelly Criterion

### 2. **Strategy System** (`server/strategies-v2/`)
Object-oriented strategy framework:

- **base-strategy.ts** - Abstract base class for all strategies
- **orb-strategy.ts** - Opening Range Breakout with volume/ATR confirmation
- **ema-pullback-strategy.ts** - EMA-based pullback entries in trending markets
- **vwap-reversion-strategy.ts** - Mean reversion to VWAP
- **afternoon-vwap-momentum-strategy.ts** - Afternoon momentum trades
- **strategy-manager.ts** - Orchestrates all strategies, prioritizes signals

### 3. **Services** (`server/services/`)
Business logic layer:

- **market-data-service.ts** - AngelOne API integration, market data fetching
- **trading-engine.ts** - Main trading loop, signal generation, position management

## Key Features

### Institutional-Grade Risk Management
- Kelly Criterion for position sizing
- Maximum daily loss limits
- Risk-reward ratio validation
- Confidence-based position scaling

### Advanced Market Analysis
- Real-time regime detection
- Multi-timeframe analysis
- Volume and volatility filters
- Fake breakout detection

### OI-Based Decision Making
- CE/PE OI trend analysis
- Writing activity detection
- PCR ratio calculation
- Support/resistance from max OI

### Strategy Confidence Scoring
Each signal includes:
- Confidence score (0-100)
- Detailed reasoning
- Market regime context
- Breakout strength
- Risk-reward ratio

## How It Works

### 1. Market Data Collection
```typescript
const candles = await marketDataService.getCandleData(symbolToken, "FIVE_MINUTE", from, to);
const optionChain = await marketDataService.getOptionChain("NIFTY", expiry);
```

### 2. Strategy Analysis
```typescript
const strategyManager = new StrategyManager(accountBalance);
const signal = strategyManager.getBestSignal(instrument, candles, optionChain, vix);
```

### 3. Risk Validation
```typescript
const validation = riskManager.validateSignal(signal, currentPositions, todayLoss);
if (validation.isValid) {
  const metrics = riskManager.calculatePositionSize(signal);
  // Execute trade
}
```

### 4. Position Monitoring
```typescript
await tradingEngine.updateActiveSignals(); // Every 30 seconds
// Automatically hits targets or stoploss
```

## Strategy Details

### 1. ORB Strategy (Opening Range Breakout)
- **Time Window**: 09:15 - 10:30
- **Logic**: Breakout of first 15-minute range
- **Filters**: Volume >= 1.5x, ATR >= 0.5x
- **Risk/Reward**: 1:2

### 2. EMA Pullback Strategy
- **Time Window**: 09:30 - 14:30
- **Logic**: Pullback to EMA20 in trending market
- **Filters**: RSI 40-70 (bull), 30-60 (bear)
- **Risk/Reward**: 1:2.5

### 3. VWAP Reversion Strategy
- **Time Window**: 10:00 - 15:00
- **Logic**: Mean reversion to VWAP
- **Filters**: Deviation > 0.5%, RSI extreme
- **Risk/Reward**: 1:2

### 4. Afternoon VWAP Momentum
- **Time Window**: 13:00 - 15:00
- **Logic**: Strong momentum above/below VWAP
- **Filters**: Volume >= 1.3x, EMA20 confirmation
- **Risk/Reward**: 1:2

## API Endpoints

### Signals
- `GET /api/signals` - All signals
- `GET /api/signals/active` - Active signals only
- `GET /api/signals/:id` - Single signal
- `POST /api/signals/:id/close` - Manually close signal

### Strategies
- `GET /api/strategies` - List all strategies
- `POST /api/strategies/:name/toggle` - Enable/disable strategy

### System
- `GET /api/stats` - Trading statistics
- `GET /api/logs` - System logs
- `POST /api/engine/start` - Start trading engine
- `POST /api/engine/stop` - Stop trading engine
- `GET /api/health` - System health check

## Configuration

### Strategy Configuration
Each strategy supports:
```typescript
{
  enabled: boolean;
  instruments: Instrument[];
  timeWindow: { start: string; end: string };
  maxPositions: number;
  minConfidence: number;
  riskPerTrade: number;
  useRegimeFilter: boolean;
  useOIConfirmation: boolean;
  useVolatilityFilter: boolean;
}
```

### Risk Configuration
```typescript
{
  maxPositions: 5;
  maxRiskPerTrade: 0.02;  // 2%
  maxDailyLoss: 0.05;     // 5%
  maxCapitalPerTrade: 0.20; // 20%
}
```

## Code Quality

### Clean Architecture
- Separation of concerns
- Single responsibility principle
- Dependency injection
- Interface-based design

### Type Safety
- Full TypeScript coverage
- Strict type checking
- No `any` types
- Comprehensive interfaces

### Error Handling
- Try-catch blocks
- Graceful degradation
- Detailed error logging
- No silent failures

### Performance
- Efficient data structures
- Minimal API calls
- Caching where appropriate
- Optimized calculations

## Testing Strategy

### Unit Tests (Recommended)
- Test each indicator function
- Test regime detection logic
- Test risk calculations
- Test signal generation

### Integration Tests
- Test AngelOne API integration
- Test database operations
- Test WebSocket updates
- Test strategy orchestration

### Backtest Framework
Use historical data to validate:
- Strategy win rates
- Risk-reward achieved
- Drawdown metrics
- Confidence accuracy

## Deployment

### Environment Variables
```env
ANGELONE_API_KEY=your_key
ANGELONE_CLIENT_ID=your_id
ANGELONE_PASSWORD=your_password
ANGELONE_TOTP_SECRET=your_secret
DATABASE_URL=postgresql://...
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat_id
```

### Production Build
```bash
npm run build
npm run start
```

### Health Monitoring
- Check `/api/health` endpoint
- Monitor WebSocket connections
- Watch system logs
- Track daily P&L

## Next Steps

1. **Add More Strategies**
   - Implement remaining strategies from original codebase
   - Create custom strategies using BaseStrategy

2. **Enhanced OI Analysis**
   - Real-time option chain polling
   - PCR change rate tracking
   - Max pain calculation

3. **Advanced Risk Features**
   - Trailing stop loss
   - Partial profit booking
   - Correlation analysis
   - Portfolio heat map

4. **Machine Learning**
   - Pattern recognition
   - Confidence tuning
   - Strategy selection
   - Exit timing optimization

## Architecture Benefits

1. **Maintainability** - Clean, modular code is easy to update
2. **Testability** - Each component can be tested independently
3. **Scalability** - Easy to add new strategies or features
4. **Reliability** - Robust error handling and validation
5. **Performance** - Optimized for production trading

## Support

For questions or issues, refer to:
- `/server/core/` - Core functionality
- `/server/strategies-v2/` - Strategy implementations
- `/server/services/` - Business logic
- This README for architecture guidance

---

**Status**: Refactored and production-ready
**Version**: 2.0
**Last Updated**: 2026-02-20
