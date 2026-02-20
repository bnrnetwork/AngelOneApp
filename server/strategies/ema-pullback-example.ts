/**
 * EXAMPLE USAGE: EMA Pullback Strategy
 * 
 * This demonstrates how to use the EmaPullbackEngine for generating signals
 */

import { EmaPullbackEngine, type Candle, type EmaPullbackSignal } from "./ema-pullback-engine";

// Example 1: Basic Usage with Mock Data
function exampleBasicUsage() {
  console.log("\n=== Example 1: Basic Usage ===\n");

  // Mock candle data (typically from API)
  const candles: Candle[] = [
    // ... first 50+ candles for EMA50 calculation
    { timestamp: "2026-02-15T09:15:00", open: 22000, high: 22050, low: 21980, close: 22020, volume: 1000 },
    { timestamp: "2026-02-15T09:20:00", open: 22020, high: 22080, low: 22010, close: 22070, volume: 1200 },
    { timestamp: "2026-02-15T09:25:00", open: 22070, high: 22100, low: 22050, close: 22090, volume: 1100 },
    { timestamp: "2026-02-15T09:30:00", open: 22090, high: 22150, low: 22080, close: 22140, volume: 1500 },
    // Uptrend with EMA9 > EMA21 > EMA50
    { timestamp: "2026-02-15T09:35:00", open: 22140, high: 22180, low: 22130, close: 22170, volume: 1300 },
    { timestamp: "2026-02-15T09:40:00", open: 22170, high: 22200, low: 22160, close: 22190, volume: 1250 },
    // Pullback to EMA21
    { timestamp: "2026-02-15T09:45:00", open: 22190, high: 22190, low: 22140, close: 22150, volume: 1400 },
    // Bullish candle near EMA21
    { timestamp: "2026-02-15T09:50:00", open: 22150, high: 22170, low: 22145, close: 22165, volume: 1100 },
  ];

  const currentPrice = 22175; // Breaking above pullback candle high
  const vwap = 22100; // Price above VWAP

  const signal = EmaPullbackEngine.analyze(currentPrice, vwap, candles);

  if (signal.isValid && signal.setup) {
    console.log("✅ VALID SIGNAL GENERATED!");
    console.log(`Direction: ${signal.setup.direction}`);
    console.log(`Entry: ₹${signal.setup.entryPrice.toFixed(2)}`);
    console.log(`Stop Loss: ₹${signal.setup.stopLoss.toFixed(2)}`);
    console.log(`Target 1 (RR 1:2): ₹${signal.setup.target1.toFixed(2)}`);
    console.log(`Target 2 (RR 1:3): ₹${signal.setup.target2.toFixed(2)}`);
    console.log(`Target 3 (RR 1:4): ₹${signal.setup.target3.toFixed(2)}`);
    console.log(`Trail Level (EMA9): ₹${signal.setup.trailLevel.toFixed(2)}`);
    console.log(`Confidence: ${signal.setup.confidence}%`);
    console.log(`Risk: ₹${signal.setup.riskAmount.toFixed(2)}`);
    console.log(`Reason: ${signal.setup.reason}`);
  } else {
    console.log("❌ NO VALID SIGNAL");
    console.log("Failure Reasons:", signal.failureReasons);
  }
}

// Example 2: Calculate Individual Components
function exampleComponentCalculation() {
  console.log("\n=== Example 2: Component Calculation ===\n");

  const candles: Candle[] = [
    // Add your candle data
  ];

  // Calculate EMAs
  const emas = EmaPullbackEngine.calculateEmas(candles);
  console.log(`EMA9: ${emas.ema9.toFixed(2)}`);
  console.log(`EMA21: ${emas.ema21.toFixed(2)}`);
  console.log(`EMA50: ${emas.ema50.toFixed(2)}`);

  // Analyze EMA50 slope
  const slopeAnalysis = EmaPullbackEngine.analyzeEmaSlope(candles, emas.ema50);
  console.log(`\nEMA50 Slope: ${slopeAnalysis.slopePercent.toFixed(3)}%`);
  console.log(`Is Uptrend: ${slopeAnalysis.isUptrend}`);
  console.log(`Is Downtrend: ${slopeAnalysis.isDowntrend}`);

  // Check market range (sideways filter)
  const marketRange = EmaPullbackEngine.analyzeMarketRange(candles, candles[candles.length - 1].close);
  console.log(`\nFirst Hour Range: ${marketRange.rangePercent.toFixed(2)}%`);
  console.log(`Is Sideways: ${marketRange.isSideways}`);
}

// Example 3: BUY Signal Scenario
function exampleBuySignal() {
  console.log("\n=== Example 3: BUY (CE) Signal Scenario ===\n");

  // Scenario: NIFTY in uptrend, pullback to EMA21, breakout
  const candles: Candle[] = generateUptrendCandles();
  const currentPrice = 22200; // Breaking pullback high
  const vwap = 22100; // Above VWAP
  const currentTime = new Date("2026-02-15T10:30:00"); // Within trading window

  const signal = EmaPullbackEngine.generateBuySignal(
    currentPrice,
    EmaPullbackEngine.calculateEmas(candles),
    vwap,
    candles,
    currentTime
  );

  console.log("BUY Signal Valid:", signal.isValid);
  if (signal.setup) {
    console.log("Setup Details:", signal.setup);
  }
}

