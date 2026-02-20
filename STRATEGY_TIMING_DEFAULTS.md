# Strategy Timing Defaults

**Purpose**: Central reference for all strategy-specific timing windows. When each strategy should start and end trading during the day.

---

## Overview

Each trading strategy has a configured trading window defining when it should actively generate signals. This document maintains all strategy timing defaults for easy reference and updates.

**Default Timezone**: IST (Indian Standard Time)  
**Configuration File**: [shared/config.ts](shared/config.ts) → `STRATEGY_TIMING_WINDOWS`  
**Helper Functions**: 
- `isStrategyTradingTime()` - Check if strategy is tradeable now
- `formatStrategyTimingWindow()` - Display timing window
- `getStrategyTimingWindow()` - Get timing config

---

## Morning Strategies (9:15 AM - 3:30 PM)

| Strategy | Start | End | Duration | Description |
|----------|-------|-----|----------|-------------|
| **ORB** (Opening Range Breakout) | 09:25 | 11:00 | 1h 35m | First 15-min range breakout |
| **SMTR** (Smart Money Trap) | 09:45 | 11:30 | 1h 45m | Reversal after false breakouts |
| **EMA** (EMA Crossover) | 09:30 | 15:15 | Full day | Moving average crossovers |
| **VWAP_PULLBACK** (VWAP Bounce) | 09:30 | 15:15 | Full day | VWAP bounce strategies |
| **VWAP_RSI** (Supertrend) | 09:30 | 15:15 | Full day | Trend following indicator |
| **RSI** (RSI Reversal) | 10:00 | 14:45 | 4h 45m | Oversold/overbought extremes |
| **EMA_VWAP_RSI** (Triple Confluence) | 10:00 | 14:30 | 4h 30m | Multi-indicator alignment |
| **MARKET_TOP** (Market Reversal) | 10:30 | 15:00 | 4h 30m | High/low reversal patterns |
| **SCALP** (Momentum Scalp) | 10:00 | 15:15 | 5h 15m | Quick momentum plays |

---

## Advanced/Production Strategies

| Strategy | Start | End | Duration | Description |
|----------|-------|-----|----------|-------------|
| **PRO_ORB** (AI ORB) | 09:25 | 11:00 | 1h 35m | AI-enhanced opening range |
| **VWAP_REVERSION** | 11:00 | 14:30 | 3h 30m | Mean reversion in sideways |
| **BREAKOUT_STRENGTH** | 10:00 | 14:45 | 4h 45m | Quality-scored breakouts |
| **REGIME_BASED** (Adaptive AI) | 09:30 | 15:15 | Full day | AI selects best strategy |

---

## Afternoon Strategies

| Strategy | Start | End | Duration | Description |
|----------|-------|-----|----------|-------------|
| **AFTERNOON_VWAP_MOMENTUM** | 13:45 | 15:10 | 1h 25m | Day high/low breakout (last 90 min) |

---

## Timeline Visualization

```
Market Hours: 09:15 AM ────── 03:30 PM IST

09:15 ───────────────────────────────────────── 15:30
 │
 ├─ 09:25-11:00 ................. ORB + PRO_ORB (morning range traders)
 ├─ 09:45-11:30 .......................... SMTR (fake breakout catchers)
 ├─ 09:30-15:15 ................................. EMA (all day)
 ├─ 09:30-15:15 ............................... VWAP_PULLBACK (all day)
 ├─ 09:30-15:15 ............................... VWAP_RSI (all day)
 ├─ 10:00-14:45 ............................. RSI (mid-session)
 ├─ 10:00-14:30 ........................... EMA_VWAP_RSI (triple)
 ├─ 10:30-15:00 ............................... MARKET_TOP (reversals)
 ├─ 10:00-15:15 ....................................... SCALP (quick)
 ├─ 11:00-14:30 .................................. VWAP_REVERSION (mean)
 ├─ 10:00-14:45 ............................. BREAKOUT_STRENGTH
 ├─ 09:30-15:15 .................................... REGIME_BASED
 │
 └─ 13:45-15:10 ........................ AFTERNOON_VWAP_MOMENTUM (afternoon)
```

---

## Usage in Code

### Import
```typescript
import {
  STRATEGY_TIMING_WINDOWS,
  isStrategyTradingTime,
  formatStrategyTimingWindow,
  getStrategyTimingWindow,
  getMinutesUntilStrategyOpen,
} from "@shared/config";
```

### Check if Strategy is Tradeable Now
```typescript
const now = new Date();
if (isStrategyTradingTime("ORB", now)) {
  // ORB is active 09:25-11:00, generate signal if criteria met
  console.log("ORB trading window is open");
}
```

### Display Timing for User
```typescript
const timing = formatStrategyTimingWindow("ORB");
console.log(`ORB trades: ${timing}`); // Output: "09:25 - 11:00 IST"
```

### Get Full Timing Configuration
```typescript
const orbTiming = getStrategyTimingWindow("ORB");
console.log(orbTiming);
// Output: {
//   startHour: 9,
//   startMinute: 25,
//   endHour: 11,
//   endMinute: 0,
//   name: "Opening Range Breakout",
//   description: "First 15-min range breakout"
// }
```

