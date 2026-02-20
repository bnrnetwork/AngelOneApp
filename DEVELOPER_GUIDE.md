# AlgoTrader - Developer Quick Reference

## Quick Import Guide

### Strategy Definitions
```typescript
// Client-side (recommended)
import { STRATEGIES, STRATEGY_COLORS, STATUS_LABELS } from "@/lib/constants";

// Server-side or direct
import { STRATEGIES, STRATEGY_COLORS, STATUS_LABELS } from "@shared/schema";
```

### Utility Functions
```typescript
// All utilities
import {
  formatDuration,
  calculatePnlPercentage,
  formatCurrency,
  formatCompactNumber,
  calculateRiskRewardRatio,
  getStatusColor,
  calculateWinRate,
  calculateTotalPnl,
  getActiveSignals,
  getClosedSignals,
  safeDivide,
  formatPercentage,
} from "@shared/utils";

// Or via schema re-export
import { formatDuration, calculateWinRate } from "@shared/schema";
```

### Configuration Constants
```typescript
import {
  DEFAULT_CAPITAL,
  MIN_CONFIDENCE_REGULAR,
  MIN_CONFIDENCE_PREMIUM,
  STRATEGY_INTERVALS,
  SIGNAL_EXPIRY_TIMES,
  RSI_OVERBOUGHT,
  RSI_OVERSOLD,
  isMarketOpen,
  getStrategyInterval,
  getSignalExpiryTime,
  isValidCapital,
} from "@shared/config";
```

## Common Patterns

### Formatting Time (IST)
```typescript
import { formatIstTime } from "@shared/schema";

const timeString = formatIstTime(signal.createdAt);
// Output: "09:45:30 AM"
```

### Calculating Duration
```typescript
import { formatDuration } from "@shared/utils";

const duration = formatDuration(signal.createdAt, signal.closedTime);
// Output: "5m 30s" or "2h 15m"
```

### Displaying P&L
```typescript
import { formatCurrency, formatPercentage, calculatePnlPercentage } from "@shared/utils";

const pnlAmount = formatCurrency(signal.pnl);
// Output: "₹1,234.56"

const pnlPercent = formatPercentage(
  calculatePnlPercentage(signal.entryPrice, signal.exitPrice)
);
// Output: "+12.45%"
```

### Strategy Label with Short Name
```typescript
import { getStrategyLabel } from "@shared/schema";

const label = getStrategyLabel("ORB");
// Output: "Opening Range Breakout (ORB)"
```

### Calculating Statistics
```typescript
import { calculateWinRate, calculateTotalPnl, getActiveSignals } from "@shared/utils";

const winRate = calculateWinRate(signals);
// Output: 65.5 (as number, 0-100)

const totalPnl = calculateTotalPnl(signals);
// Output: 12345.67 (as number)

const activeSignals = getActiveSignals(signals);
// Output: Signal[] (filtered)
```

### Compact Number Formatting
```typescript
import { formatCompactNumber } from "@shared/utils";

formatCompactNumber(5000);      // "5.0K"
formatCompactNumber(150000);    // "1.50L"
formatCompactNumber(25000000);  // "2.50Cr"
```

### Checking Market Hours
```typescript
import { isMarketOpen } from "@shared/config";

if (isMarketOpen()) {
  // Execute trading logic
  console.log("Market is open!");
}
```

### Getting Strategy Intervals
```typescript
import { getStrategyInterval, getSignalExpiryTime } from "@shared/config";

const interval = getStrategyInterval("ORB");
// Output: 60000 (1 minute in ms)

const expiryTime = getSignalExpiryTime("SCALP");
// Output: 600000 (10 minutes in ms)
```

### Checking Strategy Trading Time Window
```typescript
import { 
  isStrategyTradingTime,
  formatStrategyTimingWindow,
  getMinutesUntilStrategyOpen 
} from "@shared/config";

// Check if ORB is currently tradeable
if (isStrategyTradingTime("ORB")) {
  console.log("ORB window is open, can generate signals");
}

// Display timing for user
const timing = formatStrategyTimingWindow("ORB");
console.log(`ORB trades: ${timing}`); // "09:25 - 11:00 IST"

// Get minutes until strategy opens
const mins = getMinutesUntilStrategyOpen("AFTERNOON_VWAP_MOMENTUM");
if (mins > 0) {
  console.log(`AFTERNOON_VWAP_MOMENTUM opens in ${mins} minutes`);
}
```

