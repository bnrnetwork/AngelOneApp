/**
 * Application Configuration Constants
 * 
 * Central location for all magic numbers, intervals, and configuration values.
 * This improves maintainability and makes it easy to adjust application behavior.
 */

// ===================
// TRADING PARAMETERS
// ===================

/**
 * Default capital allocation
 */
export const DEFAULT_CAPITAL = 50000;

/**
 * Minimum capital allowed
 */
export const MIN_CAPITAL = 10000;

/**
 * Maximum capital allowed
 */
export const MAX_CAPITAL = 200000;

/**
 * Default risk percentage per trade
 */
export const DEFAULT_RISK_PERCENT = 1.5;

/**
 * Minimum confidence threshold for regular strategies
 */
export const MIN_CONFIDENCE_REGULAR = 80;

/**
 * Minimum confidence threshold for premium strategies (SCALP, MARKET_TOP)
 */
export const MIN_CONFIDENCE_PREMIUM = 85;

// ===================
// TIME INTERVALS (ms)
// ===================

/**
 * Strategy execution intervals by strategy type
 */
export const STRATEGY_INTERVALS = {
  ORB: 60000,           // 1 minute
  SMTR: 60000,          // 1 minute
  EMA: 60000,           // 1 minute
  VWAP_PULLBACK: 60000, // 1 minute
  VWAP_RSI: 60000,      // 1 minute
  RSI: 60000,           // 1 minute
  RSI_RANGE: 60000,     // 1 minute
  GAP_FADE: 60000,      // 1 minute
  CPR: 60000,           // 1 minute
  INSIDE_CANDLE: 60000, // 1 minute
  EMA_VWAP_RSI: 60000,  // 1 minute
  MARKET_TOP: 45000,    // 45 seconds
  SCALP: 30000,         // 30 seconds
  PRO_ORB: 60000,       // 1 minute
  VWAP_REVERSION: 60000,// 1 minute
  BREAKOUT_STRENGTH: 60000, // 1 minute
  REGIME_BASED: 60000,  // 1 minute
  EMA_PULLBACK: 60000,  // 1 minute
  AFTERNOON_VWAP_MOMENTUM: 60000, // 1 minute
} as const;

/**
 * Signal expiry times by strategy type
 */
export const SIGNAL_EXPIRY_TIMES = {
  ORB: 20 * 60000,          // 20 minutes
  SMTR: 15 * 60000,         // 15 minutes
  EMA: 20 * 60000,          // 20 minutes
  VWAP_PULLBACK: 15 * 60000,// 15 minutes
  VWAP_RSI: 20 * 60000,     // 20 minutes
  RSI: 15 * 60000,          // 15 minutes
  RSI_RANGE: 15 * 60000,    // 15 minutes
  GAP_FADE: 20 * 60000,     // 20 minutes
  CPR: 20 * 60000,          // 20 minutes
  INSIDE_CANDLE: 15 * 60000,// 15 minutes
  EMA_VWAP_RSI: 20 * 60000, // 20 minutes
  MARKET_TOP: 20 * 60000,   // 20 minutes
  SCALP: 10 * 60000,        // 10 minutes
  PRO_ORB: 20 * 60000,      // 20 minutes
  VWAP_REVERSION: 15 * 60000,// 15 minutes
  BREAKOUT_STRENGTH: 20 * 60000, // 20 minutes
  REGIME_BASED: 20 * 60000, // 20 minutes
  EMA_PULLBACK: 10 * 60000, // 10 minutes
  AFTERNOON_VWAP_MOMENTUM: 10 * 60000, // 10 minutes
} as const;

/**
 * Strategy-specific trading windows (IST timezone)
 * Defines when each strategy should START and END during the trading day
 * Format: { startHour, startMinute, endHour, endMinute }
 */