// Example 4: SELL Signal Scenario
function exampleSellSignal() {
  console.log("\n=== Example 4: SELL (PE) Signal Scenario ===\n");

  // Scenario: NIFTY in downtrend, pullback to EMA21, breakdown
  const candles: Candle[] = generateDowntrendCandles();
  const currentPrice = 21800; // Breaking pullback low
  const vwap = 21900; // Below VWAP
  const currentTime = new Date("2026-02-15T11:00:00"); // Within trading window

  const signal = EmaPullbackEngine.generateSellSignal(
    currentPrice,
    EmaPullbackEngine.calculateEmas(candles),
    vwap,
    candles,
    currentTime
  );

  console.log("SELL Signal Valid:", signal.isValid);
  if (signal.setup) {
    console.log("Setup Details:", signal.setup);
  }
}

// Example 5: Trading Window Check
function exampleTradingWindow() {
  console.log("\n=== Example 5: Trading Window Validation ===\n");

  const times = [
    "2026-02-15T09:00:00", // Before window
    "2026-02-15T09:30:00", // Start of window
    "2026-02-15T12:00:00", // Middle of window
    "2026-02-15T14:45:00", // End of window
    "2026-02-15T15:00:00", // After window
  ];

  times.forEach(time => {
    const date = new Date(time);
    const isValid = EmaPullbackEngine.isWithinTradingWindow(date);
    console.log(`${time} -> ${isValid ? "✅ VALID" : "❌ INVALID"}`);
  });
}

// Example 6: Sideways Market Filter
function exampleSidewaysFilter() {
  console.log("\n=== Example 6: Sideways Market Filter ===\n");

  // Low volatility candles (first hour range < 0.3%)
  const sidewaysCandles = generateSidewaysCandles();
  const marketRange = EmaPullbackEngine.analyzeMarketRange(sidewaysCandles, 22000);

  console.log(`First Hour High: ₹${marketRange.firstHourHigh.toFixed(2)}`);
  console.log(`First Hour Low: ₹${marketRange.firstHourLow.toFixed(2)}`);
  console.log(`Range: ₹${marketRange.firstHourRange.toFixed(2)} (${marketRange.rangePercent.toFixed(2)}%)`);
  console.log(`Is Sideways: ${marketRange.isSideways ? "YES - Skip Signals" : "NO - Allow Signals"}`);
}

// Helper: Generate uptrend candles
function generateUptrendCandles(): Candle[] {
  const candles: Candle[] = [];
  let price = 21900;
  
  for (let i = 0; i < 60; i++) {
    const open = price;
    price += Math.random() * 20 + 5; // Uptrend
    const high = price + Math.random() * 10;
    const low = open - Math.random() * 5;
    const close = price;
    
    candles.push({
      timestamp: new Date(2026, 1, 15, 9, 15 + i * 5).toISOString(),
      open,
      high,
      low,
      close,
      volume: 1000 + Math.random() * 500,
    });
  }
  
  return candles;
}

// Helper: Generate downtrend candles
function generateDowntrendCandles(): Candle[] {
  const candles: Candle[] = [];
  let price = 22100;
  
  for (let i = 0; i < 60; i++) {
    const open = price;
    price -= Math.random() * 20 + 5; // Downtrend
    const high = open + Math.random() * 5;
    const low = price - Math.random() * 10;
    const close = price;
    
    candles.push({
      timestamp: new Date(2026, 1, 15, 9, 15 + i * 5).toISOString(),
      open,
      high,
      low,
      close,
      volume: 1000 + Math.random() * 500,
    });
  }
  
  return candles;
}

// Helper: Generate sideways candles
function generateSidewaysCandles(): Candle[] {
  const candles: Candle[] = [];
  const basePrice = 22000;
  
  // First 12 candles (1 hour) with tight range
  for (let i = 0; i < 12; i++) {
    const open = basePrice + Math.random() * 20 - 10; // ±10 points
    const close = basePrice + Math.random() * 20 - 10;
    const high = Math.max(open, close) + Math.random() * 5;
    const low = Math.min(open, close) - Math.random() * 5;
    
    candles.push({
      timestamp: new Date(2026, 1, 15, 9, 15 + i * 5).toISOString(),
      open,
      high,
      low,
      close,
      volume: 1000,
    });
  }
  
  return candles;
}

// Run all examples
if (require.main === module) {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║     EMA PULLBACK STRATEGY - EXAMPLE USAGE GUIDE          ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  // Uncomment to run specific examples:
  // exampleBasicUsage();
  // exampleComponentCalculation();
  // exampleBuySignal();
  // exampleSellSignal();
  exampleTradingWindow();
  exampleSidewaysFilter();

  console.log("\n✅ Examples completed!\n");
}

export {
  exampleBasicUsage,
  exampleComponentCalculation,
  exampleBuySignal,
  exampleSellSignal,
  exampleTradingWindow,
  exampleSidewaysFilter,
};
