/**
 * EXAMPLE USAGE: Afternoon VWAP Momentum Strategy
 * 
 * Demonstrates how to use the AfternoonVwapMomentumEngine
 */

import {
  AfternoonVwapMomentumEngine,
  type SpotMarketData,
  type OptionMarketData,
  type OIData,
  type Candle,
  type OptionCandle,
} from "./afternoon-vwap-momentum-engine";

// Example 1: BEARISH Setup (PE BUY)
function exampleBearishSetup() {
  console.log("\n=== Example 1: BEARISH Setup (PE BUY) ===\n");

  // Mock spot data - bearish breakdown scenario
  const spotData: SpotMarketData = {
    currentPrice: 21950,  // Breaking day low
    vwap: 22050,          // Price below VWAP ✅
    ema9: 21980,          // EMA9 < EMA21 ✅
    ema21: 22020,
    atr14: 80,
    dayHigh: 22200,
    dayLow: 21960,        // About to break
    candles: [
      // ... earlier candles
      { timestamp: "2026-02-15T13:50:00", open: 22000, high: 22010, low: 21990, close: 21995, volume: 1000 },
      { timestamp: "2026-02-15T13:55:00", open: 21995, high: 22000, low: 21975, close: 21980, volume: 1200 }, // Bearish
      { timestamp: "2026-02-15T14:00:00", open: 21980, high: 21985, low: 21950, close: 21955, volume: 1500 }, // Bearish
    ],
  };

  // Mock PE option data
  const optionDataPE: OptionMarketData = {
    currentPremium: 185,   // Current premium
    optionVwap: 175,       // Above VWAP ✅
    candles: [
      { timestamp: "2026-02-15T13:50:00", open: 160, high: 170, low: 155, close: 165, volume: 500 },
      { timestamp: "2026-02-15T13:55:00", open: 165, high: 175, low: 163, close: 170, volume: 600 },
      { timestamp: "2026-02-15T14:00:00", open: 170, high: 180, low: 168, close: 178, volume: 800 }, // Last 3
      { timestamp: "2026-02-15T14:05:00", open: 178, high: 182, low: 176, close: 180, volume: 750 },
      { timestamp: "2026-02-15T14:10:00", open: 180, high: 185, low: 179, close: 184, volume: 900 }, // High volume ✅
    ],
  };

  // Mock CE option data (not used in bearish setup)
  const optionDataCE: OptionMarketData = {
    currentPremium: 50,
    optionVwap: 55,
    candles: [],
  };

  // Mock OI data
  const oiData: OIData = {
    ceOI: 15000000,
    peOI: 12000000,
    pcr: 0.8,
    ceOIChange: 8,      // Increasing ✅
    peOIChange: -6,     // Unwinding ✅
    pcrChange: -5,      // Decreasing ✅
  };

  const currentTime = new Date("2026-02-15T14:10:00"); // Within window

  const signal = AfternoonVwapMomentumEngine.analyze(
    spotData,
    optionDataCE,
    optionDataPE,
    oiData,
    currentTime
  );

  if (signal.isValid && signal.setup) {
    console.log("✅ VALID PE BUY SIGNAL!");
    console.log(`Signal: ${signal.setup.signal}`);
    console.log(`Entry Price: ₹${signal.setup.entryPrice.toFixed(2)}`);
    console.log(`Stop Loss: ₹${signal.setup.stopLoss.toFixed(2)}`);
    console.log(`Target 1 (1.5R): ₹${signal.setup.targets[0].toFixed(2)}`);
    console.log(`Target 2 (3R): ₹${signal.setup.targets[1].toFixed(2)}`);
    console.log(`Target 3 (5R): ₹${signal.setup.targets[2].toFixed(2)}`);
    console.log(`Confidence: ${signal.setup.confidenceScore}%`);
    console.log(`Reason: ${signal.setup.reason}`);
    
    if (signal.setup.oiConfirmation) {
      console.log(`\nOI Confirmations: ${signal.setup.oiConfirmation.confirmationCount}/3`);
      console.log(`  CE OI Increasing: ${signal.setup.oiConfirmation.ceOIIncreasing}`);
      console.log(`  PE OI Unwinding: ${signal.setup.oiConfirmation.peOIUnwinding}`);
      console.log(`  PCR Decreasing: ${signal.setup.oiConfirmation.pcrDecreasing}`);
    }
  } else {
    console.log("❌ NO VALID SIGNAL");
    console.log("Failure Reasons:", signal.failureReasons);
  }
}