export const STRATEGY_TIMING_WINDOWS = {
  // Morning Strategies (9:15 AM - 3:30 PM)
  ORB: { startHour: 9, startMinute: 25, endHour: 11, endMinute: 30, name: "Opening Range Breakout", description: "First 15-min range breakout" },
  SMTR: { startHour: 9, startMinute: 45, endHour: 11, endMinute: 30, name: "Smart Money Trap", description: "Reversal after false breakouts" },
  //EMA: { startHour: 9, startMinute: 30, endHour: 15, endMinute: 15, name: "EMA Crossover", description: "All day EMA strategy" },
  EMA: { startHour: 9, startMinute: 45, endHour: 15, endMinute: 15, name: "EMA Crossover", description: "All day EMA strategy" },
  VWAP_PULLBACK: { startHour: 9, startMinute: 30, endHour: 15, endMinute: 15, name: "VWAP Bounce", description: "VWAP pullback strategy" },
  VWAP_RSI: { startHour: 9, startMinute: 30, endHour: 15, endMinute: 15, name: "Supertrend", description: "Full day trend following" },
  RSI: { startHour: 10, startMinute: 0, endHour: 14, endMinute: 45, name: "RSI Reversal", description: "RSI oversold/overbought" },
  //RSI_RANGE: { startHour: 10, startMinute: 0, endHour: 14, endMinute: 45, name: "RSI Range", description: "Range-bound RSI mean reversion" },
  RSI_RANGE: { startHour: 11, startMinute: 30, endHour: 14, endMinute: 45, name: "RSI Range", description: "Range-bound RSI mean reversion" },
  GAP_FADE: { startHour: 9, startMinute: 20, endHour: 10, endMinute: 45, name: "Gap Fade", description: "Fade opening gaps with confirmation" },
  //CPR: { startHour: 9, startMinute: 30, endHour: 15, endMinute: 15, name: "CPR", description: "Central Pivot Range breakout/reversion" },
  CPR: { startHour: 10, startMinute: 0, endHour: 15, endMinute: 15, name: "CPR", description: "Central Pivot Range breakout/reversion" },
  INSIDE_CANDLE: { startHour: 9, startMinute: 30, endHour: 15, endMinute: 15, name: "Inside Candle", description: "Inside candle breakout with trend alignment" },
  EMA_VWAP_RSI: { startHour: 10, startMinute: 0, endHour: 14, endMinute: 30, name: "Triple Confluence", description: "Multi-indicator alignment" },
  MARKET_TOP: { startHour: 10, startMinute: 30, endHour: 15, endMinute: 0, name: "Market Top Reversal", description: "High/low reversal patterns" },
  SCALP: { startHour: 10, startMinute: 0, endHour: 15, endMinute: 15, name: "Momentum Scalp", description: "Quick momentum plays" },
  

  // Advanced/Production Strategies
  PRO_ORB: { startHour: 9, startMinute: 20, endHour: 10, endMinute: 15, name: "Pro ORB (AI)", description: "AI-enhanced opening range breakout" },
  //VWAP_REVERSION: { startHour: 11, startMinute: 0, endHour: 14, endMinute: 30, name: "VWAP Mean Reversion", description: "Sideways market reversion" },
  VWAP_REVERSION: { startHour: 11, startMinute: 30, endHour: 14, endMinute: 30, name: "VWAP Mean Reversion", description: "Sideways market reversion" },
  //BREAKOUT_STRENGTH: { startHour: 10, startMinute: 0, endHour: 14, endMinute: 45, name: "Breakout Strength", description: "Quality-scored breakouts" },
  BREAKOUT_STRENGTH: { startHour: 10, startMinute: 15, endHour: 14, endMinute: 45, name: "Breakout Strength", description: "Quality-scored breakouts" },
  REGIME_BASED: { startHour: 9, startMinute: 30, endHour: 15, endMinute: 15, name: "Regime-Based (AI)", description: "Adaptive AI strategy selection" },
  //EMA_PULLBACK: { startHour: 9, startMinute: 30, endHour: 14, endMinute: 45, name: "EMA Pullback", description: "EMA21 pullback with trend and breakout confirmation" },
  EMA_PULLBACK: { startHour: 10, startMinute: 0, endHour: 14, endMinute: 45, name: "EMA Pullback", description: "EMA21 pullback with trend and breakout confirmation" },
  

  // Afternoon Strategy
  AFTERNOON_VWAP_MOMENTUM: { startHour: 13, startMinute: 45, endHour: 15, endMinute: 10, name: "Afternoon VWAP Momentum", description: "Day high/low breakout in last 90 min" },
} as const;

// Type for strategy timing configuration
export type StrategyTimingConfig = {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  name: string;
  description: string;
};