### Check Time Until Strategy Opens
```typescript
const minutesUntil = getMinutesUntilStrategyOpen("ORB");
if (minutesUntil > 0) {
  console.log(`ORB opens in ${minutesUntil} minutes`);
} else if (minutesUntil < 0) {
  console.log("ORB window has closed");
} else {
  console.log("ORB is opening now!");
}
```

---

## Strategy-Specific Details

### ORB (Opening Range Breakout) - 09:25 to 11:00
- **Focus**: First 15-minute range breakout
- **Market Phase**: Early session momentum
- **Confidence%**: 80% minimum
- **Best For**: Trending days with clear opening

### AFTERNOON_VWAP_MOMENTUM - 13:45 to 15:10
- **Focus**: Day high/low breakout with option premium confirmation
- **Market Phase**: Last 90 minutes of session
- **Time Window**: Strictly 13:45-15:10 IST (expanded from close at 15:30)
- **Confidence%**: 75% minimum
- **Best For**: Establishing day high/low breakout trades

### REGIME_BASED (AI) - 09:30 to 15:15
- **Focus**: Adaptive strategy selection based on market regime
- **Market Phase**: All day (full market hours)
- **Adapts To**:
  - SIDEWAYS → Use VWAP_REVERSION
  - TRENDING → Use ORB or VWAP strategies
  - BREAKOUT → Use aggressive ORB
- **Confidence%**: Varies by detected regime

---

## Configuration Updates

### How to Update Strategy Timing

1. **Open**: [shared/config.ts](shared/config.ts)
2. **Find**: `STRATEGY_TIMING_WINDOWS` constant (around line 68)
3. **Edit**: Update `startHour`, `startMinute`, `endHour`, `endMinute` for any strategy
4. **Example**:
   ```typescript
   // Change ORB from 09:25-11:00 to 09:30-11:30
   ORB: { 
     startHour: 9, startMinute: 30,    // Changed from 25 to 30
     endHour: 11, endMinute: 30,       // Changed from 0 to 30
     name: "Opening Range Breakout", 
     description: "..." 
   }
   ```

### Adding New Strategy Timing
```typescript
NEW_STRATEGY: { 
  startHour: 10, 
  startMinute: 0, 
  endHour: 14, 
  endMinute: 30, 
  name: "New Strategy Name", 
  description: "Strategy description" 
},
```

---

## Notes & Considerations

### General Market Hours
- **Market Opens**: 09:15 AM IST
- **Market Closes**: 03:30 PM IST
- **Typical Trading Window**: 09:15 - 15:30 IST

### Strategy Timing Philosophy
- Early strategies (ORB) focus on opening range direction
- Mid-session strategies catch trend/reversal moves
- Late strategies (AFTERNOON_VWAP) trade established day extremes
- All-day strategies adapt to market conditions throughout session

### IST Timezone
All times are in **Indian Standard Time (IST)**, UTC+5:30.
For international reference:
- IST 09:15 AM = GMT 03:45 AM
- IST 03:30 PM = GMT 10:00 AM

### Sync with Market Events
- Pre-market: 09:00 AM (data flows but not tradeable)
- Open: 09:15 AM (official market open)
- ORB Window: 09:25-10:30 (first 15 min of trading)
- Mid-session: 11:30 AM - 1:00 PM (lunch affect)
- Afternoon: 1:45 PM - 3:10 PM (last 90 minutes)
- Close: 3:30 PM (official market close)

---

## Testing Strategy Timing

### Unit Test Example
```typescript
import { isStrategyTradingTime, STRATEGY_TIMING_WINDOWS } from "@shared/config";

// Test ORB at 09:25 (should be true)
const orbOpen = new Date("2026-02-20T09:25:00");
expect(isStrategyTradingTime("ORB", orbOpen)).toBe(true);

// Test ORB at 09:24 (should be false)
const orbClosed = new Date("2026-02-20T09:24:00");
expect(isStrategyTradingTime("ORB", orbClosed)).toBe(false);

// Test ORB at 11:01 (should be false)
const orbExpired = new Date("2026-02-20T11:01:00");
expect(isStrategyTradingTime("ORB", orbExpired)).toBe(false);
```

---

## Cross-Reference

- **Config Source**: [shared/config.ts](shared/config.ts)
- **Strategy Details**: [server/strategies/README.md](server/strategies/README.md)
- **ORB Strategy**: [server/strategies/orb-engine.ts](server/strategies/orb-engine.ts)
- **Afternoon Strategy**: [server/strategies/afternoon-vwap-momentum-engine.ts](server/strategies/afternoon-vwap-momentum-engine.ts)
- **Architecture**: [ARCHITECTURE_DIAGRAM.md](ARCHITECTURE_DIAGRAM.md)

---

**Last Updated**: February 20, 2026  
**Maintained By**: Development Team  
**Review Frequency**: Quarterly or as market hours change
