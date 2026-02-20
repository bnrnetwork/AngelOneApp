import { log } from "./index";
import { getOptionChainWithOI, isLoggedIn, loginToAngelOne, getLTP } from "./angelone";

interface OIStrike {
  strike: number;
  ceLTP: number | null;
  peLTP: number | null;
  ceOI: number;
  peOI: number;
  ceOIChange: number;
  peOIChange: number;
  ceVolume: number;
  peVolume: number;
}

interface MarketStructure {
  highestCEOI: { strike: number; oi: number };
  highestPEOI: { strike: number; oi: number };
  secondCEOI: { strike: number; oi: number };
  secondPEOI: { strike: number; oi: number };
  resistance: number;
  support: number;
  priceNearResistance: boolean;
  priceNearSupport: boolean;
}

interface OIChangeClassification {
  ceWriting: boolean;
  peWriting: boolean;
  ceShortCovering: boolean;
  peShortCovering: boolean;
  ceUnwinding: boolean;
  peUnwinding: boolean;
  totalCEOIChange: number;
  totalPEOIChange: number;
}

interface OIMatrixResult {
  signal: "STRONG_BULLISH" | "STRONG_BEARISH" | "FAKE_BREAKOUT" | "FAKE_BREAKDOWN" | "NEUTRAL";
  description: string;
}

interface FakeBreakoutResult {
  bullTrap: boolean;
  bearTrap: boolean;
  bullTrapReasons: string[];
  bearTrapReasons: string[];
}

interface WriterTrapResult {
  detected: boolean;
  direction: "BULLISH_REVERSAL" | "BEARISH_REVERSAL" | "NONE";
  reason: string;
}

export interface OIAnalysisResult {
  instrument: string;
  tradeDirection: "BUY_CE" | "BUY_PE" | "NO_TRADE";
  strikeSelection: string;
  confidence: number;
  reasons: string[];
  marketStructure: {
    resistance: number;
    support: number;
    highestCEOI: number;
    highestPEOI: number;
    pcr: number;
  };
  oiMatrix: string;
  fakeBreakout: {
    bullTrap: boolean;
    bearTrap: boolean;
  };
  writerTrap: {
    detected: boolean;
    direction: string;
  };
  volatilityFilters: {
    vixDirection: string;
    atrConfirmation: boolean;
    volumeSpike: boolean;
  };
  spotPrice: number;
  atmStrike: number;
  totalCEOI: number;
  totalPEOI: number;
  updatedAt: string;
}

const previousOISnapshots: Map<string, Map<number, { ceOI: number; peOI: number; spotPrice: number; timestamp: number }>> = new Map();
const analysisCache: Map<string, { data: OIAnalysisResult; expiry: number }> = new Map();

function getMarketStructure(strikes: OIStrike[], spotPrice: number): MarketStructure {
  let highestCEOI = { strike: 0, oi: 0 };
  let secondCEOI = { strike: 0, oi: 0 };
  let highestPEOI = { strike: 0, oi: 0 };
  let secondPEOI = { strike: 0, oi: 0 };

  for (const s of strikes) {
    if (s.ceOI > highestCEOI.oi) {
      secondCEOI = { ...highestCEOI };
      highestCEOI = { strike: s.strike, oi: s.ceOI };
    } else if (s.ceOI > secondCEOI.oi) {
      secondCEOI = { strike: s.strike, oi: s.ceOI };
    }

    if (s.peOI > highestPEOI.oi) {
      secondPEOI = { ...highestPEOI };
      highestPEOI = { strike: s.strike, oi: s.peOI };
    } else if (s.peOI > secondPEOI.oi) {
      secondPEOI = { strike: s.strike, oi: s.peOI };
    }
  }

  const strikeDiff = strikes.length > 1 ? Math.abs(strikes[1].strike - strikes[0].strike) : 50;
  const resistance = highestCEOI.strike;
  const support = highestPEOI.strike;

  return {
    highestCEOI,
    highestPEOI,
    secondCEOI,
    secondPEOI,
    resistance,
    support,
    priceNearResistance: Math.abs(spotPrice - resistance) <= strikeDiff * 1.5,
    priceNearSupport: Math.abs(spotPrice - support) <= strikeDiff * 1.5,
  };
}