// Example 2: BULLISH Setup (CE BUY)
function exampleBullishSetup() {
  console.log("\n=== Example 2: BULLISH Setup (CE BUY) ===\n");

  // Mock spot data - bullish breakout scenario
  const spotData: SpotMarketData = {
    currentPrice: 22210,  // Breaking day high
    vwap: 22100,          // Price above VWAP ✅
    ema9: 22180,          // EMA9 > EMA21 ✅
    ema21: 22140,
    atr14: 75,
    dayHigh: 22200,       // About to break
    dayLow: 21900,
    candles: [
      { timestamp: "2026-02-15T14:00:00", open: 22150, high: 22160, low: 22145, close: 22155, volume: 1000 },
      { timestamp: "2026-02-15T14:05:00", open: 22155, high: 22175, low: 22150, close: 22170, volume: 1200 }, // Bullish
      { timestamp: "2026-02-15T14:10:00", open: 22170, high: 22210, low: 22168, close: 22205, volume: 1500 }, // Bullish + breakout
    ],
  };

  // Mock CE option data
  const optionDataCE: OptionMarketData = {
    currentPremium: 220,   // Current premium
    optionVwap: 205,       // Above VWAP ✅
    candles: [
      { timestamp: "2026-02-15T13:55:00", open: 190, high: 195, low: 188, close: 192, volume: 400 },
      { timestamp: "2026-02-15T14:00:00", open: 192, high: 200, low: 190, close: 198, volume: 450 }, // Last 3
      { timestamp: "2026-02-15T14:05:00", open: 198, high: 210, low: 196, close: 206, volume: 550 },
      { timestamp: "2026-02-15T14:10:00", open: 206, high: 215, low: 204, close: 212, volume: 600 },
      { timestamp: "2026-02-15T14:15:00", open: 212, high: 222, low: 210, close: 220, volume: 850 }, // Breaking high + volume ✅
    ],
  };

  // Mock PE option data (not used)
  const optionDataPE: OptionMarketData = {
    currentPremium: 80,
    optionVwap: 85,
    candles: [],
  };

  // Mock OI data
  const oiData: OIData = {
    ceOI: 18000000,
    peOI: 16000000,
    pcr: 0.89,
    ceOIChange: -7,     // Unwinding ✅
    peOIChange: 9,      // Increasing ✅
    pcrChange: 4,       // Increasing ✅
  };

  const currentTime = new Date("2026-02-15T14:15:00");

  const signal = AfternoonVwapMomentumEngine.analyze(
    spotData,
    optionDataCE,
    optionDataPE,
    oiData,
    currentTime
  );

  if (signal.isValid && signal.setup) {
    console.log("✅ VALID CE BUY SIGNAL!");
    console.log(`Signal: ${signal.setup.signal}`);
    console.log(`Entry Price: ₹${signal.setup.entryPrice.toFixed(2)}`);
    console.log(`Stop Loss: ₹${signal.setup.stopLoss.toFixed(2)}`);
    console.log(`Target 1 (1.5R): ₹${signal.setup.targets[0].toFixed(2)}`);
    console.log(`Target 2 (3R): ₹${signal.setup.targets[1].toFixed(2)}`);
    console.log(`Target 3 (5R): ₹${signal.setup.targets[2].toFixed(2)}`);
    console.log(`Confidence: ${signal.setup.confidenceScore}%`);
    console.log(`Reason: ${signal.setup.reason}`);
    
    if (signal.setup.oiConfirmation) {
      console.log(`\nOI Confirmations: ${signal.setup.oiConfirmation.confirmationCount}/3`);
      console.log(`  PE OI Increasing: ${signal.setup.oiConfirmation.peOIIncreasing}`);
      console.log(`  CE OI Unwinding: ${signal.setup.oiConfirmation.ceOIUnwinding}`);
      console.log(`  PCR Increasing: ${signal.setup.oiConfirmation.pcrIncreasing}`);
    }
  } else {
    console.log("❌ NO VALID SIGNAL");
    console.log("Failure Reasons:", signal.failureReasons);
  }
}

// Example 3: Time Window Validation
function exampleTimeWindow() {
  console.log("\n=== Example 3: Time Window Validation ===\n");

  const times = [
    "2026-02-15T13:00:00", // Before window
    "2026-02-15T13:45:00", // Start
    "2026-02-15T14:30:00", // Middle
    "2026-02-15T15:10:00", // End
    "2026-02-15T15:30:00", // After window
  ];

  times.forEach(time => {
    const date = new Date(time);
    const isValid = AfternoonVwapMomentumEngine.isWithinTradingWindow(date);
    console.log(`${time.slice(11, 16)} → ${isValid ? "✅ VALID" : "❌ INVALID"}`);
  });
}

// Example 4: Trailing Stop Management
function exampleTrailingStop() {
  console.log("\n=== Example 4: Trailing Stop Management ===\n");

  const entryPrice = 185;
  const initialStopLoss = 175; // Entry - 10 points
  const targets = [200, 215, 235]; // 1.5R, 3R, 5R
  const currentPremium = 210;
  const optionEma9 = 205;

  console.log("Scenario 1: T1 Hit");
  let result = AfternoonVwapMomentumEngine.checkTrailingStop(
    currentPremium,
    entryPrice,
    initialStopLoss,
    targets,
    optionEma9,
    1 // T1 hit
  );
  console.log(`  New SL: ₹${result.newStopLoss.toFixed(2)} (moved to cost)`);
  console.log(`  Exit Signal: ${result.exitSignal}`);
  console.log(`  Reason: ${result.reason}\n`);

  console.log("Scenario 2: T2 Hit");
  result = AfternoonVwapMomentumEngine.checkTrailingStop(
    220,
    entryPrice,
    entryPrice, // Already at cost
    targets,
    optionEma9,
    2 // T2 hit
  );
  console.log(`  New SL: ₹${result.newStopLoss.toFixed(2)} (trailed to T1)`);
  console.log(`  Exit Signal: ${result.exitSignal}`);
  console.log(`  Reason: ${result.reason}\n`);

  console.log("Scenario 3: Premium Below EMA9");
  result = AfternoonVwapMomentumEngine.checkTrailingStop(
    200,
    entryPrice,
    targets[0], // At T1
    targets,
    205, // EMA9
    2
  );
  console.log(`  New SL: ₹${result.newStopLoss.toFixed(2)}`);
  console.log(`  Exit Signal: ${result.exitSignal ? "YES - EXIT NOW" : "NO"}`);
  console.log(`  Reason: ${result.reason}\n`);
}