### Safe Division
```typescript
import { safeDivide } from "@shared/utils";

const average = safeDivide(total, count, 0);
// Returns 0 if count is 0, avoiding NaN or Infinity
```

### Risk-Reward Calculation
```typescript
import { calculateRiskRewardRatio } from "@shared/utils";

const rrr = calculateRiskRewardRatio(entryPrice, target1, stoploss);
// Output: 1.5 (reward is 1.5x the risk)
```

## File Organization

```
shared/
├── schema.ts       # Database schema, strategies, types
├── utils.ts        # Utility functions (15+ helpers)
└── config.ts       # Configuration constants

client/
└── src/
    ├── lib/
    │   └── constants.ts    # Re-exports from shared
    └── components/
        └── *.tsx           # Use @/lib/constants

server/
└── *.ts            # Use @shared/schema, @shared/config
```

## Best Practices

### ✅ Do
- Import from `@/lib/constants` in client components
- Use shared utilities for calculations
- Use config constants instead of magic numbers
- Use type-safe imports with TypeScript
- Document any new utilities with JSDoc

### ❌ Don't
- Duplicate code between client/server
- Use magic numbers (use config instead)
- Implement calculations inline (use utilities)
- Create multiple versions of the same function
- Use `any` type (use proper types from schema)

## Adding New Features

### Adding a New Strategy
1. Add to `strategyEnum` in `shared/schema.ts`
2. Add to `STRATEGIES` array in `shared/schema.ts`
3. Add color to `STRATEGY_COLORS` in `shared/schema.ts`
4. Add interval to `STRATEGY_INTERVALS` in `shared/config.ts`
5. Add expiry time to `SIGNAL_EXPIRY_TIMES` in `shared/config.ts`
6. Add icon mapping in `client/src/components/app-sidebar.tsx`

### Adding a New Utility Function
1. Add to `shared/utils.ts`
2. Include JSDoc comment
3. Add proper TypeScript types
4. Export the function
5. It will be available via `@shared/utils` or `@shared/schema`

### Adding a New Config Constant
1. Add to appropriate section in `shared/config.ts`
2. Include JSDoc comment explaining purpose
3. Use `as const` for object/array constants
4. Import where needed

## TypeScript Types

### Available Types
```typescript
import type {
  Signal,
  InsertSignal,
  Log,
  InsertLog,
  User,
  InsertUser,
  StrategyKey,
  InstrumentType,
} from "@shared/schema";
```

### Type Guards (Future)
Coming in Phase 3:
- `isValidSignal(data: unknown): data is Signal`
- `isStrategyKey(key: string): key is StrategyKey`
- `isInstrumentType(inst: string): inst is InstrumentType`

## Configuration Values Reference

### Confidence Thresholds
- Regular strategies: `MIN_CONFIDENCE_REGULAR` (80%)
- Premium strategies: `MIN_CONFIDENCE_PREMIUM` (85%)

### RSI Thresholds
- Overbought: `RSI_OVERBOUGHT` (70)
- Oversold: `RSI_OVERSOLD` (30)
- Mid-range: `RSI_MID_LOW` (40) to `RSI_MID_HIGH` (60)

### Market Hours (IST)
- Open: 09:15 AM
- Close: 03:30 PM
- Check: `isMarketOpen()`

### Capital Limits
- Minimum: `MIN_CAPITAL` (₹10,000)
- Maximum: `MAX_CAPITAL` (₹2,00,000)
- Default: `DEFAULT_CAPITAL` (₹10,000)

## Testing

### Running Tests (Future)
```bash
# Unit tests for utilities
npm run test:utils

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e
```

### Manual Testing Checklist
- [ ] Import statements work
- [ ] Utilities return expected values
- [ ] Config constants accessible
- [ ] No TypeScript errors
- [ ] No runtime errors
- [ ] Times display in IST
- [ ] Calculations are accurate

## Support

For questions or issues:
1. Check this guide first
2. Review `REFACTOR_SUMMARY.md`
3. Check inline JSDoc comments
4. Review source code in `shared/` folder

## Version History

- **v1.0.0** (2026-02-15) - Initial refactoring complete
  - Consolidated strategy definitions
  - Created shared utilities module
  - Created configuration module
  - Updated client components
  - Comprehensive documentation