/**
 * WebSocket reconnection delay
 */
export const WS_RECONNECT_DELAY = 3000; // 3 seconds

/**
 * Market data refresh interval
 */
export const MARKET_DATA_REFRESH = 1000; // 1 second

/**
 * Price update broadcast interval
 */
export const PRICE_UPDATE_INTERVAL = 1000; // 1 second

/**
 * Query refetch interval for client
 */
export const QUERY_REFETCH_INTERVAL = 5000; // 5 seconds

// ===================
// MARKET HOURS
// ===================

/**
 * Market opening hour (24h format, IST)
 */
export const MARKET_OPEN_HOUR = 9;

/**
 * Market opening minute
 */
export const MARKET_OPEN_MINUTE = 15;

/**
 * Market closing hour (24h format, IST)
 */
export const MARKET_CLOSE_HOUR = 15;

/**
 * Market closing minute
 */
export const MARKET_CLOSE_MINUTE = 30;

/**
 * ORB (Opening Range Breakout) duration in minutes
 */
export const ORB_DURATION_MINUTES = 15;

// ===================
// TECHNICAL INDICATORS
// ===================

/**
 * RSI overbought threshold
 */
export const RSI_OVERBOUGHT = 70;

/**
 * RSI oversold threshold
 */
export const RSI_OVERSOLD = 30;

/**
 * RSI mid-range lower bound
 */
export const RSI_MID_LOW = 40;

/**
 * RSI mid-range upper bound
 */
export const RSI_MID_HIGH = 60;

/**
 * ATR multiplier for volatility filter
 */
export const ATR_MULTIPLIER = 1.5;

/**
 * Minimum volume multiplier for valid signals
 */
export const MIN_VOLUME_MULTIPLIER = 1.2;

// ===================
// PROFIT/LOSS TARGETS
// ===================

/**
 * Target multipliers for profit taking
 */
export const TARGET_MULTIPLIERS = {
  TARGET1: 1.5,  // 1.5x risk
  TARGET2: 2.0,  // 2.0x risk
  TARGET3: 3.0,  // 3.0x risk
} as const;

/**
 * Trailing stop activation threshold (as percentage of target1)
 */
export const TRAILING_STOP_ACTIVATION = 0.7; // 70% of target1

/**
 * Trailing stop distance (percentage)
 */
export const TRAILING_STOP_DISTANCE = 0.5; // 0.5%

// ===================
// RETRY & ERROR HANDLING
// ===================

/**
 * Maximum retry attempts for API calls
 */
export const MAX_RETRY_ATTEMPTS = 3;

/**
 * Retry delay for failed API calls
 */
export const RETRY_DELAY = 3000; // 3 seconds

/**
 * Maximum WebSocket reconnection attempts
 */
export const MAX_WS_RECONNECT_ATTEMPTS = 5;

// ===================
// LOGGING & MONITORING
// ===================

/**
 * Log retention period (days)
 */
export const LOG_RETENTION_DAYS = 30;

/**
 * Performance metrics collection interval
 */
export const METRICS_INTERVAL = 60000; // 1 minute

/**
 * Maximum log entries to keep in memory
 */
export const MAX_LOG_ENTRIES = 1000;

// ===================
// UI CONFIGURATION
// ===================

/**
 * Toast notification duration (ms)
 */
export const TOAST_DURATION = 3000; // 3 seconds

/**
 * Sidebar collapsed width (rem)
 */
export const SIDEBAR_WIDTH = 17;

/**
 * Sidebar mobile width (rem)
 */
export const SIDEBAR_WIDTH_MOBILE = 19;

/**
 * Maximum items per page in tables
 */
export const TABLE_ITEMS_PER_PAGE = 50;

/**
 * Chart data points to display
 */
export const CHART_DATA_POINTS = 100;

// ===================
// VALIDATION
// ===================

/**
 * Minimum strike price
 */
export const MIN_STRIKE_PRICE = 100;

/**
 * Maximum strike price
 */
export const MAX_STRIKE_PRICE = 100000;

/**
 * Minimum entry price
 */
export const MIN_ENTRY_PRICE = 1;

/**
 * Maximum entry price
 */
export const MAX_ENTRY_PRICE = 10000;

/**
 * Username min length
 */