function classifyOIChanges(strikes: OIStrike[], previousSnapshot: Map<number, { ceOI: number; peOI: number; spotPrice: number; timestamp: number }> | undefined): OIChangeClassification {
  let totalCEOIChange = 0;
  let totalPEOIChange = 0;
  let ceOIIncreasing = 0;
  let ceOIDecreasing = 0;
  let peOIIncreasing = 0;
  let peOIDecreasing = 0;

  for (const s of strikes) {
    const prev = previousSnapshot?.get(s.strike);
    if (prev) {
      const ceDelta = s.ceOI - prev.ceOI;
      const peDelta = s.peOI - prev.peOI;
      totalCEOIChange += ceDelta;
      totalPEOIChange += peDelta;
      if (ceDelta > 0) ceOIIncreasing++;
      if (ceDelta < 0) ceOIDecreasing++;
      if (peDelta > 0) peOIIncreasing++;
      if (peDelta < 0) peOIDecreasing++;
    } else {
      totalCEOIChange += s.ceOI > 0 ? s.ceOI : 0;
      totalPEOIChange += s.peOI > 0 ? s.peOI : 0;
    }
  }

  return {
    ceWriting: totalCEOIChange > 0 && ceOIIncreasing > ceOIDecreasing,
    peWriting: totalPEOIChange > 0 && peOIIncreasing > peOIDecreasing,
    ceShortCovering: totalCEOIChange < 0 && ceOIDecreasing > ceOIIncreasing,
    peShortCovering: totalPEOIChange < 0 && peOIDecreasing > peOIIncreasing,
    ceUnwinding: totalCEOIChange < 0,
    peUnwinding: totalPEOIChange < 0,
    totalCEOIChange,
    totalPEOIChange,
  };
}

function applyOIMatrix(priceMovingUp: boolean, oiClass: OIChangeClassification): OIMatrixResult {
  const ceUp = oiClass.totalCEOIChange > 0;
  const peUp = oiClass.totalPEOIChange > 0;
  const ceDown = oiClass.totalCEOIChange < 0;
  const peDown = oiClass.totalPEOIChange < 0;

  if (priceMovingUp && ceUp && peDown) {
    return { signal: "STRONG_BULLISH", description: "Price rising + CE OI building + PE unwinding = Strong Bullish" };
  }
  if (!priceMovingUp && ceDown && peUp) {
    return { signal: "STRONG_BEARISH", description: "Price falling + CE unwinding + PE OI building = Strong Bearish" };
  }
  if (priceMovingUp && ceUp && peUp) {
    return { signal: "FAKE_BREAKOUT", description: "Price rising + both CE & PE OI increasing = Possible Fake Breakout (Bull Trap)" };
  }
  if (!priceMovingUp && ceUp && peUp) {
    return { signal: "FAKE_BREAKDOWN", description: "Price falling + both CE & PE OI increasing = Possible Fake Breakdown (Bear Trap)" };
  }
  return { signal: "NEUTRAL", description: "No clear directional OI signal" };
}

