# ⚠️ DEPRECATED - See INDEX.md Instead

**This file is archived. Please use:**
- **Primary Entry Point**: [INDEX.md](INDEX.md)
- **Developer Reference**: [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)
- **Setup Instructions**: [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md)

---

# 🚀 Quick Start Guide - AlgoTrader (Historical Reference)

## Recent Refactoring (February 15, 2026) ✨

The application was recently refactored to improve code quality and maintainability. See **[REFACTOR_SUMMARY.md](REFACTOR_SUMMARY.md)** for complete details.

---

## 📚 Documentation

### For Developers
- **[DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)** - Quick reference for imports, patterns, best practices
- **[REFACTOR_SUMMARY.md](REFACTOR_SUMMARY.md)** - Complete refactoring documentation
- **[00_START_HERE.txt](00_START_HERE.txt)** - Original quick start guide

### Architecture & Integration
- **[ARCHITECTURE_DIAGRAM.md](ARCHITECTURE_DIAGRAM.md)** - System architecture
- **[INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md)** - Integration instructions
- **[PRODUCTION_ENGINE_SUMMARY.md](PRODUCTION_ENGINE_SUMMARY.md)** - Production engine details

### Deployment
- **[DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)** - Deployment checklist
- **[COMPLETION_SUMMARY.md](COMPLETION_SUMMARY.md)** - Completion status

---

## 🎯 What's New

### Shared Modules ✨
Three new shared modules for better code organization:

1. **shared/schema.ts** - Central definitions
   - 13 strategies with descriptions
   - Type definitions (Signal, MarketData, etc.)
   - Strategy colors and status labels
   - Basic utilities (getStrategyLabel, formatIstTime)

2. **shared/utils.ts** - Utility functions
   - 15+ reusable functions
   - Calculations (win rate, P&L, risk/reward)
   - Formatting (currency, duration, compact numbers)
   - Signal filtering (active, closed, by status)

3. **shared/config.ts** - Configuration
   - Trading parameters (capital, confidence thresholds)
   - Strategy intervals and expiry times
   - Market hours and timings
   - Technical indicator thresholds
   - Validation rules

### Benefits
- ✅ No code duplication
- ✅ Single source of truth
- ✅ Consistent calculations
- ✅ Easy to maintain
- ✅ Better type safety

---

## 🛠️ Development Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Create `.env` file with:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/angelone
ANGELONE_API_KEY=your_api_key
ANGELONE_CLIENT_CODE=your_client_code
ANGELONE_PASSWORD=your_password
TELEGRAM_BOT_TOKEN=your_telegram_token
TELEGRAM_CHAT_ID=your_chat_id
```

### 3. Run Database Migrations
```bash
npm run db:migrate
```

### 4. Start Development Server
```bash
npm run dev
```

Server will start at `http://localhost:5000` (or configured port)

---

## 📖 Common Tasks

### Import Strategy Definitions
```typescript
import { STRATEGIES, STRATEGY_COLORS } from "@/lib/constants";

// Display all strategies
STRATEGIES.forEach(strategy => {
  console.log(strategy.name); // "Opening Range Breakout"
  console.log(strategy.shortName); // "ORB"
  console.log(strategy.description); // "Trades breakout..."
});
```

### Use Utility Functions
```typescript
import { 
  calculateWinRate, 
  calculateTotalPnl,
  formatCurrency,
  formatIstTime 
} from "@shared/utils";

// Calculate win rate
const winRate = calculateWinRate(signals); // 67.5

// Calculate total P&L
const totalPnl = calculateTotalPnl(signals); // 15250

// Format currency
const formatted = formatCurrency(15250); // "₹15,250.00"

// Format IST time
const istTime = formatIstTime(new Date()); // "15/02/2026, 03:45:30 PM IST"
```

### Access Configuration
```typescript
import { 
  MIN_CONFIDENCE_REGULAR,
  isMarketOpen,
  getStrategyInterval 
} from "@shared/config";

// Check confidence threshold
if (signal.confidence >= MIN_CONFIDENCE_REGULAR) {
  // Process signal
}

// Check if market is open
if (isMarketOpen()) {
  // Trade
}

// Get strategy interval
const interval = getStrategyInterval("ORB"); // 15 minutes
```

---

## 🎯 Strategies

All 13 strategies are displayed in the sidebar:

1. **Opening Range Breakout (ORB)** - Trades breakout of initial range
2. **Smart Money Trap Reversal (SMTR)** - Reversal after false breakouts
3. **EMA Crossover (9/21) (EMA)** - Moving average crossovers
4. **VWAP Bounce (VWAP)** - Bounces from VWAP level
5. **Supertrend (ST) (ST)** - Trend-following with Supertrend indicator
6. **RSI Reversal (RSI)** - Oversold/overbought reversals
7. **Triple Confluence (EMA+VWAP+RSI) (3Conf)** - Multiple indicator alignment
8. **Market Top Reversal (M-Top)** - Topping pattern reversals
9. **Momentum Scalp (Scalp)** - Quick momentum scalps
10. **Pro ORB (AI) (ProORB)** - AI-enhanced ORB with regime filtering
11. **VWAP Mean Reversion (VRev)** - Mean reversion from VWAP extremes
12. **Breakout Strength (BS)** - Multi-factor breakout scoring
13. **Regime-Based (AI) (Regime)** - Auto-selects best strategy for conditions

---

## 📁 Key Files

### Shared Modules
- **shared/schema.ts** - Database schema, types, strategies
- **shared/utils.ts** - Utility functions
- **shared/config.ts** - Configuration constants

### Client
- **client/src/lib/constants.ts** - Re-exports shared modules
- **client/src/components/signal-table.tsx** - Signal display table
- **client/src/components/stats-cards.tsx** - Statistics cards
- **client/src/components/ui/sidebar.tsx** - Sidebar component (17rem wide)

### Server
- **server/strategies.ts** - Main strategy logic
- **server/angelone.ts** - AngelOne API integration
- **server/routes.ts** - API routes
- **server/strategies/** - Advanced strategy engines

### Documentation
- **REFACTOR_SUMMARY.md** - Complete refactoring guide
- **DEVELOPER_GUIDE.md** - Developer quick reference
- **INDEX.md** - Full project index

---

## 🔧 Next Steps

### After Starting Dev Server
1. ✅ Verify all 13 strategies appear in sidebar
2. ✅ Check strategy names show format "Name (Short)"
3. ✅ Confirm times display in IST format
4. ✅ Validate sidebar width is readable (17rem)

### Future Improvements (See REFACTOR_SUMMARY.md Phase 2)
1. Update server strategies to use config constants
2. Add unit tests for utility functions
3. Performance monitoring for shared modules
4. Additional configuration options as needed

---

## 📞 Help & Support

### Having Issues?
1. Check **[DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)** for common patterns
2. Review **[REFACTOR_SUMMARY.md](REFACTOR_SUMMARY.md)** for architecture
3. See **[INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md)** for integration help
4. Check TypeScript errors: Look for import issues with `@shared/` modules

### Common Issues
- **Import errors**: Make sure tsconfig.json has path mapping for `@shared/*`
- **Type errors**: Ensure Signal type is imported from `@shared/schema`
- **Calculation differences**: Use shared utilities, not local implementations
- **Configuration values**: Import from `@shared/config`, don't hardcode

---

## 🎉 You're Ready!

The application is now refactored with:
- ✅ Centralized strategy definitions
- ✅ Shared utility functions
- ✅ Consistent configuration
- ✅ Better code organization
- ✅ Comprehensive documentation

Start building! See **[DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)** for quick examples.