export const USERNAME_MIN_LENGTH = 3;

/**
 * Username max length
 */
export const USERNAME_MAX_LENGTH = 30;

/**
 * Password min length
 */
export const PASSWORD_MIN_LENGTH = 6;

// ===================
// HELPER FUNCTIONS
// ===================

/**
 * Check if current time is within market hours (IST)
 */
export function isMarketOpen(): boolean {
  const now = new Date();
  const istTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const hour = istTime.getHours();
  const minute = istTime.getMinutes();
  const day = istTime.getDay();
  
  // Weekend check (0 = Sunday, 6 = Saturday)
  if (day === 0 || day === 6) return false;
  
  const currentMinutes = hour * 60 + minute;
  const openMinutes = MARKET_OPEN_HOUR * 60 + MARKET_OPEN_MINUTE;
  const closeMinutes = MARKET_CLOSE_HOUR * 60 + MARKET_CLOSE_MINUTE;
  
  return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
}

/**
 * Get strategy interval by strategy key
 */
export function getStrategyInterval(strategy: keyof typeof STRATEGY_INTERVALS): number {
  return STRATEGY_INTERVALS[strategy] || 60000;
}

/**
 * Get signal expiry time by strategy key
 */
export function getSignalExpiryTime(strategy: keyof typeof SIGNAL_EXPIRY_TIMES): number {
  return SIGNAL_EXPIRY_TIMES[strategy] || 15 * 60000;
}

/**
 * Get strategy timing window by strategy key
 * Returns undefined if strategy not found
 */
export function getStrategyTimingWindow(strategy: keyof typeof STRATEGY_TIMING_WINDOWS): StrategyTimingConfig | undefined {
  return STRATEGY_TIMING_WINDOWS[strategy];
}

/**
 * Check if current time is within strategy's trading window
 * @param strategy - Strategy key
 * @param now - Current time (defaults to now)
 * @returns true if within trading window, false otherwise
 */
export function isStrategyTradingTime(strategy: keyof typeof STRATEGY_TIMING_WINDOWS, now: Date = new Date()): boolean {
  const timing = STRATEGY_TIMING_WINDOWS[strategy];
  if (!timing) return true; // If strategy not in list, assume always tradeable

  // Get current hour and minute in IST
  const hours = now.getHours();
  const minutes = now.getMinutes();

  // Convert to minutes for easier comparison
  const currentMinutes = hours * 60 + minutes;
  const startMinutes = timing.startHour * 60 + timing.startMinute;
  const endMinutes = timing.endHour * 60 + timing.endMinute;

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

/**
 * Format strategy timing window for display
 * @param strategy - Strategy key
 * @returns Formatted string like "09:25 - 11:00 IST"
 */
export function formatStrategyTimingWindow(strategy: keyof typeof STRATEGY_TIMING_WINDOWS): string {
  const timing = STRATEGY_TIMING_WINDOWS[strategy];
  if (!timing) return "All day";

  const padZero = (n: number) => String(n).padStart(2, "0");
  const start = `${padZero(timing.startHour)}:${padZero(timing.startMinute)}`;
  const end = `${padZero(timing.endHour)}:${padZero(timing.endMinute)}`;
  return `${start} - ${end} IST`;
}

/**
 * Get time until strategy trading window opens
 * @param strategy - Strategy key
 * @param now - Current time (defaults to now)
 * @returns Minutes until window opens (negative if already open, positive if closed)
 */
export function getMinutesUntilStrategyOpen(strategy: keyof typeof STRATEGY_TIMING_WINDOWS, now: Date = new Date()): number {
  const timing = STRATEGY_TIMING_WINDOWS[strategy];
  if (!timing) return 0;

  const hours = now.getHours();
  const minutes = now.getMinutes();
  const currentMinutes = hours * 60 + minutes;
  const startMinutes = timing.startHour * 60 + timing.startMinute;

  return startMinutes - currentMinutes;
}

/**
 * Validate capital amount
 */
export function isValidCapital(amount: number): boolean {
  return amount >= MIN_CAPITAL && amount <= MAX_CAPITAL;
}

/**
 * Validate confidence score
 */
export function isValidConfidence(confidence: number): boolean {
  return confidence >= 0 && confidence <= 100;
}