function detectFakeBreakout(
  spotPrice: number,
  structure: MarketStructure,
  oiClass: OIChangeClassification,
  strikes: OIStrike[],
  atr: number
): FakeBreakoutResult {
  const bullTrapReasons: string[] = [];
  const bearTrapReasons: string[] = [];

  if (spotPrice > structure.resistance) {
    if (oiClass.totalCEOIChange > 0 && Math.abs(oiClass.totalCEOIChange) > Math.abs(oiClass.totalPEOIChange) * 1.5) {
      bullTrapReasons.push("CE OI increasing aggressively above resistance");
    }
    const priceAboveResistance = spotPrice - structure.resistance;
    if (atr > 0 && priceAboveResistance < atr * 0.5) {
      bullTrapReasons.push(`Breakout move (${priceAboveResistance.toFixed(1)}) < 0.5 ATR (${(atr * 0.5).toFixed(1)}) - weak breakout`);
    }
    const totalVolume = strikes.reduce((sum, s) => sum + s.ceVolume + s.peVolume, 0);
    const avgVolume = totalVolume / (strikes.length * 2 || 1);
    const nearResistanceStrikes = strikes.filter(s => Math.abs(s.strike - structure.resistance) <= 100);
    const resistanceVolume = nearResistanceStrikes.reduce((sum, s) => sum + s.ceVolume, 0) / (nearResistanceStrikes.length || 1);
    if (resistanceVolume < avgVolume * 1.5) {
      bullTrapReasons.push("No volume expansion at breakout level");
    }
  }

  if (spotPrice < structure.support) {
    if (oiClass.totalPEOIChange > 0 && Math.abs(oiClass.totalPEOIChange) > Math.abs(oiClass.totalCEOIChange) * 1.5) {
      bearTrapReasons.push("PE OI increasing aggressively below support");
    }
    const priceBelowSupport = structure.support - spotPrice;
    if (atr > 0 && priceBelowSupport < atr * 0.5) {
      bearTrapReasons.push(`Breakdown move (${priceBelowSupport.toFixed(1)}) < 0.5 ATR (${(atr * 0.5).toFixed(1)}) - weak breakdown`);
    }
    const totalVolume = strikes.reduce((sum, s) => sum + s.ceVolume + s.peVolume, 0);
    const avgVolume = totalVolume / (strikes.length * 2 || 1);
    const nearSupportStrikes = strikes.filter(s => Math.abs(s.strike - structure.support) <= 100);
    const supportVolume = nearSupportStrikes.reduce((sum, s) => sum + s.peVolume, 0) / (nearSupportStrikes.length || 1);
    if (supportVolume < avgVolume * 1.5) {
      bearTrapReasons.push("No volume expansion at breakdown level");
    }
  }

  return {
    bullTrap: bullTrapReasons.length >= 2,
    bearTrap: bearTrapReasons.length >= 2,
    bullTrapReasons,
    bearTrapReasons,
  };
}

function detectWriterTrap(oiClass: OIChangeClassification, priceMovingUp: boolean): WriterTrapResult {
  if (oiClass.ceWriting && !priceMovingUp && Math.abs(oiClass.totalCEOIChange) > 1000) {
    return {
      detected: true,
      direction: "BULLISH_REVERSAL",
      reason: "Heavy CE writing but price not falling - writers trapping bears, reversal up likely",
    };
  }
  if (oiClass.peWriting && priceMovingUp && Math.abs(oiClass.totalPEOIChange) > 1000) {
    return {
      detected: true,
      direction: "BEARISH_REVERSAL",
      reason: "Heavy PE writing but price not rising - writers trapping bulls, reversal down likely",
    };
  }
  return { detected: false, direction: "NONE", reason: "No writer trap detected" };
}