// Example 5: OI Confirmation Analysis
function exampleOIConfirmation() {
  console.log("\n=== Example 5: OI Confirmation Analysis ===\n");

  const bearishOI: OIData = {
    ceOI: 15000000,
    peOI: 12000000,
    pcr: 0.8,
    ceOIChange: 8,
    peOIChange: -6,
    pcrChange: -5,
  };

  const bullishOI: OIData = {
    ceOI: 14000000,
    peOI: 16000000,
    pcr: 1.14,
    ceOIChange: -7,
    peOIChange: 9,
    pcrChange: 4,
  };

  console.log("BEARISH OI Analysis (for PE BUY):");
  const bearishConfirmation = AfternoonVwapMomentumEngine.analyzeOIConfirmation(bearishOI, "BEARISH");
  console.log(`  Confirmed: ${bearishConfirmation.isConfirmed} (${bearishConfirmation.confirmationCount}/3)`);
  console.log(`  CE OI Increasing: ${bearishConfirmation.ceOIIncreasing}`);
  console.log(`  PE OI Unwinding: ${bearishConfirmation.peOIUnwinding}`);
  console.log(`  PCR Decreasing: ${bearishConfirmation.pcrDecreasing}\n`);

  console.log("BULLISH OI Analysis (for CE BUY):");
  const bullishConfirmation = AfternoonVwapMomentumEngine.analyzeOIConfirmation(bullishOI, "BULLISH");
  console.log(`  Confirmed: ${bullishConfirmation.isConfirmed} (${bullishConfirmation.confirmationCount}/3)`);
  console.log(`  PE OI Increasing: ${bullishConfirmation.peOIIncreasing}`);
  console.log(`  CE OI Unwinding: ${bullishConfirmation.ceOIUnwinding}`);
  console.log(`  PCR Increasing: ${bullishConfirmation.pcrIncreasing}\n`);
}

// Example 6: Option Entry Validation
function exampleOptionValidation() {
  console.log("\n=== Example 6: Option Entry Validation ===\n");

  const validOption: OptionMarketData = {
    currentPremium: 220,
    optionVwap: 205,
    candles: [
      { timestamp: "2026-02-15T14:00:00", open: 190, high: 200, low: 188, close: 195, volume: 400 },
      { timestamp: "2026-02-15T14:05:00", open: 195, high: 210, low: 193, close: 206, volume: 450 },
      { timestamp: "2026-02-15T14:10:00", open: 206, high: 215, low: 204, close: 212, volume: 500 },
      { timestamp: "2026-02-15T14:15:00", open: 212, high: 220, low: 210, close: 218, volume: 550 },
      { timestamp: "2026-02-15T14:20:00", open: 218, high: 222, low: 216, close: 220, volume: 850 }, // High volume
    ],
  };

  const validation = AfternoonVwapMomentumEngine.validateOptionEntry(validOption);

  console.log(`Premium: ₹${validOption.currentPremium}`);
  console.log(`Option VWAP: ₹${validOption.optionVwap}`);
  console.log(`\nValidation Results:`);
  console.log(`  Premium > VWAP: ${validation.isPremiumAboveVwap ? "✅" : "❌"}`);
  console.log(`  Breaks 3-Candle High (₹${validation.highestThreeCandles.toFixed(2)}): ${validation.breaksThreeCandleHigh ? "✅" : "❌"}`);
  console.log(`  Volume (${validOption.candles[validOption.candles.length - 1].volume}) > Avg (${validation.avgVolume.toFixed(0)}): ${validation.volumeAboveAverage ? "✅" : "❌"}`);
  console.log(`\n  ALL CONDITIONS MET: ${validation.allConditionsMet ? "✅ READY TO ENTER" : "❌ WAIT"}`);
}

// Run examples
if (require.main === module) {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║   AFTERNOON VWAP MOMENTUM STRATEGY - EXAMPLE USAGE          ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  exampleBearishSetup();
  exampleBullishSetup();
  exampleTimeWindow();
  exampleTrailingStop();
  exampleOIConfirmation();
  exampleOptionValidation();

  console.log("\n✅ All examples completed!\n");
}

export {
  exampleBearishSetup,
  exampleBullishSetup,
  exampleTimeWindow,
  exampleTrailingStop,
  exampleOIConfirmation,
  exampleOptionValidation,
};