export async function analyzeOI(instrument: string): Promise<OIAnalysisResult | null> {
  const cached = analysisCache.get(instrument);
  if (cached && Date.now() < cached.expiry) {
    return cached.data;
  }

  try {
    if (!isLoggedIn()) {
      const success = await loginToAngelOne();
      if (!success) return null;
    }

    const chain = await getOptionChainWithOI(instrument);
    if (!chain || chain.strikes.length === 0) {
      return null;
    }

    const { spotPrice, atmStrike, strikes } = chain;

    const previousSnapshot = previousOISnapshots.get(instrument);

    let priceMovingUp = true;
    if (previousSnapshot) {
      const prevSpots = Array.from(previousSnapshot.values());
      if (prevSpots.length > 0) {
        const avgPrevSpot = prevSpots.reduce((sum, p) => sum + p.spotPrice, 0) / prevSpots.length;
        priceMovingUp = spotPrice > avgPrevSpot;
      }
    }

    const structure = getMarketStructure(strikes, spotPrice);
    const oiClass = classifyOIChanges(strikes, previousSnapshot);
    const oiMatrix = applyOIMatrix(priceMovingUp, oiClass);
    const fakeBreakout = detectFakeBreakout(spotPrice, structure, oiClass, strikes, 0);
    const writerTrap = detectWriterTrap(oiClass, priceMovingUp);

    const newSnapshot = new Map<number, { ceOI: number; peOI: number; spotPrice: number; timestamp: number }>();
    for (const s of strikes) {
      newSnapshot.set(s.strike, { ceOI: s.ceOI, peOI: s.peOI, spotPrice, timestamp: Date.now() });
    }
    previousOISnapshots.set(instrument, newSnapshot);

    const totalCEOI = strikes.reduce((sum, s) => sum + s.ceOI, 0);
    const totalPEOI = strikes.reduce((sum, s) => sum + s.peOI, 0);
    const pcr = totalCEOI > 0 ? totalPEOI / totalCEOI : 0;

    let vix = 0;
    try {
      const vixLtp = await getLTP("NSE", "India VIX", "99926017");
      if (vixLtp) vix = vixLtp;
    } catch {}

    const vixRising = vix > 14;
    const vixFalling = vix < 12;
    const vixDirection = vixRising ? "Rising - Expansion possible" : vixFalling ? "Falling - Premium crush risk" : "Neutral";

    const totalVolume = strikes.reduce((sum, s) => sum + s.ceVolume + s.peVolume, 0);
    const avgVolume = totalVolume / (strikes.length * 2 || 1);
    const nearATMStrikes = strikes.filter(s => Math.abs(s.strike - atmStrike) <= 150);
    const atmVolume = nearATMStrikes.reduce((sum, s) => sum + s.ceVolume + s.peVolume, 0) / (nearATMStrikes.length * 2 || 1);
    const volumeSpike = atmVolume > avgVolume * 1.5;

    const reasons: string[] = [];
    let confidence = 50;
    let tradeDirection: "BUY_CE" | "BUY_PE" | "NO_TRADE" = "NO_TRADE";

    reasons.push(`Market Structure: Support at ${structure.support} (PE OI: ${structure.highestPEOI.oi.toLocaleString()}), Resistance at ${structure.resistance} (CE OI: ${structure.highestCEOI.oi.toLocaleString()})`);
    reasons.push(`PCR: ${pcr.toFixed(2)} - ${pcr > 1.2 ? "Bullish (high PE writing)" : pcr < 0.8 ? "Bearish (high CE writing)" : "Neutral"}`);
    reasons.push(`OI Matrix: ${oiMatrix.description}`);

    if (oiClass.ceWriting) reasons.push("CE Writing detected - sellers expect price to stay below resistance");
    if (oiClass.peWriting) reasons.push("PE Writing detected - sellers expect price to stay above support");
    if (oiClass.ceShortCovering) reasons.push("CE Short Covering - bears exiting, bullish signal");
    if (oiClass.peShortCovering) reasons.push("PE Short Covering - bulls exiting, bearish signal");

    if (oiMatrix.signal === "STRONG_BULLISH") {
      confidence += 20;
      tradeDirection = "BUY_CE";
    } else if (oiMatrix.signal === "STRONG_BEARISH") {
      confidence += 20;
      tradeDirection = "BUY_PE";
    } else if (oiMatrix.signal === "FAKE_BREAKOUT") {
      confidence -= 15;
      reasons.push("CAUTION: Possible fake breakout - avoid buying CE");
    } else if (oiMatrix.signal === "FAKE_BREAKDOWN") {
      confidence -= 15;
      reasons.push("CAUTION: Possible fake breakdown - avoid buying PE");
    }

    if (pcr > 1.3) {
      confidence += 10;
      if (tradeDirection === "NO_TRADE") tradeDirection = "BUY_CE";
    } else if (pcr < 0.7) {
      confidence += 10;
      if (tradeDirection === "NO_TRADE") tradeDirection = "BUY_PE";
    }

    if (structure.priceNearSupport && (oiClass.peWriting || oiClass.ceShortCovering)) {
      confidence += 10;
      tradeDirection = "BUY_CE";
      reasons.push("Support respected with favorable OI - BUY CE opportunity");
    }
    if (structure.priceNearResistance && (oiClass.ceWriting || oiClass.peShortCovering)) {
      confidence += 10;
      tradeDirection = "BUY_PE";
      reasons.push("Resistance respected with favorable OI - BUY PE opportunity");
    }

    if (fakeBreakout.bullTrap) {
      confidence -= 20;
      if (tradeDirection === "BUY_CE") tradeDirection = "NO_TRADE";
      reasons.push(`BULL TRAP: ${fakeBreakout.bullTrapReasons.join("; ")}`);
    }
    if (fakeBreakout.bearTrap) {
      confidence -= 20;
      if (tradeDirection === "BUY_PE") tradeDirection = "NO_TRADE";
      reasons.push(`BEAR TRAP: ${fakeBreakout.bearTrapReasons.join("; ")}`);
    }

    if (writerTrap.detected) {
      confidence += 5;
      reasons.push(`Writer Trap: ${writerTrap.reason}`);
      if (writerTrap.direction === "BULLISH_REVERSAL" && tradeDirection !== "BUY_PE") {
        tradeDirection = "BUY_CE";
      }
      if (writerTrap.direction === "BEARISH_REVERSAL" && tradeDirection !== "BUY_CE") {
        tradeDirection = "BUY_PE";
      }
    }

    if (volumeSpike) {
      confidence += 5;
      reasons.push("Volume spike at ATM strikes - confirms directional conviction");
    }
    if (vixRising) {
      reasons.push("VIX rising - volatility expansion possible, good for option buyers");
    }
    if (vixFalling) {
      confidence -= 5;
      reasons.push("VIX falling - premium crush risk, be cautious");
    }

    if (oiClass.totalCEOIChange > 0 && oiClass.totalPEOIChange > 0) {
      const ceChangePct = Math.abs(oiClass.totalCEOIChange);
      const peChangePct = Math.abs(oiClass.totalPEOIChange);
      if (Math.abs(ceChangePct - peChangePct) / Math.max(ceChangePct, peChangePct, 1) < 0.2) {
        confidence -= 10;
        reasons.push("Conflicting OI signals - both CE and PE OI increasing equally");
      }
    }

    confidence = Math.max(0, Math.min(100, confidence));

    if (confidence < 40) {
      tradeDirection = "NO_TRADE";
    }

    const strikeDiff = strikes.length > 1 ? Math.abs(strikes[1].strike - strikes[0].strike) : 50;
    let strikeSelection = `ATM ${atmStrike}`;
    if (tradeDirection === "BUY_CE") {
      strikeSelection = `ATM ${atmStrike} CE or ITM ${atmStrike - strikeDiff} CE`;
    } else if (tradeDirection === "BUY_PE") {
      strikeSelection = `ATM ${atmStrike} PE or ITM ${atmStrike + strikeDiff} PE`;
    }

    const result: OIAnalysisResult = {
      instrument,
      tradeDirection,
      strikeSelection,
      confidence,
      reasons,
      marketStructure: {
        resistance: structure.resistance,
        support: structure.support,
        highestCEOI: structure.highestCEOI.oi,
        highestPEOI: structure.highestPEOI.oi,
        pcr,
      },
      oiMatrix: oiMatrix.signal,
      fakeBreakout: {
        bullTrap: fakeBreakout.bullTrap,
        bearTrap: fakeBreakout.bearTrap,
      },
      writerTrap: {
        detected: writerTrap.detected,
        direction: writerTrap.direction,
      },
      volatilityFilters: {
        vixDirection,
        atrConfirmation: true,
        volumeSpike,
      },
      spotPrice,
      atmStrike,
      totalCEOI,
      totalPEOI,
      updatedAt: new Date().toISOString(),
    };

    analysisCache.set(instrument, { data: result, expiry: Date.now() + 30000 });

    return result;
  } catch (err: any) {
    log(`OI analysis error: ${err.message}`, "oi-analysis");
    return null;
  }
}
