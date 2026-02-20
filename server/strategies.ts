import { storage } from "./storage";
import { sendEntrySignal, sendExitSignal, sendDailyPnlSummary } from "./telegram";
import { getOptionChain, getOptionLTP, connectStream, disconnectStream, subscribeTokenToStream, setOnTickCallback, getLivePrice, isStreamConnected, getSymbolTokenFromCache, getCandleData, getLTP, getExchangeForIndex, isMCXInstrument, resolveTradingExpiry } from "./angelone";
import { analyzeOI } from "./oi-analysis";
import { log } from "./index";
import type { Signal, InsertSignal, StrategyKey, InstrumentType, ProductType } from "@shared/schema";
import { LOT_SIZES, STRIKE_STEPS } from "@shared/schema";
import { DEFAULT_CAPITAL, MARKET_OPEN_HOUR, MARKET_OPEN_MINUTE, STRATEGY_TIMING_WINDOWS } from "@shared/config";
import { EmaPullbackEngine } from "./strategies/ema-pullback-engine";
import { AfternoonVwapMomentumEngine } from "./strategies/afternoon-vwap-momentum-engine";
import { startBacktest, stopBacktest, getBacktestStatus } from "./backtest-engine";

type BroadcastFn = (type: string, data: any) => void;

let engineRunning = false;
let currentInstruments: Set<InstrumentType> = new Set();
let intervalIds: ReturnType<typeof setInterval>[] = [];
let broadcast: BroadcastFn = () => {};

let currentCapital = DEFAULT_CAPITAL;

export function setCapital(capital: number) {
  currentCapital = capital;
}

export function getCapital(): number {
  return currentCapital;
}

let defaultCapital = DEFAULT_CAPITAL;

const warnedLotSizes = new Set<string>();

function getLotSize(instrument: string): number {
  const lotSize = LOT_SIZES[instrument];
  if (lotSize == null) {
    if (!warnedLotSizes.has(instrument)) {
      log(`Missing lot size for ${instrument}, defaulting to 1`, "engine");
      warnedLotSizes.add(instrument);
    }
    return 1;
  }
  return lotSize;
}

export function setDefaultCapital(capital: number) {
  defaultCapital = capital;
  currentCapital = capital;
}

export function getDefaultCapital(): number {
  return defaultCapital;
}

const signalTokenMap: Map<string, string> = new Map();

export function setBroadcast(fn: BroadcastFn) {
  broadcast = fn;
}

let angeloneConnected = false;

export function setAngeloneConnected(connected: boolean) {
  angeloneConnected = connected;
}

export function getEngineStatus() {
  return {
    running: engineRunning,
    instruments: Array.from(currentInstruments),
    instrument: currentInstruments.size > 0 ? Array.from(currentInstruments)[0] : null,
    connected: angeloneConnected,
    streaming: isStreamConnected(),
    capital: currentCapital,
    defaultCapital,
  };
}

interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface OISnapshot {
  totalCEOI: number;
  totalPEOI: number;
  pcr: number;
  ceChangePct: number;
  peChangePct: number;
  pcrShift: number;
  updatedAt: number;
}

interface MarketIndicators {
  spotPrice: number;
  ema9: number;
  ema21: number;
  ema50: number;
  rsi14: number;
  vwap: number;
  atr14: number;
  supertrend: number;
  supertrendBullish: boolean;
  dayHigh: number;
  dayLow: number;
  dayOpen: number;
  orbHigh: number | null;
  orbLow: number | null;
  prevClose: number;
  momentum: number;
  candleCount: number;
  lastCandle: Candle | null;
  prevCandle: Candle | null;
  recentCandles: Candle[];
  todayCandles: Candle[];
  oiSnapshot?: OISnapshot | null;
  lastUpdated: number;
}

interface StrategySignalResult {
  direction: "CE" | "PE";
  confidence: number;
  reason: string;
  strikeOffset: number;
  riskPercent: number;
}

function isOptionType(value: string): value is "CE" | "PE" {
  return value === "CE" || value === "PE";
}

const indicatorCache: Map<string, MarketIndicators> = new Map();
const INDICATOR_REFRESH_MS = 60000;
let indicatorRefreshInProgress = false;
let indicatorRetryCount = 0;
const MAX_INDICATOR_RETRIES = 3;

const lastOISnapshot: Map<string, { totalCEOI: number; totalPEOI: number; pcr: number; updatedAt: number }> = new Map();

async function fetchOISnapshot(instrument: InstrumentType): Promise<OISnapshot | null> {
  try {
    const analysis = await analyzeOI(instrument);
    if (!analysis) return null;

    const prev = lastOISnapshot.get(instrument);
    const ceChange = prev ? analysis.totalCEOI - prev.totalCEOI : 0;
    const peChange = prev ? analysis.totalPEOI - prev.totalPEOI : 0;
    const ceChangePct = prev && prev.totalCEOI > 0 ? (ceChange / prev.totalCEOI) * 100 : 0;
    const peChangePct = prev && prev.totalPEOI > 0 ? (peChange / prev.totalPEOI) * 100 : 0;
    const pcr = analysis.marketStructure.pcr;
    const pcrShift = prev ? pcr - prev.pcr : 0;

    lastOISnapshot.set(instrument, {
      totalCEOI: analysis.totalCEOI,
      totalPEOI: analysis.totalPEOI,
      pcr,
      updatedAt: Date.now(),
    });

    return {
      totalCEOI: analysis.totalCEOI,
      totalPEOI: analysis.totalPEOI,
      pcr,
      ceChangePct,
      peChangePct,
      pcrShift,
      updatedAt: Date.now(),
    };
  } catch (err: any) {
    log(`OI snapshot error for ${instrument}: ${err.message}`, "indicators");
    return null;
  }
}

interface LiveCandle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const liveCandles: Map<string, LiveCandle[]> = new Map();
const currentBar: Map<string, { open: number; high: number; low: number; close: number; startTime: number; tickCount: number }> = new Map();
const CANDLE_INTERVAL_MS = 5 * 60 * 1000;

export function feedTickToCandles(instrument: string, price: number) {
  const now = Date.now();
  const barStart = Math.floor(now / CANDLE_INTERVAL_MS) * CANDLE_INTERVAL_MS;
  const key = instrument;

  let bar = currentBar.get(key);
  if (!bar || bar.startTime !== barStart) {
    if (bar) {
      const candles = liveCandles.get(key) || [];
      const ts = new Date(bar.startTime).toISOString();
      candles.push({
        timestamp: ts,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.tickCount,
      });
      if (candles.length > 100) candles.shift();
      liveCandles.set(key, candles);
    }
    bar = { open: price, high: price, low: price, close: price, startTime: barStart, tickCount: 1 };
  } else {
    bar.high = Math.max(bar.high, price);
    bar.low = Math.min(bar.low, price);
    bar.close = price;
    bar.tickCount++;
  }
  currentBar.set(key, bar);
}

function getLiveCandleData(instrument: string): LiveCandle[] {
  const candles = liveCandles.get(instrument) || [];
  const bar = currentBar.get(instrument);
  if (bar) {
    return [...candles, {
      timestamp: new Date(bar.startTime).toISOString(),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.tickCount,
    }];
  }
  return candles;
}

const strategyCooldown: Map<string, number> = new Map();
const strategyConsecutiveLosses: Map<string, number> = new Map();
const strategyDisabledUntil: Map<string, number> = new Map();

const COOLDOWN_MS: Record<string, number> = {
  ORB: 30 * 60000,
  SMTR: 20 * 60000,
  EMA: 20 * 60000,
  VWAP_PULLBACK: 20 * 60000, // Increased cooldown
  RSI: 15 * 60000,
  VWAP_RSI: 20 * 60000,
  RSI_RANGE: 15 * 60000,
  GAP_FADE: 20 * 60000,
  CPR: 20 * 60000,
  INSIDE_CANDLE: 15 * 60000,
  EMA_VWAP_RSI: 20 * 60000,
  MARKET_TOP: 20 * 60000,
  SCALP: 10 * 60000,
  PRO_ORB: 10 * 60000,
  VWAP_REVERSION: 10 * 60000,
  BREAKOUT_STRENGTH: 10 * 60000,
  REGIME_BASED: 10 * 60000,
  EMA_PULLBACK: 10 * 60000,
  AFTERNOON_VWAP_MOMENTUM: 10 * 60000,
};

// Circuit breaker: disable strategy after too many consecutive losses
const MAX_CONSECUTIVE_LOSSES = 3;
const CIRCUIT_BREAKER_DURATION_MS = 60 * 60000; // 1 hour

const ACTIVE_STRATEGIES: StrategyKey[] = [
  "ORB",
  "SMTR",
  "EMA",
  "VWAP_PULLBACK",
  "RSI",
  "RSI_RANGE",
  "GAP_FADE",
  "CPR",
  "INSIDE_CANDLE",
  "VWAP_RSI",
  "EMA_VWAP_RSI",
  "MARKET_TOP",
  "SCALP",
  "PRO_ORB",
  "VWAP_REVERSION",
  "BREAKOUT_STRENGTH",
  "REGIME_BASED",
  "EMA_PULLBACK",
  "AFTERNOON_VWAP_MOMENTUM",
];

function calculateEMA(data: number[], period: number): number {
  if (data.length === 0) return 0;
  if (data.length < period) return data.reduce((a, b) => a + b, 0) / data.length;

  const multiplier = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * multiplier + ema;
  }

  return Math.round(ema * 100) / 100;
}

function calculateRSI(data: number[], period: number): number {
  if (data.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = data[i] - data[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    if (change >= 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - change) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 100) / 100;
}

function calculateVWAP(candles: Candle[]): number {
  if (candles.length === 0) return 0;
  let cumVolumePrice = 0;
  let cumVolume = 0;

  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    const vol = candle.volume || 1;
    cumVolumePrice += typicalPrice * vol;
    cumVolume += vol;
  }

  if (cumVolume === 0) return candles[candles.length - 1]?.close || 0;
  return Math.round((cumVolumePrice / cumVolume) * 100) / 100;
}

function calculateATR(candles: Candle[], period: number): number {
  if (candles.length < 2) return 0;

  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    trueRanges.push(tr);
  }

  if (trueRanges.length < period) {
    return trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;
  }

  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }

  return Math.round(atr * 100) / 100;
}

function calculateADX(candles: Candle[], period: number): number {
  if (candles.length < period + 2) return 0;

  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const trueRanges: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    trueRanges.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    ));
  }

  if (trueRanges.length < period) return 0;

  let smoothPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothTR = trueRanges.slice(0, period).reduce((a, b) => a + b, 0);

  const dxValues: number[] = [];

  for (let i = period; i < trueRanges.length; i++) {
    smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDM[i];
    smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDM[i];
    smoothTR = smoothTR - smoothTR / period + trueRanges[i];

    const plusDI = smoothTR > 0 ? (smoothPlusDM / smoothTR) * 100 : 0;
    const minusDI = smoothTR > 0 ? (smoothMinusDM / smoothTR) * 100 : 0;
    const diSum = plusDI + minusDI;
    const dx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;
    dxValues.push(dx);
  }

  if (dxValues.length < period) {
    return dxValues.length > 0 ? dxValues.reduce((a, b) => a + b, 0) / dxValues.length : 0;
  }

  let adx = dxValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dxValues.length; i++) {
    adx = (adx * (period - 1) + dxValues[i]) / period;
  }
  return Math.round(adx * 100) / 100;
}

function calculateSupertrend(candles: Candle[], period: number, multiplier: number): { value: number; bullish: boolean } {
  if (candles.length < period + 2) {
    return { value: candles[candles.length - 1]?.close || 0, bullish: true };
  }

  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    trueRanges.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    ));
  }

  const atrArr: number[] = [];
  if (trueRanges.length >= period) {
    let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
    atrArr.push(atr);
    for (let i = period; i < trueRanges.length; i++) {
      atr = (atr * (period - 1) + trueRanges[i]) / period;
      atrArr.push(atr);
    }
  }

  let prevUpper = 0, prevLower = 0, prevBullish = true;

  for (let j = 0; j < atrArr.length; j++) {
    const ci = j + period;
    const hl2 = (candles[ci].high + candles[ci].low) / 2;
    const atr = atrArr[j];

    let upperBand = hl2 + multiplier * atr;
    let lowerBand = hl2 - multiplier * atr;

    if (j > 0) {
      upperBand = (upperBand < prevUpper || candles[ci - 1].close > prevUpper) ? upperBand : prevUpper;
      lowerBand = (lowerBand > prevLower || candles[ci - 1].close < prevLower) ? lowerBand : prevLower;
    }

    let bullish: boolean;
    if (j === 0) {
      bullish = candles[ci].close >= hl2;
    } else {
      if (prevBullish && candles[ci].close < prevLower) bullish = false;
      else if (!prevBullish && candles[ci].close > prevUpper) bullish = true;
      else bullish = prevBullish;
    }

    prevUpper = upperBand;
    prevLower = lowerBand;
    prevBullish = bullish;
  }

  return { value: Math.round((prevBullish ? prevLower : prevUpper) * 100) / 100, bullish: prevBullish };
}

function formatISTDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}`;
}

async function refreshIndicators(instrument: InstrumentType): Promise<MarketIndicators | null> {
  try {
    const indexInfo = getExchangeForIndex(instrument);
    if (!indexInfo) return null;

    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);

    const todayStr = `${istNow.getUTCFullYear()}-${String(istNow.getUTCMonth() + 1).padStart(2, "0")}-${String(istNow.getUTCDate()).padStart(2, "0")}`;

    let daysBack = 1;
    const dayOfWeek = istNow.getUTCDay();
    if (dayOfWeek === 1) daysBack = 3;
    else if (dayOfWeek === 0) daysBack = 2;

    const prevDay = new Date(istNow.getTime() - daysBack * 24 * 60 * 60 * 1000);

    const fromDate = formatISTDate(new Date(Date.UTC(prevDay.getUTCFullYear(), prevDay.getUTCMonth(), prevDay.getUTCDate(), 9, 0)));
    const toDate = formatISTDate(new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate(), istNow.getUTCHours(), istNow.getUTCMinutes())));

    const rawCandles = await getCandleData(indexInfo.exchange, indexInfo.token, "FIVE_MINUTE", fromDate, toDate);

    let candles: Candle[];

    if (rawCandles && rawCandles.length >= 5) {
      candles = rawCandles.map((c: any) => ({
        timestamp: c[0] || "",
        open: parseFloat(c[1]) || 0,
        high: parseFloat(c[2]) || 0,
        low: parseFloat(c[3]) || 0,
        close: parseFloat(c[4]) || 0,
        volume: parseFloat(c[5]) || 0,
      }));
    } else {
      let liveC = getLiveCandleData(instrument);

      if (liveC.length === 0) {
        const seedLtp = await getLTP(indexInfo.exchange, instrument, indexInfo.token);
        if (seedLtp != null && seedLtp > 0) {
          feedTickToCandles(instrument, seedLtp);
          liveC = getLiveCandleData(instrument);
        }
      }

      if (liveC.length >= 5) {
        log(`Using ${liveC.length} live-built candles for ${instrument} (API returned ${rawCandles?.length || 0})`, "indicators");
        candles = liveC.map(c => ({
          timestamp: c.timestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        }));
      } else if (liveC.length >= 2) {
        log(`Using ${liveC.length} warm-up live candles for ${instrument} (API returned ${rawCandles?.length || 0})`, "indicators");
        candles = liveC.map(c => ({
          timestamp: c.timestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        }));
      } else {
        log(`Insufficient candle data for ${instrument}: API=${rawCandles?.length || 0}, live=${liveC.length}`, "indicators");
        return null;
      }
    }

    const closes = candles.map(c => c.close);

    const ema9 = calculateEMA(closes, 9);
    const ema21 = calculateEMA(closes, 21);
    const ema50 = calculateEMA(closes, 50);
    const rsi14 = calculateRSI(closes, 14);
    const atr14 = calculateATR(candles, 14);
    const st = calculateSupertrend(candles, 10, 3);

    const todayCandles = candles.filter(c => c.timestamp.includes(todayStr));
    const vwap = calculateVWAP(todayCandles.length > 0 ? todayCandles : candles.slice(-20));

    const dayOpen = todayCandles.length > 0 ? todayCandles[0].open : closes[closes.length - 1];
    const dayHigh = todayCandles.length > 0 ? Math.max(...todayCandles.map(c => c.high)) : Math.max(...candles.slice(-20).map(c => c.high));
    const dayLow = todayCandles.length > 0 ? Math.min(...todayCandles.map(c => c.low)) : Math.min(...candles.slice(-20).map(c => c.low));

    let orbHigh: number | null = null;
    let orbLow: number | null = null;
    if (todayCandles.length >= 3) {
      const orbCandles = todayCandles.slice(0, 3);
      orbHigh = Math.max(...orbCandles.map(c => c.high));
      orbLow = Math.min(...orbCandles.map(c => c.low));
    }

    const yesterdayCandles = candles.filter(c => !c.timestamp.includes(todayStr));
    const prevClose = yesterdayCandles.length > 0 ? yesterdayCandles[yesterdayCandles.length - 1].close : dayOpen;

    const momentum = closes.length >= 4
      ? ((closes[closes.length - 1] - closes[closes.length - 4]) / closes[closes.length - 4]) * 100
      : 0;

    const oiSnapshot = await fetchOISnapshot(instrument);

    const indicators: MarketIndicators = {
      spotPrice: closes[closes.length - 1],
      ema9, ema21, ema50, rsi14, vwap, atr14,
      supertrend: st.value,
      supertrendBullish: st.bullish,
      dayHigh, dayLow, dayOpen,
      orbHigh, orbLow, prevClose, momentum,
      candleCount: candles.length,
      lastCandle: candles[candles.length - 1],
      prevCandle: candles.length >= 2 ? candles[candles.length - 2] : null,
      recentCandles: candles.slice(-20),
      todayCandles: todayCandles.length > 0 ? todayCandles : candles.slice(-20),
      oiSnapshot,
      lastUpdated: Date.now(),
    };

    indicatorCache.set(instrument, indicators);
    log(`Indicators refreshed for ${instrument}: spot=${indicators.spotPrice} EMA9=${ema9} EMA21=${ema21} EMA50=${ema50} RSI=${rsi14} VWAP=${vwap} ATR=${atr14} ST=${st.value}(${st.bullish ? "bull" : "bear"})`, "indicators");
    return indicators;
  } catch (err: any) {
    log(`Indicator refresh error for ${instrument}: ${err.message}`, "indicators");
    return null;
  }
}

async function getIndicators(instrument: InstrumentType): Promise<MarketIndicators | null> {
  const cached = indicatorCache.get(instrument);
  if (cached && Date.now() - cached.lastUpdated < INDICATOR_REFRESH_MS) {
    return cached;
  }
  if (indicatorRefreshInProgress) {
    return cached || null;
  }
  indicatorRefreshInProgress = true;
  try {
    const fresh = await refreshIndicators(instrument);
    if (fresh) {
      indicatorRetryCount = 0;
      return fresh;
    }
    indicatorRetryCount++;
    if (cached && Date.now() - cached.lastUpdated < 10 * 60000) {
      log(`Using stale indicators (age ${Math.round((Date.now() - cached.lastUpdated) / 1000)}s), retry ${indicatorRetryCount}`, "indicators");
      return cached;
    }
    return null;
  } finally {
    indicatorRefreshInProgress = false;
  }
}

function getISTTime(): { hour: number; minute: number; isMarketHours: boolean } {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  const hour = istTime.getUTCHours();
  const minute = istTime.getUTCMinutes();
  const isMarketHours = (hour > 9 || (hour === 9 && minute >= 15)) && (hour < 15 || (hour === 15 && minute <= 16));
  return { hour, minute, isMarketHours };
}

function getISTDateKey(): string {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  return istTime.toISOString().split("T")[0];
}

function formatISTClock(date: Date): string {
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(date.getTime() + istOffset);
  let hours = istTime.getUTCHours();
  const minutes = String(istTime.getUTCMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
}

function isTimeInWindow(hour: number, minute: number, startHour: number, startMinute: number, endHour: number, endMinute: number): boolean {
  if (hour < startHour || (hour === startHour && minute < startMinute)) return false;
  if (hour > endHour || (hour === endHour && minute > endMinute)) return false;
  return true;
}

function isStrategyWithinConfiguredWindow(strategy: StrategyKey, hour: number, minute: number): boolean {
  const timing = (STRATEGY_TIMING_WINDOWS as Partial<Record<StrategyKey, {
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
  }>>)[strategy];

  if (!timing) return true;

  return isTimeInWindow(
    hour,
    minute,
    timing.startHour,
    timing.startMinute,
    timing.endHour,
    timing.endMinute,
  );
}

function isProductTypeEntryAllowed(productType: ProductType, hour: number, minute: number): boolean {
  if (productType === "INT") {
    return isTimeInWindow(hour, minute, 9, 15, 15, 3);
  }
  return isTimeInWindow(hour, minute, 9, 15, 15, 16);
}

function resolveGlobalProductTypePhase(activeSignals: Signal[]): ProductType | null {
  const hasInt = activeSignals.some((s) => (s.productType || "INT") === "INT");
  const hasCf = activeSignals.some((s) => s.productType === "CF");

  if (hasInt && hasCf) {
    return null;
  }

  if (hasInt) {
    return "INT";
  }

  if (hasCf) {
    return "CF";
  }

  return "INT";
}

function resolveStrikeProductAllocation(
  instrument: InstrumentType,
  strikePrice: number,
  optionType: "CE" | "PE",
  activeSignals: Signal[],
): { productType: ProductType | null; blocked: boolean; reason?: string } {
  const phaseProductType = resolveGlobalProductTypePhase(activeSignals);
  if (!phaseProductType) {
    return {
      productType: null,
      blocked: true,
      reason: "Both INT and CF are active globally; waiting until one product type fully closes",
    };
  }

  const sameStrikeActive = activeSignals.filter(
    (s) => s.instrument === instrument && s.optionType === optionType && s.strikePrice === strikePrice
  );

  const hasSamePhaseOnStrike = sameStrikeActive.some(
    (s) => (s.productType || "INT") === phaseProductType
  );
  if (hasSamePhaseOnStrike) {
    return {
      productType: null,
      blocked: true,
      reason: `${phaseProductType} already active on this strike`,
    };
  }

  return { productType: phaseProductType, blocked: false };
}

function getForcedExitReason(productType: ProductType | null | undefined, hour: number, minute: number): string | null {
  const normalized = productType || "INT";
  if (normalized === "INT" && (hour > 15 || (hour === 15 && minute >= 9))) {
    return "Forced exit at 3:09 PM (INT)";
  }
  if (normalized === "CF" && (hour > 15 || (hour === 15 && minute >= 25))) {
    return "Forced exit at 3:25 PM (CF)";
  }
  return null;
}

function isOnCooldown(strategy: string): boolean {
  const lastTime = strategyCooldown.get(strategy) || 0;
  const cooldown = COOLDOWN_MS[strategy] || 10 * 60000;
  return Date.now() - lastTime < cooldown;
}

function isStrategyDisabled(strategy: string): boolean {
  const disabledUntil = strategyDisabledUntil.get(strategy);
  if (!disabledUntil) return false;

  if (Date.now() < disabledUntil) {
    return true;
  }

  // Re-enable strategy
  strategyDisabledUntil.delete(strategy);
  strategyConsecutiveLosses.set(strategy, 0);
  log(`Strategy ${strategy} circuit breaker reset - re-enabled`, "circuit-breaker");
  return false;
}

async function trackStrategyResult(strategy: string, isWin: boolean) {
  if (isWin) {
    strategyConsecutiveLosses.set(strategy, 0);
  } else {
    const losses = (strategyConsecutiveLosses.get(strategy) || 0) + 1;
    strategyConsecutiveLosses.set(strategy, losses);

    if (losses >= MAX_CONSECUTIVE_LOSSES) {
      const disableUntil = Date.now() + CIRCUIT_BREAKER_DURATION_MS;
      strategyDisabledUntil.set(strategy, disableUntil);

      const disableTime = new Date(disableUntil);
      await storage.createLog({
        level: "warn",
        source: "circuit-breaker",
        message: `Strategy ${strategy} disabled until ${formatISTClock(disableTime)} after ${losses} consecutive losses`
      });
      log(`🛑 Circuit breaker activated for ${strategy} - disabled for 1 hour`, "circuit-breaker");
    }
  }
}

function analyzeORB(ind: MarketIndicators, hour: number, minute: number): StrategySignalResult | null {
  // Check trading window: 9:25 to 10:45 (tightened from 11:00)
  if (hour < 9 || (hour === 9 && minute < 25) || hour > 10 || (hour === 10 && minute > 45)) return null;
  if (!ind.orbHigh || !ind.orbLow) return null;

  // VIX filter for ORB breakouts
  if (ind.indiaVix && ind.indiaVix > 24) return null;

  // Volume confirmation
  const avgVol = ind.recentCandles.slice(-5).reduce((sum, c) => sum + (c.volume || 0), 0) / 5;
  const volumeOk = (ind.lastCandle?.volume || 0) > avgVol * 0.9;
  if (!volumeOk) return null;

  const orbRange = ind.orbHigh - ind.orbLow;
  const rangePercent = (orbRange / ind.spotPrice) * 100;

  // Range should be meaningful but not extreme: 0.03% to 1.0%
  if (rangePercent < 0.03 || rangePercent > 1.0) return null;

  if (ind.spotPrice > ind.orbHigh) {
    // Bullish breakout above ORB high
    const breakoutStrength = ((ind.spotPrice - ind.orbHigh) / orbRange);
    // Minimum breakout strength 10%
    if (breakoutStrength < 0.10) return null;

    if (!ind.lastCandle) return null;
    if (ind.lastCandle.close < ind.orbHigh && breakoutStrength < 0.2) return null;

    let confidence = 74;
    // Breakout strength
    if (breakoutStrength > 0.15) confidence += 4;
    if (breakoutStrength > 0.25) confidence += 3;
    if (breakoutStrength > 0.4) confidence += 3;
    // EMA confirmation
    if (ind.ema9 > ind.ema21) confidence += 4;
    if (ind.ema9 > ind.vwap) confidence += 3;
    // Momentum confirmation
    if (ind.rsi14 > 50) confidence += 3;
    if (ind.rsi14 > 60) confidence += 2;
    if (ind.spotPrice > ind.vwap) confidence += 3;
    if (ind.supertrendBullish) confidence += 3;
    if (ind.momentum > 0.01) confidence += 2;
    if (ind.lastCandle.close > ind.lastCandle.open) confidence += 3;
    // Volume surge
    if ((ind.lastCandle.volume || 0) > avgVol * 1.2) confidence += 3;

    return {
      direction: "CE",
      confidence: Math.min(95, confidence),
      reason: `ORB breakout ${ind.orbHigh.toFixed(0)}, range ${rangePercent.toFixed(2)}%, VIX ${ind.indiaVix?.toFixed(1) || 'N/A'}`,
      strikeOffset: 0,
      riskPercent: 0.13,
    };
  }

  if (ind.spotPrice < ind.orbLow) {
    // Bearish breakdown below ORB low
    const breakoutStrength = ((ind.orbLow - ind.spotPrice) / orbRange);
    // Minimum breakout strength 10%
    if (breakoutStrength < 0.10) return null;

    if (!ind.lastCandle) return null;
    if (ind.lastCandle.close > ind.orbLow && breakoutStrength < 0.2) return null;

    let confidence = 74;
    // Breakout strength
    if (breakoutStrength > 0.15) confidence += 4;
    if (breakoutStrength > 0.25) confidence += 3;
    if (breakoutStrength > 0.4) confidence += 3;
    // EMA confirmation
    if (ind.ema9 < ind.ema21) confidence += 4;
    if (ind.ema9 < ind.vwap) confidence += 3;
    // Momentum confirmation
    if (ind.rsi14 < 50) confidence += 3;
    if (ind.rsi14 < 40) confidence += 2;
    if (ind.spotPrice < ind.vwap) confidence += 3;
    if (!ind.supertrendBullish) confidence += 3;
    if (ind.momentum < -0.01) confidence += 2;
    if (ind.lastCandle.close < ind.lastCandle.open) confidence += 3;
    // Volume surge
    if ((ind.lastCandle.volume || 0) > avgVol * 1.2) confidence += 3;

    return {
      direction: "PE",
      confidence: Math.min(95, confidence),
      reason: `ORB breakdown ${ind.orbLow.toFixed(0)}, range ${rangePercent.toFixed(2)}%, VIX ${ind.indiaVix?.toFixed(1) || 'N/A'}`,
      strikeOffset: 0,
      riskPercent: 0.13,
    };
  }

  return null;
}

function analyzeSMTR(ind: MarketIndicators, hour: number, minute: number): StrategySignalResult | null {
  if (hour < 9 || (hour === 9 && minute < 25)) return null;
  if (hour > 13 || (hour === 13 && minute > 45)) return null;
  if (!ind.orbHigh || !ind.orbLow) return null;

  // VIX filter for trap reversals
  if (ind.indiaVix && ind.indiaVix > 23) return null;

  const candles = ind.todayCandles.length >= 6 ? ind.todayCandles : ind.recentCandles;
  if (candles.length < 5) return null;

  const last = candles[candles.length - 1];
  const prev1 = candles[candles.length - 2];
  const prev2 = candles[candles.length - 3];

  const recentVols = candles.slice(-10);
  const avgVol = recentVols.reduce((sum, c) => sum + (c.volume || 0), 0) / Math.max(1, recentVols.length);
  const breakVolHigh = (prev2.volume || 0) > avgVol * 1.5;

  const bullSustain = prev2.close > ind.orbHigh && prev1.close > ind.orbHigh;
  const bearSustain = prev2.close < ind.orbLow && prev1.close < ind.orbLow;

  const bullTrapPrice = prev2.high > ind.orbHigh && prev1.close < ind.orbHigh && last.close < ind.orbHigh && !bullSustain;
  const bearTrapPrice = prev2.low < ind.orbLow && prev1.close > ind.orbLow && last.close > ind.orbLow && !bearSustain;

  const vwapReject = ind.spotPrice < ind.vwap || (last.high > ind.vwap && last.close < ind.vwap);
  const vwapReclaim = ind.spotPrice > ind.vwap || (last.low < ind.vwap && last.close > ind.vwap);

  const oi = ind.oiSnapshot;
  if (!oi) return null;

  // Stricter OI requirements
  const bullOiOk = oi.ceChangePct > 7 && oi.peChangePct >= -1 && oi.pcrShift <= -0.06;
  const bearOiOk = oi.peChangePct > 7 && oi.ceChangePct >= -1 && oi.pcrShift >= 0.06;

  const bullDeltaOk = breakVolHigh && prev1.close < prev1.open;
  const bearDeltaOk = breakVolHigh && prev1.close > prev1.open;

  const useItm = hour > 13 || (hour === 13 && minute >= 30);

  if (bullTrapPrice && vwapReject && bullOiOk && bullDeltaOk) {
    let confidence = 82;
    if (breakVolHigh) confidence += 3;
    if (vwapReject) confidence += 3;
    if (oi.pcrShift <= -0.08) confidence += 3;
    if (prev1.close < prev1.open) confidence += 2;
    // Volume confirmation
    if ((last.volume || 0) > avgVol * 1.1) confidence += 2;

    return {
      direction: "PE",
      confidence: Math.min(95, confidence),
      reason: `SMTR trap reversal ${ind.orbHigh.toFixed(0)}, VIX ${ind.indiaVix?.toFixed(1) || 'N/A'}, CE OI +${oi.ceChangePct.toFixed(1)}%`,
      strikeOffset: useItm ? 1 : 0,
      riskPercent: 0.13,
    };
  }

  if (bearTrapPrice && vwapReclaim && bearOiOk && bearDeltaOk) {
    let confidence = 82;
    if (breakVolHigh) confidence += 3;
    if (vwapReclaim) confidence += 3;
    if (oi.pcrShift >= 0.08) confidence += 3;
    if (prev1.close > prev1.open) confidence += 2;
    // Volume confirmation
    if ((last.volume || 0) > avgVol * 1.1) confidence += 2;

    return {
      direction: "CE",
      confidence: Math.min(95, confidence),
      reason: `SMTR trap reversal ${ind.orbLow.toFixed(0)}, VIX ${ind.indiaVix?.toFixed(1) || 'N/A'}, PE OI +${oi.peChangePct.toFixed(1)}%`,
      strikeOffset: useItm ? -1 : 0,
      riskPercent: 0.13,
    };
  }

  return null;
}

function analyzeEMA(ind: MarketIndicators): StrategySignalResult | null {
  if (ind.candleCount < 20) return null;

  // VIX filter for trend following
  if (ind.indiaVix && ind.indiaVix > 24) return null;

  // Volume confirmation
  const avgVol = ind.recentCandles.slice(-5).reduce((sum, c) => sum + (c.volume || 0), 0) / 5;
  const volumeOk = (ind.lastCandle?.volume || 0) > avgVol * 0.8;
  if (!volumeOk) return null;

  const emaGap = ((ind.ema9 - ind.ema21) / ind.ema21) * 100;
  const priceAboveEma9 = ind.spotPrice > ind.ema9;
  const priceAboveEma21 = ind.spotPrice > ind.ema21;

  if (emaGap > 0.04 && priceAboveEma9) {
    if (!ind.lastCandle) return null;

    let confidence = 72;
    if (emaGap > 0.08) confidence += 4;
    if (emaGap > 0.15) confidence += 3;
    if (priceAboveEma21) confidence += 3;
    if (ind.rsi14 > 50 && ind.rsi14 < 72) confidence += 4;
    if (ind.spotPrice > ind.vwap) confidence += 3;
    if (ind.supertrendBullish) confidence += 3;
    if (ind.momentum > 0.02) confidence += 3;
    if (ind.lastCandle.close > ind.lastCandle.open) confidence += 2;
    const recentBullish = ind.recentCandles.slice(-3).filter(c => c.close > c.open).length;
    if (recentBullish >= 2) confidence += 3;
    // Volume surge
    if ((ind.lastCandle.volume || 0) > avgVol * 1.2) confidence += 3;

    return {
      direction: "CE",
      confidence: Math.min(95, confidence),
      reason: `EMA trend ${emaGap.toFixed(2)}%, VIX ${ind.indiaVix?.toFixed(1) || 'N/A'}, volume confirmed`,
      strikeOffset: 0,
      riskPercent: 0.13,
    };
  }

  if (emaGap < -0.04 && !priceAboveEma9) {
    if (!ind.lastCandle) return null;

    let confidence = 72;
    if (Math.abs(emaGap) > 0.08) confidence += 4;
    if (Math.abs(emaGap) > 0.15) confidence += 3;
    if (!priceAboveEma21) confidence += 3;
    if (ind.rsi14 < 50) confidence += 4;
    if (ind.spotPrice < ind.vwap) confidence += 3;
    if (!ind.supertrendBullish) confidence += 3;
    if (ind.momentum < -0.02) confidence += 3;
    if (ind.lastCandle.close < ind.lastCandle.open) confidence += 2;
    const recentBearish = ind.recentCandles.slice(-3).filter(c => c.close < c.open).length;
    if (recentBearish >= 2) confidence += 3;
    // Volume surge
    if ((ind.lastCandle.volume || 0) > avgVol * 1.2) confidence += 3;

    return {
      direction: "PE",
      confidence: Math.min(95, confidence),
      reason: `EMA trend ${Math.abs(emaGap).toFixed(2)}%, VIX ${ind.indiaVix?.toFixed(1) || 'N/A'}, volume confirmed`,
      strikeOffset: 0,
      riskPercent: 0.13,
    };
  }

  return null;
}

function analyzeVWAP(ind: MarketIndicators): StrategySignalResult | null {
  if (ind.candleCount < 15) return null;
  if (!ind.lastCandle || !ind.prevCandle) return null;

  // Volatility filter - avoid in extreme volatility
  if (ind.indiaVix && ind.indiaVix > 25) return null;

  const distFromVwap = ((ind.spotPrice - ind.vwap) / ind.vwap) * 100;
  const absDist = Math.abs(distFromVwap);

  // More realistic distance - wait for actual pullback
  if (absDist < 0.08 || absDist > 0.4) return null;

  // Strong trend confirmation required
  const trendBullish = ind.ema9 > ind.ema21 && ind.ema21 > ind.ema50 && ind.spotPrice > ind.ema50;
  const trendBearish = ind.ema9 < ind.ema21 && ind.ema21 < ind.ema50 && ind.spotPrice < ind.ema50;

  // Volume confirmation
  const avgVol = ind.recentCandles.slice(-5).reduce((sum, c) => sum + (c.volume || 0), 0) / 5;
  const volumeOk = (ind.lastCandle.volume || 0) > avgVol * 0.7; // At least 70% of average

  if (!volumeOk) return null;

  // Bullish setup: price pulled back to VWAP from above
  if (trendBullish && distFromVwap < 0.05 && distFromVwap > -0.2) {
    // Look for rejection from VWAP - long lower wick
    const candleRange = ind.lastCandle.high - ind.lastCandle.low;
    if (candleRange <= 0) return null;

    const lowerWick = Math.min(ind.lastCandle.open, ind.lastCandle.close) - ind.lastCandle.low;
    const wickRatio = lowerWick / candleRange;

    // Require bounce confirmation
    if (wickRatio < 0.25) return null; // Need lower wick showing rejection
    if (ind.lastCandle.close < ind.vwap * 0.997) return null; // Close should be near/above VWAP

    let confidence = 70;
    if (wickRatio > 0.4) confidence += 5; // Strong rejection
    if (ind.rsi14 > 40 && ind.rsi14 < 65) confidence += 4; // Good RSI range
    if (ind.supertrendBullish) confidence += 4;
    if (ind.lastCandle.close > ind.lastCandle.open) confidence += 3; // Bullish candle
    if (ind.spotPrice > ind.vwap) confidence += 3; // Above VWAP
    if (ind.prevCandle.close < ind.prevCandle.open && ind.lastCandle.close > ind.lastCandle.open) confidence += 3; // Reversal pattern

    // Price must be making higher lows
    const recentLows = ind.recentCandles.slice(-3).map(c => c.low);
    const risingLows = recentLows[2] > recentLows[0];
    if (!risingLows) confidence -= 5;

    if (confidence < 75) return null; // Higher threshold

    return {
      direction: "CE",
      confidence: Math.min(92, confidence),
      reason: `VWAP bounce ${distFromVwap.toFixed(2)}% from VWAP, wick ${(wickRatio * 100).toFixed(0)}%, RSI ${ind.rsi14.toFixed(0)}`,
      strikeOffset: 0,
      riskPercent: 0.13, // Reduced risk
    };
  }

  // Bearish setup: price rallied to VWAP from below
  if (trendBearish && distFromVwap > -0.05 && distFromVwap < 0.2) {
    const candleRange = ind.lastCandle.high - ind.lastCandle.low;
    if (candleRange <= 0) return null;

    const upperWick = ind.lastCandle.high - Math.max(ind.lastCandle.open, ind.lastCandle.close);
    const wickRatio = upperWick / candleRange;

    if (wickRatio < 0.25) return null;
    if (ind.lastCandle.close > ind.vwap * 1.003) return null;

    let confidence = 70;
    if (wickRatio > 0.4) confidence += 5;
    if (ind.rsi14 < 60 && ind.rsi14 > 35) confidence += 4;
    if (!ind.supertrendBullish) confidence += 4;
    if (ind.lastCandle.close < ind.lastCandle.open) confidence += 3;
    if (ind.spotPrice < ind.vwap) confidence += 3;
    if (ind.prevCandle.close > ind.prevCandle.open && ind.lastCandle.close < ind.lastCandle.open) confidence += 3;

    const recentHighs = ind.recentCandles.slice(-3).map(c => c.high);
    const fallingHighs = recentHighs[2] < recentHighs[0];
    if (!fallingHighs) confidence -= 5;

    if (confidence < 75) return null;

    return {
      direction: "PE",
      confidence: Math.min(92, confidence),
      reason: `VWAP rejection ${distFromVwap.toFixed(2)}% from VWAP, wick ${(wickRatio * 100).toFixed(0)}%, RSI ${ind.rsi14.toFixed(0)}`,
      strikeOffset: 0,
      riskPercent: 0.13,
    };
  }

  return null;
}

function analyzeRSI(ind: MarketIndicators): StrategySignalResult | null {
  if (ind.candleCount < 15) return null;
  if (!ind.lastCandle) return null;

  // CRITICAL: VIX filter for reversal safety
  if (ind.indiaVix && ind.indiaVix > 22) return null;

  // Volume confirmation - must have decent volume
  const avgVol = ind.recentCandles.slice(-5).reduce((sum, c) => sum + (c.volume || 0), 0) / 5;
  const volumeOk = (ind.lastCandle.volume || 0) > avgVol * 0.8;
  if (!volumeOk) return null;

  // Trend confirmation for safer reversals
  const trendBullish = ind.ema9 > ind.ema21 && ind.ema21 > ind.ema50;
  const trendBearish = ind.ema9 < ind.ema21 && ind.ema21 < ind.ema50;

  if (ind.rsi14 <= 30) {
    // Only long in established uptrend or neutral market
    if (trendBearish && ind.rsi14 > 25) return null;

    let confidence = 73;
    if (ind.rsi14 <= 25) confidence += 4;
    if (ind.rsi14 <= 20) confidence += 3;
    if (ind.spotPrice <= ind.dayLow * 1.003) confidence += 3;
    if (ind.lastCandle.close > ind.lastCandle.open) confidence += 4;
    if (ind.spotPrice > ind.dayLow) confidence += 2;
    if (ind.momentum > -0.1) confidence += 3;

    // Enhanced wick analysis
    const candleRange = ind.lastCandle.high - ind.lastCandle.low;
    if (candleRange > 0) {
      const lowerWick = Math.min(ind.lastCandle.open, ind.lastCandle.close) - ind.lastCandle.low;
      const wickRatio = lowerWick / candleRange;
      if (wickRatio > 0.3) confidence += 3;
      if (wickRatio > 0.5) confidence += 2;
    }

    // Trend alignment bonus
    if (trendBullish) confidence += 4;
    if (ind.spotPrice > ind.vwap) confidence += 3;

    // Volume surge confirmation
    if ((ind.lastCandle.volume || 0) > avgVol * 1.3) confidence += 3;

    return {
      direction: "CE",
      confidence: Math.min(95, confidence),
      reason: `RSI oversold reversal at ${ind.rsi14.toFixed(1)}, VIX ${ind.indiaVix?.toFixed(1) || 'N/A'}, volume confirmed`,
      strikeOffset: 0,
      riskPercent: 0.12,
    };
  }

  if (ind.rsi14 >= 70) {
    // Only short in established downtrend or neutral market
    if (trendBullish && ind.rsi14 < 75) return null;

    let confidence = 73;
    if (ind.rsi14 >= 75) confidence += 4;
    if (ind.rsi14 >= 80) confidence += 3;
    if (ind.spotPrice >= ind.dayHigh * 0.997) confidence += 3;
    if (ind.lastCandle.close < ind.lastCandle.open) confidence += 4;
    if (ind.spotPrice < ind.dayHigh) confidence += 2;
    if (ind.momentum < 0.1) confidence += 3;

    // Enhanced wick analysis
    const candleRange = ind.lastCandle.high - ind.lastCandle.low;
    if (candleRange > 0) {
      const upperWick = ind.lastCandle.high - Math.max(ind.lastCandle.open, ind.lastCandle.close);
      const wickRatio = upperWick / candleRange;
      if (wickRatio > 0.3) confidence += 3;
      if (wickRatio > 0.5) confidence += 2;
    }

    // Trend alignment bonus
    if (trendBearish) confidence += 4;
    if (ind.spotPrice < ind.vwap) confidence += 3;

    // Volume surge confirmation
    if ((ind.lastCandle.volume || 0) > avgVol * 1.3) confidence += 3;

    return {
      direction: "PE",
      confidence: Math.min(95, confidence),
      reason: `RSI overbought reversal at ${ind.rsi14.toFixed(1)}, VIX ${ind.indiaVix?.toFixed(1) || 'N/A'}, volume confirmed`,
      strikeOffset: 0,
      riskPercent: 0.12,
    };
  }

  return null;
}

function analyzeRSIRange(ind: MarketIndicators): StrategySignalResult | null {
  if (ind.candleCount < 15) return null;
  if (!ind.lastCandle) return null;

  // VIX filter for range trading
  if (ind.indiaVix && ind.indiaVix > 21) return null;

  // Volume confirmation
  const avgVol = ind.recentCandles.slice(-5).reduce((sum, c) => sum + (c.volume || 0), 0) / 5;
  const volumeOk = (ind.lastCandle.volume || 0) > avgVol * 0.7;
  if (!volumeOk) return null;

  const dayRange = ind.dayHigh - ind.dayLow;
  if (dayRange <= 0) return null;

  const rangePct = (dayRange / ind.spotPrice) * 100;
  const midRange = (ind.dayHigh + ind.dayLow) / 2;
  const distanceFromMidPct = Math.abs((ind.spotPrice - midRange) / ind.spotPrice) * 100;

  const isRangeBound = rangePct < 1.2 && distanceFromMidPct < 0.45;
  if (!isRangeBound) return null;

  const nearVwap = Math.abs((ind.spotPrice - ind.vwap) / ind.vwap) * 100 < 0.2;
  if (!nearVwap) return null;

  const candleBody = Math.abs(ind.lastCandle.close - ind.lastCandle.open);
  const candleRange = ind.lastCandle.high - ind.lastCandle.low;
  const wickHeavy = candleRange > 0 && (candleRange - candleBody) / candleRange > 0.45;

  if (ind.rsi14 <= 38 && ind.lastCandle.close > ind.lastCandle.open && wickHeavy) {
    let confidence = 74;
    if (ind.rsi14 <= 34) confidence += 3;
    if (ind.spotPrice >= ind.vwap) confidence += 3;
    if (distanceFromMidPct < 0.25) confidence += 3;
    // Trend alignment
    if (ind.ema9 > ind.ema21) confidence += 3;

    return {
      direction: "CE",
      confidence: Math.min(92, confidence),
      reason: `RSI range ${ind.rsi14.toFixed(1)}, VIX ${ind.indiaVix?.toFixed(1) || 'N/A'}, mean-reversion`,
      strikeOffset: 0,
      riskPercent: 0.12,
    };
  }

  if (ind.rsi14 >= 62 && ind.lastCandle.close < ind.lastCandle.open && wickHeavy) {
    let confidence = 74;
    if (ind.rsi14 >= 66) confidence += 3;
    if (ind.spotPrice <= ind.vwap) confidence += 3;
    if (distanceFromMidPct < 0.25) confidence += 3;
    // Trend alignment
    if (ind.ema9 < ind.ema21) confidence += 3;

    return {
      direction: "PE",
      confidence: Math.min(92, confidence),
      reason: `RSI range ${ind.rsi14.toFixed(1)}, VIX ${ind.indiaVix?.toFixed(1) || 'N/A'}, mean-reversion`,
      strikeOffset: 0,
      riskPercent: 0.12,
    };
  }

  return null;
}

function analyzeSupertrend(ind: MarketIndicators): StrategySignalResult | null {
  if (ind.candleCount < 15) return null;
  if (!ind.lastCandle) return null;

  // VIX filter
  if (ind.indiaVix && ind.indiaVix > 24) return null;

  // Volume confirmation
  const avgVol = ind.recentCandles.slice(-5).reduce((sum, c) => sum + (c.volume || 0), 0) / 5;
  const volumeOk = (ind.lastCandle.volume || 0) > avgVol * 0.8;
  if (!volumeOk) return null;

  const priceAboveST = ind.spotPrice > ind.supertrend;

  if (ind.supertrendBullish && priceAboveST) {
    let confidence = 73;
    if (ind.ema9 > ind.ema21) confidence += 4;
    if (ind.rsi14 > 45 && ind.rsi14 < 72) confidence += 3;
    if (ind.spotPrice > ind.vwap) confidence += 3;
    if (ind.momentum > 0) confidence += 3;
    if (ind.lastCandle.close > ind.lastCandle.open) confidence += 3;
    const recentBullish = ind.recentCandles.slice(-3).filter(c => c.close > c.open).length;
    if (recentBullish >= 2) confidence += 3;
    const stDistance = ((ind.spotPrice - ind.supertrend) / ind.supertrend) * 100;
    if (stDistance < 0.2) confidence += 3;
    // Volume surge
    if ((ind.lastCandle.volume || 0) > avgVol * 1.2) confidence += 3;

    return {
      direction: "CE",
      confidence: Math.min(95, confidence),
      reason: `Supertrend bullish ${ind.supertrend.toFixed(0)}, VIX ${ind.indiaVix?.toFixed(1) || 'N/A'}`,
      strikeOffset: 0,
      riskPercent: 0.13,
    };
  }

  if (!ind.supertrendBullish && !priceAboveST) {
    let confidence = 73;
    if (ind.ema9 < ind.ema21) confidence += 4;
    if (ind.rsi14 < 55 && ind.rsi14 > 28) confidence += 3;
    if (ind.spotPrice < ind.vwap) confidence += 3;
    if (ind.momentum < 0) confidence += 3;
    if (ind.lastCandle.close < ind.lastCandle.open) confidence += 3;
    const recentBearish = ind.recentCandles.slice(-3).filter(c => c.close < c.open).length;
    if (recentBearish >= 2) confidence += 3;
    const stDistance = ((ind.supertrend - ind.spotPrice) / ind.supertrend) * 100;
    if (stDistance < 0.2) confidence += 3;
    // Volume surge
    if ((ind.lastCandle.volume || 0) > avgVol * 1.2) confidence += 3;

    return {
      direction: "PE",
      confidence: Math.min(95, confidence),
      reason: `Supertrend bearish ${ind.supertrend.toFixed(0)}, VIX ${ind.indiaVix?.toFixed(1) || 'N/A'}`,
      strikeOffset: 0,
      riskPercent: 0.13,
    };
  }

  return null;
}

function analyzeTripleConfluence(ind: MarketIndicators): StrategySignalResult | null {
  if (ind.candleCount < 15) return null;
  if (!ind.lastCandle) return null;

  // VIX filter
  if (ind.indiaVix && ind.indiaVix > 24) return null;

  // Volume confirmation
  const avgVol = ind.recentCandles.slice(-5).reduce((sum, c) => sum + (c.volume || 0), 0) / 5;
  const volumeOk = (ind.lastCandle.volume || 0) > avgVol * 0.8;
  if (!volumeOk) return null;

  const emaGap = ((ind.ema9 - ind.ema21) / ind.ema21) * 100;
  const emaBullish = emaGap > 0.03 && ind.spotPrice > ind.ema9;
  const emaBearish = emaGap < -0.03 && ind.spotPrice < ind.ema9;
  const vwapBullish = ind.spotPrice > ind.vwap;
  const vwapBearish = ind.spotPrice < ind.vwap;
  const rsiBullish = ind.rsi14 > 52;
  const rsiBearish = ind.rsi14 < 48;

  if (emaBullish && vwapBullish && rsiBullish) {
    let confidence = 77;
    if (ind.supertrendBullish) confidence += 3;
    if (ind.momentum > 0.02) confidence += 3;
    if (Math.abs(emaGap) > 0.08) confidence += 3;
    if (ind.rsi14 > 55 && ind.rsi14 < 70) confidence += 3;
    if (ind.lastCandle.close > ind.lastCandle.open) confidence += 2;
    const recentBullish = ind.recentCandles.slice(-3).filter(c => c.close > c.open).length;
    if (recentBullish >= 2) confidence += 3;
    // Volume surge
    if ((ind.lastCandle.volume || 0) > avgVol * 1.2) confidence += 3;

    return {
      direction: "CE",
      confidence: Math.min(95, confidence),
      reason: `Triple confluence ${emaGap.toFixed(2)}%, VIX ${ind.indiaVix?.toFixed(1) || 'N/A'}`,
      strikeOffset: 0,
      riskPercent: 0.13,
    };
  }

  if (emaBearish && vwapBearish && rsiBearish) {
    let confidence = 77;
    if (!ind.supertrendBullish) confidence += 3;
    if (ind.momentum < -0.02) confidence += 3;
    if (Math.abs(emaGap) > 0.08) confidence += 3;
    if (ind.rsi14 < 45 && ind.rsi14 > 30) confidence += 3;
    if (ind.lastCandle.close < ind.lastCandle.open) confidence += 2;
    const recentBearish = ind.recentCandles.slice(-3).filter(c => c.close < c.open).length;
    if (recentBearish >= 2) confidence += 3;
    // Volume surge
    if ((ind.lastCandle.volume || 0) > avgVol * 1.2) confidence += 3;

    return {
      direction: "PE",
      confidence: Math.min(95, confidence),
      reason: `Triple confluence ${Math.abs(emaGap).toFixed(2)}%, VIX ${ind.indiaVix?.toFixed(1) || 'N/A'}`,
      strikeOffset: 0,
      riskPercent: 0.13,
    };
  }

  return null;
}

function analyzeMarketTop(ind: MarketIndicators): StrategySignalResult | null {
  if (ind.candleCount < 15) return null;
  if (!ind.lastCandle) return null;

  // CRITICAL: VIX filter for reversal trades
  if (ind.indiaVix && ind.indiaVix > 23) return null;

  // Volume surge required for reversal confirmation
  const avgVol = ind.recentCandles.slice(-5).reduce((sum, c) => sum + (c.volume || 0), 0) / 5;
  const volumeSurge = (ind.lastCandle.volume || 0) > avgVol * 1.2;
  if (!volumeSurge) return null;

  const dayRange = ind.dayHigh - ind.dayLow;
  if (dayRange < ind.spotPrice * 0.001) return null;

  const positionInRange = dayRange > 0 ? ((ind.spotPrice - ind.dayLow) / dayRange) * 100 : 50;

  if (positionInRange > 85 && ind.rsi14 > 68) {
    // Stricter entry at market top
    let confidence = 75;
    if (ind.rsi14 > 72) confidence += 3;
    if (ind.rsi14 > 76) confidence += 3;
    if (ind.rsi14 > 80) confidence += 3;
    if (ind.lastCandle.close < ind.lastCandle.open) confidence += 4;
    if (!ind.supertrendBullish) confidence += 3;
    if (ind.ema9 < ind.ema21) confidence += 3;
    if (ind.momentum < 0.05) confidence += 3;

    // Enhanced wick analysis
    const candleRange = ind.lastCandle.high - ind.lastCandle.low;
    if (candleRange > 0) {
      const upperWick = ind.lastCandle.high - Math.max(ind.lastCandle.open, ind.lastCandle.close);
      const wickRatio = upperWick / candleRange;
      if (wickRatio > 0.25) confidence += 3;
      if (wickRatio > 0.4) confidence += 3;
    }

    // Volume confirmation
    if ((ind.lastCandle.volume || 0) > avgVol * 1.5) confidence += 3;

    // Multiple bearish candles
    const recentBearish = ind.recentCandles.slice(-3).filter(c => c.close < c.open).length;
    if (recentBearish >= 2) confidence += 2;

    // Must have high confidence for reversal
    if (confidence < 85) return null;

    return {
      direction: "PE",
      confidence: Math.min(95, confidence),
      reason: `Market top reversal: RSI ${ind.rsi14.toFixed(0)}, ${positionInRange.toFixed(0)}% range, VIX ${ind.indiaVix?.toFixed(1) || 'N/A'}`,
      strikeOffset: 0,
      riskPercent: 0.13,
    };
  }

  if (positionInRange < 15 && ind.rsi14 < 32) {
    // Stricter entry at market bottom
    let confidence = 75;
    if (ind.rsi14 < 28) confidence += 3;
    if (ind.rsi14 < 24) confidence += 3;
    if (ind.rsi14 < 20) confidence += 3;
    if (ind.lastCandle.close > ind.lastCandle.open) confidence += 4;
    if (ind.supertrendBullish) confidence += 3;
    if (ind.ema9 > ind.ema21) confidence += 3;
    if (ind.momentum > -0.05) confidence += 3;

    // Enhanced wick analysis
    const candleRange = ind.lastCandle.high - ind.lastCandle.low;
    if (candleRange > 0) {
      const lowerWick = Math.min(ind.lastCandle.open, ind.lastCandle.close) - ind.lastCandle.low;
      const wickRatio = lowerWick / candleRange;
      if (wickRatio > 0.25) confidence += 3;
      if (wickRatio > 0.4) confidence += 3;
    }

    // Volume confirmation
    if ((ind.lastCandle.volume || 0) > avgVol * 1.5) confidence += 3;

    // Multiple bullish candles
    const recentBullish = ind.recentCandles.slice(-3).filter(c => c.close > c.open).length;
    if (recentBullish >= 2) confidence += 2;

    // Must have high confidence for reversal
    if (confidence < 85) return null;

    return {
      direction: "CE",
      confidence: Math.min(95, confidence),
      reason: `Market bottom reversal: RSI ${ind.rsi14.toFixed(0)}, ${positionInRange.toFixed(0)}% range, VIX ${ind.indiaVix?.toFixed(1) || 'N/A'}`,
      strikeOffset: 0,
      riskPercent: 0.13,
    };
  }

  return null;
}

function analyzeScalp(ind: MarketIndicators): StrategySignalResult | null {
  if (ind.candleCount < 10) return null;
  if (!ind.lastCandle) return null;

  // VIX filter - scalping needs low volatility
  if (ind.indiaVix && ind.indiaVix > 20) return null;

  // Volume confirmation
  const avgVol = ind.recentCandles.slice(-5).reduce((sum, c) => sum + (c.volume || 0), 0) / 5;
  const volumeOk = (ind.lastCandle.volume || 0) > avgVol * 0.9;
  if (!volumeOk) return null;

  const lastBody = Math.abs(ind.lastCandle.close - ind.lastCandle.open);
  const lastRange = ind.lastCandle.high - ind.lastCandle.low;

  if (lastBody < ind.atr14 * 0.35) return null;
  if (lastRange === 0) return null;

  const bodyRatio = lastBody / lastRange;
  const bullishCandle = ind.lastCandle.close > ind.lastCandle.open && bodyRatio > 0.55;
  const bearishCandle = ind.lastCandle.close < ind.lastCandle.open && bodyRatio > 0.55;

  if (bullishCandle && ind.rsi14 > 42 && ind.rsi14 < 75) {
    let confidence = 73;
    if (ind.momentum > 0.02) confidence += 3;
    if (ind.spotPrice > ind.vwap) confidence += 3;
    if (ind.ema9 > ind.ema21) confidence += 3;
    if (ind.supertrendBullish) confidence += 3;
    if (lastBody > ind.atr14 * 0.5) confidence += 3;
    if (bodyRatio > 0.7) confidence += 3;
    const recentBullish = ind.recentCandles.slice(-3).filter(c => c.close > c.open).length;
    if (recentBullish >= 2) confidence += 3;
    // Volume surge
    if ((ind.lastCandle.volume || 0) > avgVol * 1.2) confidence += 3;

    return {
      direction: "CE",
      confidence: Math.min(95, confidence),
      reason: `Scalp momentum, VIX ${ind.indiaVix?.toFixed(1) || 'N/A'}, ${(bodyRatio*100).toFixed(0)}% body`,
      strikeOffset: 0,
      riskPercent: 0.12,
    };
  }

  if (bearishCandle && ind.rsi14 < 58 && ind.rsi14 > 25) {
    let confidence = 73;
    if (ind.momentum < -0.02) confidence += 3;
    if (ind.spotPrice < ind.vwap) confidence += 3;
    if (ind.ema9 < ind.ema21) confidence += 3;
    if (!ind.supertrendBullish) confidence += 3;
    if (lastBody > ind.atr14 * 0.5) confidence += 3;
    if (bodyRatio > 0.7) confidence += 3;
    const recentBearish = ind.recentCandles.slice(-3).filter(c => c.close < c.open).length;
    if (recentBearish >= 2) confidence += 3;
    // Volume surge
    if ((ind.lastCandle.volume || 0) > avgVol * 1.2) confidence += 3;

    return {
      direction: "PE",
      confidence: Math.min(95, confidence),
      reason: `Scalp momentum, VIX ${ind.indiaVix?.toFixed(1) || 'N/A'}, ${(bodyRatio*100).toFixed(0)}% body`,
      strikeOffset: 0,
      riskPercent: 0.12,
    };
  }

  return null;
}

function analyzeEmaPullback(ind: MarketIndicators): StrategySignalResult | null {
  if (ind.candleCount < 50) return null;
  
  // Convert todayCandles to the format expected by EmaPullbackEngine
  const candles = ind.todayCandles.map(c => ({
    timestamp: c.timestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));

  if (candles.length === 0) return null;

  // Analyze using the EmaPullbackEngine
  const signal = EmaPullbackEngine.analyze(
    ind.spotPrice,
    ind.vwap,
    candles,
    new Date()
  );

  if (!signal.isValid || !signal.setup) {
    return null;
  }

  const setup = signal.setup;

  // Map the EmaPullbackEngine result to StrategySignalResult
  return {
    direction: setup.direction,
    confidence: setup.confidence,
    reason: setup.reason,
    strikeOffset: 0, // ATM strikes
    riskPercent: 0.15, // Conservative risk
  };
}

function analyzeAfternoonVwapMomentum(ind: MarketIndicators, hour: number, minute: number): StrategySignalResult | null {
  // Time filter: 13:45 - 15:10
  const timeInMinutes = hour * 60 + minute;
  const startTime = 13 * 60 + 45;
  const endTime = 15 * 60 + 10;

  if (timeInMinutes < startTime || timeInMinutes > endTime) {
    return null;
  }

  // VIX filter - afternoon needs lower volatility
  if (ind.indiaVix && ind.indiaVix > 19) return null;

  // Volume confirmation
  const avgVol = ind.recentCandles.slice(-5).reduce((sum, c) => sum + (c.volume || 0), 0) / 5;
  const volumeOk = (ind.lastCandle?.volume || 0) > avgVol * 0.9;
  if (!volumeOk) return null;

  if (ind.candleCount < 2 || !ind.lastCandle || !ind.prevCandle) {
    return null;
  }

  // Check for two consecutive candles pattern
  const lastTwoBullish = ind.lastCandle.close > ind.lastCandle.open &&
                          ind.prevCandle.close > ind.prevCandle.open;
  const lastTwoBearish = ind.lastCandle.close < ind.lastCandle.open &&
                          ind.prevCandle.close < ind.prevCandle.open;

  // Current candle range
  const currentRange = ind.lastCandle.high - ind.lastCandle.low;
  const atrExpansion = currentRange > (ind.atr14 * 1.2);

  // BEARISH Setup (PE BUY)
  if (ind.spotPrice < ind.vwap &&
      ind.ema9 < ind.ema21 &&
      lastTwoBearish &&
      ind.lastCandle.low < ind.dayLow &&
      atrExpansion) {

    let confidence = 68;
    if (atrExpansion) confidence += 5;
    if (ind.momentum < -0.03) confidence += 5;
    if (ind.spotPrice < ind.vwap * 0.995) confidence += 5;
    // Volume surge
    if ((ind.lastCandle.volume || 0) > avgVol * 1.2) confidence += 4;

    return {
      direction: "PE",
      confidence: Math.min(85, confidence),
      reason: `Afternoon momentum, VIX ${ind.indiaVix?.toFixed(1) || 'N/A'}, day low break`,
      strikeOffset: 0,
      riskPercent: 0.12,
    };
  }

  // BULLISH Setup (CE BUY)
  if (ind.spotPrice > ind.vwap &&
      ind.ema9 > ind.ema21 &&
      lastTwoBullish &&
      ind.lastCandle.high > ind.dayHigh &&
      atrExpansion) {

    let confidence = 68;
    if (atrExpansion) confidence += 5;
    if (ind.momentum > 0.03) confidence += 5;
    if (ind.spotPrice > ind.vwap * 1.005) confidence += 5;
    // Volume surge
    if ((ind.lastCandle.volume || 0) > avgVol * 1.2) confidence += 4;

    return {
      direction: "CE",
      confidence: Math.min(85, confidence),
      reason: `Afternoon momentum, VIX ${ind.indiaVix?.toFixed(1) || 'N/A'}, day high break`,
      strikeOffset: 0,
      riskPercent: 0.12,
    };
  }

  return null;
}

function analyzeGapFade(ind: MarketIndicators, hour: number, minute: number): StrategySignalResult | null {
  if (hour < 9 || (hour === 9 && minute < 20)) return null;
  if (hour > 10 || (hour === 10 && minute > 45)) return null;
  if (!ind.lastCandle || !ind.prevCandle) return null;

  // VIX filter for gap trades
  if (ind.indiaVix && ind.indiaVix > 23) return null;

  // Volume confirmation
  const avgVol = ind.recentCandles.slice(-5).reduce((sum, c) => sum + (c.volume || 0), 0) / 5;
  if ((ind.lastCandle.volume || 0) < avgVol * 0.8) return null;

  const gapPct = ((ind.dayOpen - ind.prevClose) / ind.prevClose) * 100;
  const absGap = Math.abs(gapPct);
  if (absGap < 0.25 || absGap > 2.5) return null;

  const candleRange = ind.lastCandle.high - ind.lastCandle.low;
  const body = Math.abs(ind.lastCandle.close - ind.lastCandle.open);
  const rejection = candleRange > 0 && (candleRange - body) / candleRange > 0.4;

  if (gapPct > 0) {
    const failingGap = ind.spotPrice < ind.dayOpen && ind.lastCandle.close < ind.lastCandle.open;
    if (!failingGap || !rejection) return null;

    let confidence = 76;
    if (ind.spotPrice < ind.vwap) confidence += 4;
    if (ind.ema9 < ind.ema21) confidence += 4;
    if (!ind.supertrendBullish) confidence += 3;
    if (ind.rsi14 < 50) confidence += 2;
    if (ind.momentum < -0.02) confidence += 2;

    return {
      direction: "PE",
      confidence: Math.min(92, confidence),
      reason: `Gap fade short: +${gapPct.toFixed(2)}% gap failed below open ${ind.dayOpen.toFixed(0)}`,
      strikeOffset: 0,
      riskPercent: 0.14,
    };
  }

  const reclaimingGap = ind.spotPrice > ind.dayOpen && ind.lastCandle.close > ind.lastCandle.open;
  if (!reclaimingGap || !rejection) return null;

  let confidence = 76;
  if (ind.spotPrice > ind.vwap) confidence += 4;
  if (ind.ema9 > ind.ema21) confidence += 4;
  if (ind.supertrendBullish) confidence += 3;
  if (ind.rsi14 > 50) confidence += 2;
  if (ind.momentum > 0.02) confidence += 2;

  return {
    direction: "CE",
    confidence: Math.min(92, confidence),
    reason: `Gap fade long: ${gapPct.toFixed(2)}% gap down reclaimed above open ${ind.dayOpen.toFixed(0)}`,
    strikeOffset: 0,
    riskPercent: 0.14,
  };
}

function analyzeCPR(ind: MarketIndicators): StrategySignalResult | null {
  if (ind.candleCount < 15 || !ind.lastCandle) return null;

  // VIX filter
  if (ind.indiaVix && ind.indiaVix > 23) return null;

  // Volume confirmation
  const avgVol = ind.recentCandles.slice(-5).reduce((sum, c) => sum + (c.volume || 0), 0) / 5;
  if ((ind.lastCandle.volume || 0) < avgVol * 0.8) return null;

  const pivot = (ind.prevClose + ind.dayOpen + ind.spotPrice) / 3;
  const cprWidthPct = (Math.abs(ind.dayOpen - ind.prevClose) / ind.spotPrice) * 100;
  const narrowCPR = cprWidthPct <= 0.35;
  if (!narrowCPR) return null;

  const trendBull = ind.spotPrice > pivot && ind.spotPrice > ind.vwap && ind.ema9 > ind.ema21;
  const trendBear = ind.spotPrice < pivot && ind.spotPrice < ind.vwap && ind.ema9 < ind.ema21;

  if (trendBull && ind.rsi14 > 50 && ind.lastCandle.close > ind.lastCandle.open) {
    let confidence = 75;
    if (ind.supertrendBullish) confidence += 3;
    if (ind.momentum > 0.02) confidence += 2;
    if (Math.abs((ind.spotPrice - pivot) / pivot) * 100 > 0.1) confidence += 2;
    return {
      direction: "CE",
      confidence: Math.min(90, confidence),
      reason: `CPR bullish breakout: narrow base (${cprWidthPct.toFixed(2)}%), price above pivot ${pivot.toFixed(0)}`,
      strikeOffset: 0,
      riskPercent: 0.13,
    };
  }

  if (trendBear && ind.rsi14 < 50 && ind.lastCandle.close < ind.lastCandle.open) {
    let confidence = 75;
    if (!ind.supertrendBullish) confidence += 3;
    if (ind.momentum < -0.02) confidence += 2;
    if (Math.abs((pivot - ind.spotPrice) / pivot) * 100 > 0.1) confidence += 2;
    return {
      direction: "PE",
      confidence: Math.min(90, confidence),
      reason: `CPR bearish breakdown: narrow base (${cprWidthPct.toFixed(2)}%), price below pivot ${pivot.toFixed(0)}`,
      strikeOffset: 0,
      riskPercent: 0.13,
    };
  }

  return null;
}

function analyzeInsideCandle(ind: MarketIndicators): StrategySignalResult | null {
  if (ind.candleCount < 8 || !ind.lastCandle || !ind.prevCandle) return null;

  // VIX filter
  if (ind.indiaVix && ind.indiaVix > 23) return null;

  // Volume confirmation
  const avgVol = ind.recentCandles.slice(-5).reduce((sum, c) => sum + (c.volume || 0), 0) / 5;
  if ((ind.lastCandle.volume || 0) < avgVol * 0.7) return null;

  const inside = ind.lastCandle.high <= ind.prevCandle.high && ind.lastCandle.low >= ind.prevCandle.low;
  if (!inside) return null;

  const motherRange = ind.prevCandle.high - ind.prevCandle.low;
  if (motherRange <= 0 || motherRange < ind.atr14 * 0.5) return null;

  const bullishBias = ind.spotPrice > ind.vwap && ind.ema9 > ind.ema21 && ind.rsi14 >= 50;
  const bearishBias = ind.spotPrice < ind.vwap && ind.ema9 < ind.ema21 && ind.rsi14 <= 50;

  if (bullishBias) {
    let confidence = 74;
    if (ind.supertrendBullish) confidence += 3;
    if (ind.momentum > 0.01) confidence += 2;
    if (ind.lastCandle.close > ind.lastCandle.open) confidence += 2;
    return {
      direction: "CE",
      confidence: Math.min(89, confidence),
      reason: `Inside-candle breakout setup bullish: compression ${(motherRange / Math.max(ind.atr14, 1)).toFixed(2)}x ATR` ,
      strikeOffset: 0,
      riskPercent: 0.12,
    };
  }

  if (bearishBias) {
    let confidence = 74;
    if (!ind.supertrendBullish) confidence += 3;
    if (ind.momentum < -0.01) confidence += 2;
    if (ind.lastCandle.close < ind.lastCandle.open) confidence += 2;
    return {
      direction: "PE",
      confidence: Math.min(89, confidence),
      reason: `Inside-candle breakout setup bearish: compression ${(motherRange / Math.max(ind.atr14, 1)).toFixed(2)}x ATR`,
      strikeOffset: 0,
      riskPercent: 0.12,
    };
  }

  return null;
}

function analyzeProORB(ind: MarketIndicators, hour: number, minute: number): StrategySignalResult | null {
  if (hour < 9 || (hour === 9 && minute < 25) || hour > 11) return null;
  if (!ind.orbHigh || !ind.orbLow || !ind.lastCandle) return null;

  // VIX filter
  if (ind.indiaVix && ind.indiaVix > 24) return null;

  // Volume confirmation
  const avgVol = ind.recentCandles.slice(-5).reduce((sum, c) => sum + (c.volume || 0), 0) / 5;
  if ((ind.lastCandle.volume || 0) < avgVol * 0.9) return null;

  const orbRange = ind.orbHigh - ind.orbLow;
  if (orbRange <= 0) return null;
  const rangePct = (orbRange / ind.spotPrice) * 100;
  if (rangePct < 0.03 || rangePct > 1.1) return null;

  const oi = ind.oiSnapshot;

  if (ind.spotPrice > ind.orbHigh) {
    const strength = (ind.spotPrice - ind.orbHigh) / orbRange;
    if (strength < 0.15) return null;
    if (!(ind.ema9 > ind.ema21 && ind.spotPrice > ind.vwap && ind.supertrendBullish)) return null;

    let confidence = 80;
    if (ind.rsi14 > 55 && ind.rsi14 < 72) confidence += 3;
    if (ind.momentum > 0.03) confidence += 3;
    if (ind.lastCandle.close > ind.lastCandle.open) confidence += 2;
    if (oi && oi.peChangePct > oi.ceChangePct) confidence += 2;

    return {
      direction: "CE",
      confidence: Math.min(95, confidence),
      reason: `PRO ORB bullish: breakout above ${ind.orbHigh.toFixed(0)} with strength ${(strength * 100).toFixed(1)}%`,
      strikeOffset: 0,
      riskPercent: 0.14,
    };
  }

  if (ind.spotPrice < ind.orbLow) {
    const strength = (ind.orbLow - ind.spotPrice) / orbRange;
    if (strength < 0.15) return null;
    if (!(ind.ema9 < ind.ema21 && ind.spotPrice < ind.vwap && !ind.supertrendBullish)) return null;

    let confidence = 80;
    if (ind.rsi14 < 45 && ind.rsi14 > 28) confidence += 3;
    if (ind.momentum < -0.03) confidence += 3;
    if (ind.lastCandle.close < ind.lastCandle.open) confidence += 2;
    if (oi && oi.ceChangePct > oi.peChangePct) confidence += 2;

    return {
      direction: "PE",
      confidence: Math.min(95, confidence),
      reason: `PRO ORB bearish: breakdown below ${ind.orbLow.toFixed(0)} with strength ${(strength * 100).toFixed(1)}%`,
      strikeOffset: 0,
      riskPercent: 0.14,
    };
  }

  return null;
}

function analyzeVWAPReversion(ind: MarketIndicators): StrategySignalResult | null {
  if (ind.candleCount < 12 || !ind.lastCandle) return null;

  const distPct = ((ind.spotPrice - ind.vwap) / ind.vwap) * 100;
  const absDist = Math.abs(distPct);
  if (absDist < 0.35 || absDist > 1.8) return null;

  const candleRange = ind.lastCandle.high - ind.lastCandle.low;
  if (candleRange <= 0) return null;

  const upperWick = ind.lastCandle.high - Math.max(ind.lastCandle.open, ind.lastCandle.close);
  const lowerWick = Math.min(ind.lastCandle.open, ind.lastCandle.close) - ind.lastCandle.low;

  if (distPct > 0 && upperWick / candleRange > 0.3 && ind.rsi14 > 62) {
    let confidence = 76;
    if (ind.momentum <= 0.03) confidence += 3;
    if (ind.lastCandle.close < ind.lastCandle.open) confidence += 3;
    if (!ind.supertrendBullish) confidence += 2;
    return {
      direction: "PE",
      confidence: Math.min(91, confidence),
      reason: `VWAP reversion short: ${absDist.toFixed(2)}% above VWAP with rejection wick`,
      strikeOffset: 0,
      riskPercent: 0.12,
    };
  }

  if (distPct < 0 && lowerWick / candleRange > 0.3 && ind.rsi14 < 38) {
    let confidence = 76;
    if (ind.momentum >= -0.03) confidence += 3;
    if (ind.lastCandle.close > ind.lastCandle.open) confidence += 3;
    if (ind.supertrendBullish) confidence += 2;
    return {
      direction: "CE",
      confidence: Math.min(91, confidence),
      reason: `VWAP reversion long: ${absDist.toFixed(2)}% below VWAP with rejection wick`,
      strikeOffset: 0,
      riskPercent: 0.12,
    };
  }

  return null;
}

function analyzeBreakoutStrength(ind: MarketIndicators): StrategySignalResult | null {
  if (ind.candleCount < 12 || !ind.lastCandle || !ind.prevCandle) return null;

  const currentRange = ind.lastCandle.high - ind.lastCandle.low;
  if (currentRange <= 0 || ind.atr14 <= 0) return null;

  const expansion = currentRange / ind.atr14;
  if (expansion < 1.2) return null;

  const avgVol = ind.recentCandles.slice(-8).reduce((sum, c) => sum + (c.volume || 0), 0) / Math.max(1, Math.min(8, ind.recentCandles.length));
  const volBoost = (ind.lastCandle.volume || 0) > avgVol * 1.25;

  const brokeHigh = ind.lastCandle.close > ind.dayHigh * 0.999 && ind.lastCandle.high >= ind.dayHigh;
  const brokeLow = ind.lastCandle.close < ind.dayLow * 1.001 && ind.lastCandle.low <= ind.dayLow;

  if (brokeHigh && ind.ema9 > ind.ema21 && ind.spotPrice > ind.vwap) {
    let confidence = 78;
    if (volBoost) confidence += 4;
    if (ind.momentum > 0.03) confidence += 3;
    if (ind.rsi14 > 55 && ind.rsi14 < 78) confidence += 2;
    if (ind.supertrendBullish) confidence += 2;
    return {
      direction: "CE",
      confidence: Math.min(94, confidence),
      reason: `Breakout strength bullish: range ${expansion.toFixed(2)}x ATR with ${volBoost ? "high" : "normal"} volume`,
      strikeOffset: 0,
      riskPercent: 0.14,
    };
  }

  if (brokeLow && ind.ema9 < ind.ema21 && ind.spotPrice < ind.vwap) {
    let confidence = 78;
    if (volBoost) confidence += 4;
    if (ind.momentum < -0.03) confidence += 3;
    if (ind.rsi14 < 45 && ind.rsi14 > 22) confidence += 2;
    if (!ind.supertrendBullish) confidence += 2;
    return {
      direction: "PE",
      confidence: Math.min(94, confidence),
      reason: `Breakout strength bearish: range ${expansion.toFixed(2)}x ATR with ${volBoost ? "high" : "normal"} volume`,
      strikeOffset: 0,
      riskPercent: 0.14,
    };
  }

  return null;
}

function analyzeRegimeBased(ind: MarketIndicators): StrategySignalResult | null {
  if (ind.candleCount < 20 || !ind.lastCandle) return null;

  // VIX filter
  if (ind.indiaVix && ind.indiaVix > 24) return null;

  // Volume confirmation
  const avgVol = ind.recentCandles.slice(-5).reduce((sum, c) => sum + (c.volume || 0), 0) / 5;
  if ((ind.lastCandle.volume || 0) < avgVol * 0.8) return null;

  const dayRangePct = ((ind.dayHigh - ind.dayLow) / ind.spotPrice) * 100;
  const emaGapPct = Math.abs((ind.ema9 - ind.ema21) / ind.ema21) * 100;
  const vwapDistPct = Math.abs((ind.spotPrice - ind.vwap) / ind.vwap) * 100;

  const trendingRegime = emaGapPct > 0.08 && dayRangePct > 0.8 && vwapDistPct > 0.12;
  const rangingRegime = dayRangePct < 1.1 && emaGapPct < 0.12 && vwapDistPct < 0.22;

  if (trendingRegime) {
    const trendSignal = analyzeTripleConfluence(ind);
    if (!trendSignal) return null;
    return {
      ...trendSignal,
      confidence: Math.min(95, trendSignal.confidence + 3),
      reason: `Regime(trend): ${trendSignal.reason}`,
      riskPercent: 0.15,
    };
  }

  if (rangingRegime) {
    const rangeSignal = analyzeRSIRange(ind);
    if (!rangeSignal) return null;
    return {
      ...rangeSignal,
      confidence: Math.min(92, rangeSignal.confidence + 2),
      reason: `Regime(range): ${rangeSignal.reason}`,
      riskPercent: 0.12,
    };
  }

  return null;
}

function analyzeStrategy(strategy: StrategyKey, ind: MarketIndicators, hour: number, minute: number): StrategySignalResult | null {
  switch (strategy) {
    case "ORB": return analyzeORB(ind, hour, minute);
    case "SMTR": return analyzeSMTR(ind, hour, minute);
    case "EMA": return analyzeEMA(ind);
    case "VWAP_PULLBACK": return analyzeVWAP(ind);
    case "RSI": return analyzeRSI(ind);
    case "RSI_RANGE": return analyzeRSIRange(ind);
    case "GAP_FADE": return analyzeGapFade(ind, hour, minute);
    case "CPR": return analyzeCPR(ind);
    case "INSIDE_CANDLE": return analyzeInsideCandle(ind);
    case "VWAP_RSI": return analyzeSupertrend(ind);
    case "EMA_VWAP_RSI": return analyzeTripleConfluence(ind);
    case "MARKET_TOP": return analyzeMarketTop(ind);
    case "SCALP": return analyzeScalp(ind);
    case "EMA_PULLBACK": return analyzeEmaPullback(ind);
    case "AFTERNOON_VWAP_MOMENTUM": return analyzeAfternoonVwapMomentum(ind, hour, minute);
    case "PRO_ORB": return analyzeProORB(ind, hour, minute);
    case "VWAP_REVERSION": return analyzeVWAPReversion(ind);
    case "BREAKOUT_STRENGTH": return analyzeBreakoutStrength(ind);
    case "REGIME_BASED": return analyzeRegimeBased(ind);
    default: return null;
  }
}

function calculateLevels(entryPrice: number, riskPercent: number, strategy: StrategyKey) {
  const risk = entryPrice * riskPercent;
  const stoploss = Math.round((entryPrice - risk) * 100) / 100;

  /*let t1Multiplier = 1.25;
  let t2Multiplier = 1.3;
  let t3Multiplier = 4.5;

  if (strategy === "SCALP") {
    t1Multiplier = 1.2;
    t2Multiplier = 2.5;
    t3Multiplier = 3.5;
  } else if (strategy === "MARKET_TOP" || strategy === "RSI") {
    t1Multiplier = 2.0;
    t2Multiplier = 3.5;
    t3Multiplier = 5.0;
  } else if (strategy === "EMA_VWAP_RSI") {
    t1Multiplier = 2.0;
    t2Multiplier = 3.0;
    t3Multiplier = 4.5;
  } else if (strategy === "ORB") {
    t1Multiplier = 2.0;
    t2Multiplier = 3.5;
    t3Multiplier = 5.0;
  }
*/
let t1Multiplier = 1.25;
  let t2Multiplier = 2.0;
  let t3Multiplier = 3.0;

  if (strategy === "SCALP") {
    t1Multiplier = 1.2;
    t2Multiplier = 2.0;
    t3Multiplier = 3.0;
  } else if (strategy === "MARKET_TOP" || strategy === "RSI") {
    t1Multiplier = 1.2;
    t2Multiplier = 2.0;
    t3Multiplier = 3.0;
  } else if (strategy === "EMA_VWAP_RSI") {
    t1Multiplier = 1.2;
    t2Multiplier = 2.0;
    t3Multiplier = 3.0;
  } else if (strategy === "ORB") {
    t1Multiplier = 1.2;
    t2Multiplier = 2.0;
    t3Multiplier = 3.0;
  }
  return {
    stoploss,
    target1: Math.round((entryPrice + risk * t1Multiplier) * 100) / 100,
    target2: Math.round((entryPrice + risk * t2Multiplier) * 100) / 100,
    target3: Math.round((entryPrice + risk * t3Multiplier) * 100) / 100,
  };
}

function getConfidenceReason(strategy: StrategyKey, reason: string): string {
  return reason;
}

export async function startEngine(
  instruments: InstrumentType | InstrumentType[],
  options?: { mode?: "live" | "backtest"; startDate?: string; endDate?: string }
) {
  if (engineRunning) {
    throw new Error("Engine is already running");
  }

  const instrumentList = Array.isArray(instruments) ? instruments : [instruments];
  currentInstruments = new Set(instrumentList);
  engineRunning = true;

  const mode = options?.mode || "live";
  const instrumentLabel = instrumentList.join(", ");

  if (mode === "backtest") {
    await storage.createLog({
      level: "success",
      source: "engine",
      message: `Backtest started for ${instrumentLabel} from ${options?.startDate} to ${options?.endDate}`
    });

    // Run backtest
    try {
      if (!options?.startDate || !options?.endDate) {
        throw new Error("Start date and end date are required for backtest mode");
      }

      await startBacktest({
        instruments: instrumentList,
        startDate: options.startDate,
        endDate: options.endDate,
        capital: currentCapital,
      });
    } catch (error: any) {
      await storage.createLog({
        level: "error",
        source: "engine",
        message: `Backtest error: ${error.message}`
      });
      engineRunning = false;
      throw error;
    }

    broadcast("engine_status", { ...getEngineStatus(), mode: "backtest", startDate: options?.startDate, endDate: options?.endDate });

    // Backtest completes immediately, so set running to false
    engineRunning = false;
    return;
  } else {
    await storage.createLog({ level: "success", source: "engine", message: `Live engine started for ${instrumentLabel}` });
    broadcast("engine_status", { ...getEngineStatus(), mode: "live" });
    connectStream();
  }

  const indexTokenToInstrument: Record<string, string> = {};
  const indexExchangeTypes: Record<string, number> = {
    NIFTY: 1,
    BANKNIFTY: 1,
    SENSEX: 3,
    CRUDEOIL: 5,
    NATURALGAS: 5,
  };

  for (const inst of instrumentList) {
    const idxInfo = getExchangeForIndex(inst);
    if (idxInfo) {
      indexTokenToInstrument[idxInfo.token] = inst;
    }
  }

  setTimeout(() => {
    for (const inst of instrumentList) {
      const idxInfo = getExchangeForIndex(inst);
      if (idxInfo) {
        const exType = indexExchangeTypes[inst] || 1;
        subscribeTokenToStream(exType, idxInfo.token);
        log(`Subscribed index ${inst} token ${idxInfo.token} to tick stream for candle building`, "engine");
      }
    }
  }, 5000);

  setOnTickCallback((symbolToken: string, ltp: number) => {
    if (!engineRunning) return;

    const inst = indexTokenToInstrument[symbolToken];
    if (inst) {
      feedTickToCandles(inst, ltp);
    }

    const signalIds: string[] = [];
    signalTokenMap.forEach((token, signalId) => {
      if (token === symbolToken) {
        signalIds.push(signalId);
      }
    });

    for (const signalId of signalIds) {
      handleTickUpdate(signalId, ltp).catch((err) => {
        log(`Tick update error for ${signalId}: ${err.message}`, "engine");
      });
    }
  });

  const indicatorRefreshInterval = setInterval(() => {
    if (engineRunning && currentInstruments.size > 0) {
      Array.from(currentInstruments).forEach((inst) => {
        refreshIndicators(inst).catch((err) => {
          log(`Indicator refresh error for ${inst}: ${err.message}`, "indicators");
        });
      });
    }
  }, INDICATOR_REFRESH_MS);
  intervalIds.push(indicatorRefreshInterval);

  setTimeout(() => {
    if (engineRunning && currentInstruments.size > 0) {
      Array.from(currentInstruments).forEach((inst) => {
        refreshIndicators(inst).catch((err) => {
          log(`Initial indicator refresh error for ${inst}: ${err.message}`, "indicators");
        });
      });
    }
  }, 3000);

  const strategyCycleInterval = setInterval(() => {
    if (engineRunning && currentInstruments.size > 0) {
      Array.from(currentInstruments).forEach((inst) => {
        runAllStrategiesSequentially(inst).catch((err) => {
          log(`Strategy cycle error for ${inst}: ${err.message}`, "engine");
        });
      });
    }
  }, 15000);
  intervalIds.push(strategyCycleInterval);

  setTimeout(() => {
    if (engineRunning && currentInstruments.size > 0) {
      Array.from(currentInstruments).forEach((inst) => {
        runAllStrategiesSequentially(inst).catch((err) => {
          log(`Initial strategy cycle error for ${inst}: ${err.message}`, "engine");
        });
      });
    }
  }, 8000);

  const existingSignals = await storage.getActiveSignals();
  for (const signal of existingSignals) {
    await subscribeSignalToStream(signal);
  }

  const monitorInterval = setInterval(() => {
    if (engineRunning) {
      monitorActiveSignals().catch((err) => {
        log(`Monitor error: ${err.message}`, "engine");
      });
    }
  }, 3000);
  intervalIds.push(monitorInterval);

  scheduleDaily326Report();
  scheduleHourlyReport();
  scheduleQuarterHourlyReport();

  log(`${ACTIVE_STRATEGIES.length} indicator-based strategies initialized for ${instrumentLabel} with tick-by-tick streaming`, "engine");
}

async function sendPnlReport(reportTitle: string, emptyTitle: string) {
  try {
    const todaySignals = await storage.getTodaySignals();
    
    if (todaySignals.length === 0) {
      await sendDailyPnlSummary(emptyTitle);
      return;
    }

    const strategyPnl: Record<string, number> = {};
    let totalPnl = 0;
    const closedSignals = todaySignals.filter(s => s.status !== "active");
    const activeSignals = todaySignals.filter(s => s.status === "active");

    for (const signal of closedSignals) {
      if (!strategyPnl[signal.strategy]) {
        strategyPnl[signal.strategy] = 0;
      }
      strategyPnl[signal.strategy] += signal.pnl || 0;
      totalPnl += signal.pnl || 0;
    }

    let reportText = `${reportTitle}\n\n`;

    const sortedStrategies = Object.entries(strategyPnl).sort((a, b) => b[1] - a[1]);
    
    reportText += "📈 Strategy Breakdown:\n";
    for (const [strategy, pnl] of sortedStrategies) {
      const strategySignals = closedSignals.filter(s => s.strategy === strategy);
      const profitCount = strategySignals.filter(s => (s.pnl || 0) > 0).length;
      const lossCount = strategySignals.filter(s => (s.pnl || 0) < 0).length;
      const tag = pnl > 0 ? "✅" : pnl < 0 ? "❌" : "⚪";
      reportText += `${tag} ${strategy}: ${pnl >= 0 ? "+" : ""}₹${pnl.toFixed(2)} (${profitCount}W/${lossCount}L)\n`;
    }

    reportText += `\n💰 Active Signals: ${activeSignals.length} open\n`;
    reportText += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    reportText += `📊 TOTAL P&L: ${totalPnl >= 0 ? "+" : ""}₹${totalPnl.toFixed(2)}\n`;
    reportText += `📌 Signals Closed: ${closedSignals.length}/${todaySignals.length}\n\n`;
    reportText += `⏰ Market closes at 3:30 PM | Keep monitoring!\n#AlgoTrader #DailyReport`;

    await sendDailyPnlSummary(reportText);
    log(`Daily P&L report sent: Total ₹${totalPnl.toFixed(2)}`, "report");
  } catch (err: any) {
    log(`Daily report error: ${err.message}`, "report");
  }
}

async function sendDailyReport() {
  await sendPnlReport("[📊 DAILY P&L REPORT - 3:26 PM]", "[📊 DAILY REPORT] No signals traded today");
}

function scheduleDaily326Report() {
  setInterval(() => {
    const { hour, minute } = getISTTime();
    if (hour === 15 && minute === 26) {
      sendDailyReport().catch(err => log(`Report scheduling error: ${err.message}`, "report"));
    }
  }, 60000);
}

let lastHourlyReportKey: string | null = null;
let lastQuarterHourlyReportKey: string | null = null;

function scheduleHourlyReport() {
  setInterval(() => {
    const { hour, minute } = getISTTime();
    if (hour < 9 || (hour === 9 && minute < 15)) return;
    if (hour > 15 || (hour === 15 && minute > 31)) return;
    if (minute !== MARKET_OPEN_MINUTE) return;

    const reportKey = `${getISTDateKey()}-${hour}`;
    if (reportKey === lastHourlyReportKey) return;
    lastHourlyReportKey = reportKey;

    const timeLabel = formatISTClock(new Date());
    sendPnlReport(
      `[📊 HOURLY P&L REPORT - ${timeLabel}]`,
      "[📊 HOURLY REPORT] No signals traded yet"
    ).catch(err => log(`Hourly report error: ${err.message}`, "report"));
  }, 60000);
}

async function sendQuarterHourlyPnlReport() {
  try {
    const todaySignals = await storage.getTodaySignals();
    const timeLabel = formatISTClock(new Date());

    if (todaySignals.length === 0) {
      await sendDailyPnlSummary(`[⏱️ 15M P&L UPDATE - ${timeLabel}] No signals yet`);
      return;
    }

    const activeSignals = todaySignals.filter(s => s.status === "active");
    const totalPnl = todaySignals.reduce((sum, signal) => sum + (signal.pnl || 0), 0);
    const activePnl = activeSignals.reduce((sum, signal) => sum + (signal.pnl || 0), 0);

    let reportText = `[⏱️ 15M P&L UPDATE - ${timeLabel}]\n\n`;
    reportText += `📊 Total P&L: ${totalPnl >= 0 ? "+" : ""}₹${totalPnl.toFixed(2)}\n`;
    reportText += `💼 Active Orders: ${activeSignals.length} | Open P&L: ${activePnl >= 0 ? "+" : ""}₹${activePnl.toFixed(2)}\n`;

    if (activeSignals.length === 0) {
      reportText += `\nNo active orders right now.\n`;
    } else {
      reportText += `\nActive Order P&L:\n`;
      for (const signal of activeSignals) {
        const ltp = signal.currentPrice ?? signal.entryPrice;
        const pnlValue = signal.pnl || 0;
        const pnlSign = pnlValue >= 0 ? "+" : "";
        reportText += `- ${signal.strategy} ${signal.instrument} ${signal.strikePrice}${signal.optionType} | P&L: ${pnlSign}₹${pnlValue.toFixed(2)} | LTP: ₹${ltp.toFixed(2)}\n`;
      }
    }

    reportText += `\n#AlgoTrader #PnlUpdate`;

    await sendDailyPnlSummary(reportText);
    log(`15m P&L report sent: Total ₹${totalPnl.toFixed(2)}`, "report");
  } catch (err: any) {
    log(`15m report error: ${err.message}`, "report");
  }
}

function scheduleQuarterHourlyReport() {
  setInterval(() => {
    const { hour, minute } = getISTTime();
    if (hour < 9 || (hour === 9 && minute < 15)) return;
    if (hour > 15 || (hour === 15 && minute > 31)) return;
    if (minute % 15 !== 0) return;

    const quarterIndex = Math.floor(minute / 15);
    const reportKey = `${getISTDateKey()}-${hour}-${quarterIndex}`;
    if (reportKey === lastQuarterHourlyReportKey) return;
    lastQuarterHourlyReportKey = reportKey;

    sendQuarterHourlyPnlReport().catch(err => log(`15m report error: ${err.message}`, "report"));
  }, 60000);
}

export function getMarketAnalysis(instrument: string) {
  const indicators = indicatorCache.get(instrument);
  if (!indicators) {
    return null;
  }

  const { spotPrice, ema9, ema21, rsi14, vwap, atr14, supertrend, supertrendBullish, dayHigh, dayLow, dayOpen, recentCandles, todayCandles, momentum } = indicators;
  const candles = todayCandles.length >= 5 ? todayCandles : recentCandles;
  const candleCount = candles.length;

  let bullishScore = 0;
  let bearishScore = 0;
  let neutralCount = 0;
  const factors: { label: string; signal: "bullish" | "bearish" | "neutral"; detail: string }[] = [];
  const observations: string[] = [];

  const emaGap = ((ema9 - ema21) / ema21) * 100;
  const emaGapAbs = Math.abs(emaGap);

  let emaWidening = false;
  if (candleCount >= 6) {
    const mid = Math.floor(candleCount / 2);
    const firstHalf = candles.slice(0, mid);
    const secondHalf = candles.slice(mid);
    const firstAvg = firstHalf.reduce((s, c) => s + c.close, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((s, c) => s + c.close, 0) / secondHalf.length;
    emaWidening = Math.abs(secondAvg - firstAvg) > atr14 * 0.3;
  }

  if (ema9 > ema21) {
    if (emaGapAbs > 0.15) {
      bullishScore += 20;
      if (emaWidening) {
        factors.push({ label: "Trend Structure", signal: "bullish", detail: `EMA9/21 spread widening (${emaGapAbs.toFixed(2)}%) - trend accelerating` });
        observations.push("EMAs spreading apart, trend gaining momentum");
      } else {
        factors.push({ label: "Trend Structure", signal: "bullish", detail: `EMA9 above EMA21 by ${emaGapAbs.toFixed(2)}% - established uptrend` });
      }
    } else {
      neutralCount++;
      factors.push({ label: "Trend Structure", signal: "neutral", detail: `EMAs nearly flat (gap ${emaGapAbs.toFixed(2)}%) - no clear trend yet` });
    }
  } else {
    if (emaGapAbs > 0.15) {
      bearishScore += 20;
      if (emaWidening) {
        factors.push({ label: "Trend Structure", signal: "bearish", detail: `EMA9/21 spread widening (${emaGapAbs.toFixed(2)}%) - selling accelerating` });
        observations.push("EMAs spreading apart on downside, bears in control");
      } else {
        factors.push({ label: "Trend Structure", signal: "bearish", detail: `EMA9 below EMA21 by ${emaGapAbs.toFixed(2)}% - established downtrend` });
      }
    } else {
      neutralCount++;
      factors.push({ label: "Trend Structure", signal: "neutral", detail: `EMAs converging (gap ${emaGapAbs.toFixed(2)}%) - trend weakening or reversing` });
    }
  }

  if (rsi14 > 70) {
    bullishScore += 10;
    bearishScore += 5;
    factors.push({ label: "RSI Momentum", signal: "bullish", detail: `RSI at ${rsi14.toFixed(1)} - overbought zone, strong but watch for exhaustion` });
    observations.push(`RSI overbought at ${rsi14.toFixed(0)}, momentum could exhaust soon`);
  } else if (rsi14 > 60) {
    bullishScore += 15;
    factors.push({ label: "RSI Momentum", signal: "bullish", detail: `RSI at ${rsi14.toFixed(1)} - healthy bullish momentum with room to run` });
  } else if (rsi14 < 30) {
    bearishScore += 10;
    bullishScore += 5;
    factors.push({ label: "RSI Momentum", signal: "bearish", detail: `RSI at ${rsi14.toFixed(1)} - oversold, heavy selling but bounce possible` });
    observations.push(`RSI oversold at ${rsi14.toFixed(0)}, bottom-fishing setups may emerge`);
  } else if (rsi14 < 40) {
    bearishScore += 15;
    factors.push({ label: "RSI Momentum", signal: "bearish", detail: `RSI at ${rsi14.toFixed(1)} - bearish momentum, sellers in control` });
  } else {
    neutralCount++;
    factors.push({ label: "RSI Momentum", signal: "neutral", detail: `RSI at ${rsi14.toFixed(1)} - mid-range, no momentum edge either side` });
  }

  const vwapDist = ((spotPrice - vwap) / vwap) * 100;
  const vwapDistAbs = Math.abs(vwapDist);
  if (spotPrice > vwap) {
    if (vwapDistAbs > 0.15) {
      bullishScore += 18;
      factors.push({ label: "VWAP Position", signal: "bullish", detail: `Trading ${vwapDistAbs.toFixed(2)}% above VWAP - institutional buyers holding` });
    } else {
      neutralCount++;
      factors.push({ label: "VWAP Position", signal: "neutral", detail: `Hugging VWAP from above - undecided, waiting for push` });
      observations.push("Price stuck near VWAP, could break either way");
    }
  } else {
    if (vwapDistAbs > 0.15) {
      bearishScore += 18;
      factors.push({ label: "VWAP Position", signal: "bearish", detail: `Trading ${vwapDistAbs.toFixed(2)}% below VWAP - institutions selling` });
    } else {
      neutralCount++;
      factors.push({ label: "VWAP Position", signal: "neutral", detail: `Hugging VWAP from below - indecisive, watching for rejection or reclaim` });
      observations.push("Price stuck near VWAP, could break either way");
    }
  }

  if (supertrendBullish) {
    bullishScore += 20;
    factors.push({ label: "Supertrend", signal: "bullish", detail: `Bullish at ${supertrend.toFixed(1)} - acting as dynamic support` });
  } else {
    bearishScore += 20;
    factors.push({ label: "Supertrend", signal: "bearish", detail: `Bearish at ${supertrend.toFixed(1)} - acting as dynamic resistance` });
  }

  const range = dayHigh - dayLow;
  let positionInRange = 50;
  if (range > 0) {
    positionInRange = ((spotPrice - dayLow) / range) * 100;
    const rangeVsAtr = range / atr14;

    if (positionInRange > 80) {
      bullishScore += 12;
      factors.push({ label: "Day Structure", signal: "bullish", detail: `Near day high (${positionInRange.toFixed(0)}% range) - bulls dominating session` });
      observations.push("Price near highs, no sign of profit booking yet");
    } else if (positionInRange < 20) {
      bearishScore += 12;
      factors.push({ label: "Day Structure", signal: "bearish", detail: `Near day low (${positionInRange.toFixed(0)}% range) - bears dominating session` });
      observations.push("Price near lows, sellers not letting up");
    } else if (positionInRange >= 35 && positionInRange <= 65) {
      neutralCount++;
      factors.push({ label: "Day Structure", signal: "neutral", detail: `Mid-range (${positionInRange.toFixed(0)}%) - balanced, no side winning` });
    } else if (positionInRange > 65) {
      bullishScore += 8;
      factors.push({ label: "Day Structure", signal: "bullish", detail: `Upper half of range (${positionInRange.toFixed(0)}%) - buyers have slight edge` });
    } else {
      bearishScore += 8;
      factors.push({ label: "Day Structure", signal: "bearish", detail: `Lower half of range (${positionInRange.toFixed(0)}%) - sellers have slight edge` });
    }

    if (rangeVsAtr > 1.8) {
      observations.push(`Wide range day (${rangeVsAtr.toFixed(1)}x ATR) - high volatility, be cautious with stops`);
    } else if (rangeVsAtr < 0.6) {
      observations.push(`Narrow range (${rangeVsAtr.toFixed(1)}x ATR) - compression building, expect breakout`);
    }
  }

  const changeFromOpen = ((spotPrice - dayOpen) / dayOpen) * 100;
  if (Math.abs(changeFromOpen) > 0.3) {
    if (changeFromOpen > 0) {
      observations.push(`Up ${changeFromOpen.toFixed(2)}% from open - gap up holding or intraday rally intact`);
    } else {
      observations.push(`Down ${Math.abs(changeFromOpen).toFixed(2)}% from open - selling from open or gap down extending`);
    }
  }

  if (candleCount >= 3) {
    let greenAll = 0, redAll = 0;
    for (const c of candles) {
      if (c.close > c.open) greenAll++;
      else if (c.close < c.open) redAll++;
    }
    const greenPct = Math.round((greenAll / candleCount) * 100);
    const redPct = Math.round((redAll / candleCount) * 100);

    let higherHighs = 0, lowerLows = 0;
    for (let i = 1; i < candles.length; i++) {
      if (candles[i].high > candles[i - 1].high) higherHighs++;
      if (candles[i].low < candles[i - 1].low) lowerLows++;
    }
    const hhRatio = candles.length > 1 ? higherHighs / (candles.length - 1) : 0.5;
    const llRatio = candles.length > 1 ? lowerLows / (candles.length - 1) : 0.5;

    if (hhRatio > 0.6 && greenPct > 55) {
      bullishScore += 15;
      factors.push({ label: "Price Action", signal: "bullish", detail: `HH pattern today (${higherHighs}/${candles.length - 1}), ${greenPct}% green candles across ${candleCount} bars - sustained buying` });
    } else if (llRatio > 0.6 && redPct > 55) {
      bearishScore += 15;
      factors.push({ label: "Price Action", signal: "bearish", detail: `LL pattern today (${lowerLows}/${candles.length - 1}), ${redPct}% red candles across ${candleCount} bars - sustained selling` });
    } else if (hhRatio > 0.55) {
      bullishScore += 8;
      factors.push({ label: "Price Action", signal: "bullish", detail: `Mild HH trend today (${higherHighs}/${candles.length - 1}) across ${candleCount} bars - buyers slightly dominant` });
    } else if (llRatio > 0.55) {
      bearishScore += 8;
      factors.push({ label: "Price Action", signal: "bearish", detail: `Mild LL trend today (${lowerLows}/${candles.length - 1}) across ${candleCount} bars - sellers slightly dominant` });
    } else {
      neutralCount++;
      factors.push({ label: "Price Action", signal: "neutral", detail: `No clear HH/LL across ${candleCount} bars today - choppy, range-bound session` });
    }

    if (candleCount >= 6) {
      const thirdLen = Math.floor(candleCount / 3);
      const firstThird = candles.slice(0, thirdLen);
      const lastThird = candles.slice(-thirdLen);
      const firstAvgBody = firstThird.reduce((s, c) => s + Math.abs(c.close - c.open), 0) / firstThird.length;
      const lastAvgBody = lastThird.reduce((s, c) => s + Math.abs(c.close - c.open), 0) / lastThird.length;

      const firstGreen = firstThird.filter(c => c.close > c.open).length;
      const lastGreen = lastThird.filter(c => c.close > c.open).length;
      const firstGreenPct = Math.round((firstGreen / firstThird.length) * 100);
      const lastGreenPct = Math.round((lastGreen / lastThird.length) * 100);

      if (firstGreenPct < 40 && lastGreenPct > 60) {
        observations.push(`Session reversal: started weak (${firstGreenPct}% green) now turning bullish (${lastGreenPct}% green)`);
      } else if (firstGreenPct > 60 && lastGreenPct < 40) {
        observations.push(`Session reversal: started strong (${firstGreenPct}% green) now fading (${lastGreenPct}% green)`);
      }

      if (lastAvgBody > firstAvgBody * 1.5) {
        observations.push("Candle bodies expanding into close - momentum building, move may extend");
      } else if (lastAvgBody < firstAvgBody * 0.5) {
        observations.push("Candle bodies shrinking - momentum fading from morning, consolidation likely");
      }
    }

    const last5 = candles.slice(-5);
    let totalWickSize = 0, totalBodySize = 0;
    for (const c of last5) {
      const body = Math.abs(c.close - c.open);
      const wick = (c.high - c.low) - body;
      totalBodySize += body;
      totalWickSize += wick;
    }
    const wickBodyRatio = totalBodySize > 0 ? totalWickSize / totalBodySize : 0;
    if (wickBodyRatio > 2) {
      observations.push("Long wicks on recent candles - indecision, both sides getting rejected");
    }

    const recentGreen = last5.filter(c => c.close > c.open).length;
    if (recentGreen >= 4) {
      bullishScore += 5;
    } else if (recentGreen <= 1) {
      bearishScore += 5;
    }
  }

  let keyLevelNote = "";
  if (range > 0 && positionInRange > 90) {
    keyLevelNote = `Testing day high ${dayHigh.toFixed(0)} - breakout above opens fresh upside`;
  } else if (range > 0 && positionInRange < 10) {
    keyLevelNote = `Testing day low ${dayLow.toFixed(0)} - breakdown opens more downside`;
  } else if (vwapDistAbs < 0.05) {
    keyLevelNote = `At VWAP (${vwap.toFixed(0)}) - key decision point, direction from here matters`;
  } else if (Math.abs(spotPrice - supertrend) / spotPrice * 100 < 0.1) {
    keyLevelNote = `Testing Supertrend (${supertrend.toFixed(0)}) - trend continuation or flip imminent`;
  }
  if (keyLevelNote) {
    observations.push(keyLevelNote);
  }

  const totalFactors = factors.length;
  const directionalFactors = totalFactors - neutralCount;

  const totalScore = bullishScore + bearishScore;
  let bullishPct: number;
  let bearishPct: number;

  if (totalScore === 0) {
    bullishPct = 50;
    bearishPct = 50;
  } else if (neutralCount > directionalFactors) {
    const neutralWeight = neutralCount * 10;
    const adjustedTotal = totalScore + neutralWeight;
    const rawBull = Math.round(((bullishScore + neutralWeight / 2) / adjustedTotal) * 100);
    bullishPct = Math.max(15, Math.min(85, rawBull));
    bearishPct = 100 - bullishPct;
  } else {
    bullishPct = Math.round((bullishScore / totalScore) * 100);
    bearishPct = 100 - bullishPct;
  }

  let trend: "Uptrend" | "Downtrend" | "Sideways";
  let trendStrength: "Strong" | "Moderate" | "Weak";
  let probability: number;

  const diff = Math.abs(bullishPct - bearishPct);
  const mostlyNeutral = neutralCount >= Math.ceil(totalFactors * 0.6);

  if (mostlyNeutral || diff < 15 || directionalFactors <= 1) {
    trend = "Sideways";
    if (directionalFactors === 0) {
      trendStrength = "Weak";
      probability = 50;
      observations.push("No indicator showing clear direction - pure consolidation phase");
    } else {
      trendStrength = diff < 8 ? "Weak" : "Moderate";
      probability = 50 + Math.round(diff / 4);
    }
  } else if (diff < 30) {
    trend = bullishPct > bearishPct ? "Uptrend" : "Downtrend";
    trendStrength = "Moderate";
    probability = 55 + Math.round(diff / 3);
  } else if (diff < 50) {
    trend = bullishPct > bearishPct ? "Uptrend" : "Downtrend";
    trendStrength = "Strong";
    probability = Math.min(85, 60 + Math.round(diff / 3));
  } else {
    trend = bullishPct > bearishPct ? "Uptrend" : "Downtrend";
    trendStrength = "Strong";
    probability = Math.min(92, 68 + Math.round(diff / 4));
  }

  let headline: string;
  if (trend === "Uptrend") {
    if (trendStrength === "Strong") {
      headline = `${instrument} in strong uptrend - buyers in control across multiple indicators`;
    } else {
      headline = `${instrument} tilting bullish but conviction is moderate - needs confirmation`;
    }
  } else if (trend === "Downtrend") {
    if (trendStrength === "Strong") {
      headline = `${instrument} under heavy selling pressure - bears dominating price action`;
    } else {
      headline = `${instrument} showing weakness but not a clear breakdown yet - wait and watch`;
    }
  } else {
    if (neutralCount >= totalFactors - 1) {
      headline = `${instrument} in dead zone - all indicators flat, no trade-worthy setup visible`;
    } else {
      headline = `${instrument} rangebound with mixed signals - avoid forcing trades, wait for alignment`;
    }
  }

  let summary: string;
  const summaryParts: string[] = [];

  const sessionInfo = `Analyzing ${candleCount} candles from today's open`;

  if (mostlyNeutral) {
    summaryParts.push(`${sessionInfo}. ${neutralCount} of ${totalFactors} indicators showing no clear direction - market is indecisive`);
  } else if (supertrendBullish && ema9 > ema21 && spotPrice > vwap) {
    summaryParts.push(`${sessionInfo}. All major indicators aligned bullish (Supertrend, EMA, VWAP)`);
  } else if (!supertrendBullish && ema9 < ema21 && spotPrice < vwap) {
    summaryParts.push(`${sessionInfo}. All major indicators aligned bearish (Supertrend, EMA, VWAP)`);
  } else {
    const bullishFactors = factors.filter(f => f.signal === "bullish").map(f => f.label);
    const bearishFactors = factors.filter(f => f.signal === "bearish").map(f => f.label);
    if (bullishFactors.length > 0 && bearishFactors.length > 0) {
      summaryParts.push(`${sessionInfo}. Mixed signals: ${bullishFactors.join(", ")} bullish vs ${bearishFactors.join(", ")} bearish`);
    } else if (bullishFactors.length > 0) {
      summaryParts.push(`${sessionInfo}. ${bullishFactors.join(", ")} leaning bullish, rest neutral`);
    } else if (bearishFactors.length > 0) {
      summaryParts.push(`${sessionInfo}. ${bearishFactors.join(", ")} leaning bearish, rest neutral`);
    }
  }

  if (rsi14 > 65) {
    summaryParts.push(`RSI elevated at ${rsi14.toFixed(0)}, momentum strong but overbought risk present`);
  } else if (rsi14 < 35) {
    summaryParts.push(`RSI depressed at ${rsi14.toFixed(0)}, selling heavy but oversold bounce possible`);
  } else {
    summaryParts.push(`RSI at ${rsi14.toFixed(0)} in neutral zone, no momentum edge`);
  }

  if (observations.length > 0) {
    summaryParts.push(observations[0]);
  }

  summary = summaryParts.join(". ") + ".";

  return {
    instrument,
    trend,
    trendStrength,
    probability,
    bullishPct,
    bearishPct,
    headline,
    summary,
    observations,
    factors,
    spotPrice,
    dayHigh,
    dayLow,
    dayOpen,
    atr: atr14,
    candlesAnalyzed: candleCount,
    changeFromOpen: ((spotPrice - dayOpen) / dayOpen) * 100,
    updatedAt: new Date(indicators.lastUpdated).toISOString(),
  };
}

let vixCache: { value: number; open: number; prevClose: number; updatedAt: number } | null = null;

async function fetchIndiaVIX(): Promise<{ value: number; open: number; prevClose: number } | null> {
  if (vixCache && Date.now() - vixCache.updatedAt < 30000) {
    return { value: vixCache.value, open: vixCache.open, prevClose: vixCache.prevClose };
  }
  try {
    const liveVix = getLivePrice("99926017");
    if (liveVix && liveVix > 0) {
      const prev = vixCache?.prevClose || liveVix;
      const openVal = vixCache?.open || liveVix;
      vixCache = { value: liveVix, open: openVal, prevClose: prev, updatedAt: Date.now() };
      return { value: liveVix, open: openVal, prevClose: prev };
    }

    const data = await getLTP("NSE", "India VIX", "99926017");
    if (data && data > 0) {
      vixCache = { value: data, open: data, prevClose: data, updatedAt: Date.now() };
      return { value: data, open: data, prevClose: data };
    }
  } catch (err: any) {
    log(`VIX fetch error: ${err.message}`, "indicators");
  }
  return vixCache ? { value: vixCache.value, open: vixCache.open, prevClose: vixCache.prevClose } : null;
}

export async function getMarketRegime(instrument: string) {
  const indicators = indicatorCache.get(instrument);
  if (!indicators) return null;

  const { spotPrice, vwap, atr14, dayHigh, dayLow, dayOpen, todayCandles, recentCandles, supertrendBullish } = indicators;
  const candles = todayCandles.length >= 5 ? todayCandles : recentCandles;
  const candleCount = candles.length;
  if (candleCount < 3) return null;

  const closes = candles.map(c => c.close);

  const adx14 = calculateADX(candles, 14);

  const currentATR = calculateATR(candles, 14);
  let atr5DayAvg = currentATR;
  if (candleCount > 30) {
    const olderCandles = candles.slice(0, Math.max(candleCount - 30, 14));
    atr5DayAvg = calculateATR(olderCandles, 14);
  }
  const atrRatio = atr5DayAvg > 0 ? currentATR / atr5DayAvg : 1;
  const atrRising = atrRatio > 1.2;

  const first30MinCandles = candles.filter((_, i) => i < 6);
  let openingRangeHigh = dayOpen;
  let openingRangeLow = dayOpen;
  if (first30MinCandles.length > 0) {
    openingRangeHigh = Math.max(...first30MinCandles.map(c => c.high));
    openingRangeLow = Math.min(...first30MinCandles.map(c => c.low));
  }
  const openingRangePct = spotPrice > 0 ? ((openingRangeHigh - openingRangeLow) / spotPrice) * 100 : 0;

  const vixData = await fetchIndiaVIX();
  const vixValue = vixData?.value || 0;
  const vixRising = vixData ? vixData.value > vixData.open : false;

  const priceAboveVwap = spotPrice > vwap;

  let higherHighs = 0, lowerLows = 0;
  let vwapCrosses = 0;
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].high > candles[i - 1].high) higherHighs++;
    if (candles[i].low < candles[i - 1].low) lowerLows++;
    const prevAbove = candles[i - 1].close > vwap;
    const currAbove = candles[i].close > vwap;
    if (prevAbove !== currAbove) vwapCrosses++;
  }
  const hhStructure = candleCount > 1 ? higherHighs / (candleCount - 1) > 0.55 : false;
  const llStructure = candleCount > 1 ? lowerLows / (candleCount - 1) > 0.55 : false;

  let score = 0;
  const filters: { label: string; met: boolean; score: number; detail: string }[] = [];

  if (atrRising) {
    score += 20;
    filters.push({ label: "ATR Expansion", met: true, score: 20, detail: `ATR ${atrRatio.toFixed(2)}x vs baseline - volatility expanding` });
  } else {
    filters.push({ label: "ATR Expansion", met: false, score: 0, detail: `ATR ${atrRatio.toFixed(2)}x vs baseline - volatility contracting` });
  }

  if (adx14 > 25) {
    score += 25;
    filters.push({ label: "ADX Trend Strength", met: true, score: 25, detail: `ADX at ${adx14.toFixed(1)} - strong trending market` });
  } else if (adx14 > 22) {
    score += 15;
    filters.push({ label: "ADX Trend Strength", met: true, score: 15, detail: `ADX at ${adx14.toFixed(1)} - moderate trend present` });
  } else {
    filters.push({ label: "ADX Trend Strength", met: false, score: 0, detail: `ADX at ${adx14.toFixed(1)} - weak/no trend, range-bound` });
  }

  if (vixValue > 12 && vixRising) {
    score += 15;
    filters.push({ label: "VIX Signal", met: true, score: 15, detail: `VIX at ${vixValue.toFixed(2)} and rising - fear increasing, expect bigger moves` });
  } else if (vixValue > 12) {
    score += 8;
    filters.push({ label: "VIX Signal", met: true, score: 8, detail: `VIX at ${vixValue.toFixed(2)} elevated but stable - moderate volatility` });
  } else if (vixValue > 0) {
    filters.push({ label: "VIX Signal", met: false, score: 0, detail: `VIX at ${vixValue.toFixed(2)} - low fear, tight ranges expected` });
  } else {
    filters.push({ label: "VIX Signal", met: false, score: 0, detail: `VIX data unavailable` });
  }

  if (openingRangePct > 0.5) {
    score += 20;
    filters.push({ label: "Opening Range", met: true, score: 20, detail: `First 30-min range ${openingRangePct.toFixed(2)}% (${(openingRangeHigh - openingRangeLow).toFixed(1)} pts) - strong expansion` });
  } else if (openingRangePct > 0.4) {
    score += 12;
    filters.push({ label: "Opening Range", met: true, score: 12, detail: `First 30-min range ${openingRangePct.toFixed(2)}% - moderate expansion` });
  } else {
    filters.push({ label: "Opening Range", met: false, score: 0, detail: `First 30-min range ${openingRangePct.toFixed(2)}% - narrow, no conviction` });
  }

  if (priceAboveVwap) {
    score += 10;
    filters.push({ label: "VWAP Position", met: true, score: 10, detail: `Price above VWAP (${vwap.toFixed(1)}) - institutional buyers holding` });
  } else {
    filters.push({ label: "VWAP Position", met: false, score: 0, detail: `Price below VWAP (${vwap.toFixed(1)}) - institutional selling pressure` });
  }

  if (hhStructure && priceAboveVwap) {
    score += 10;
    filters.push({ label: "Price Structure", met: true, score: 10, detail: `Higher High pattern (${higherHighs}/${candleCount - 1}) above VWAP - bullish structure` });
  } else if (llStructure && !priceAboveVwap) {
    score += 10;
    filters.push({ label: "Price Structure", met: true, score: 10, detail: `Lower Low pattern (${lowerLows}/${candleCount - 1}) below VWAP - bearish structure` });
  } else if (vwapCrosses > candleCount * 0.3) {
    filters.push({ label: "Price Structure", met: false, score: 0, detail: `${vwapCrosses} VWAP crosses in ${candleCount} candles - choppy, no structure` });
  } else {
    filters.push({ label: "Price Structure", met: false, score: 0, detail: `No clear HH/LL structure - indecisive price action` });
  }

  let marketType: string;
  let confidence: "High" | "Medium" | "Low";
  let tradeDirection: "CE" | "PE" | "Avoid";
  let action: string;

  const isSideways = adx14 < 18 || !atrRising || (vixValue > 0 && vixValue < 11) || openingRangePct < 0.3 || vwapCrosses > candleCount * 0.3;

  if (isSideways && score < 60) {
    marketType = "SIDEWAYS";
    confidence = "Low";
    tradeDirection = "Avoid";
    action = "NO TRADE - Market is range-bound, avoid option buying";
  } else if (score >= 75) {
    confidence = "High";
    if (priceAboveVwap && (hhStructure || supertrendBullish)) {
      marketType = "STRONG UPTREND";
      tradeDirection = "CE";
      action = "Buy ATM CE - Strong bullish momentum across all filters";
    } else if (!priceAboveVwap && (llStructure || !supertrendBullish)) {
      marketType = "STRONG DOWNTREND";
      tradeDirection = "PE";
      action = "Buy ATM PE - Strong bearish momentum across all filters";
    } else {
      marketType = priceAboveVwap ? "UPTREND" : "DOWNTREND";
      tradeDirection = priceAboveVwap ? "CE" : "PE";
      action = `Buy ATM ${tradeDirection} - Trend confirmed with high score`;
    }
  } else if (score >= 60) {
    confidence = "Medium";
    if (priceAboveVwap) {
      marketType = "MODERATE UPTREND";
      tradeDirection = "CE";
      action = "CE with caution - Some filters aligned, manage risk tightly";
    } else {
      marketType = "MODERATE DOWNTREND";
      tradeDirection = "PE";
      action = "PE with caution - Some filters aligned, manage risk tightly";
    }
  } else {
    marketType = "SIDEWAYS";
    confidence = "Low";
    tradeDirection = "Avoid";
    action = "NO TRADE - Insufficient filter alignment, stay on sideline";
  }

  const range = dayHigh - dayLow;
  let suggestedSL = 0;
  let suggestedTarget = 0;
  if (tradeDirection !== "Avoid" && currentATR > 0) {
    suggestedSL = Math.round(currentATR * 1.5 * 100) / 100;
    suggestedTarget = Math.round(suggestedSL * 2 * 100) / 100;
  }

  return {
    instrument,
    marketType,
    confidence,
    score,
    maxScore: 100,
    tradeDirection,
    action,
    suggestedSL,
    suggestedTarget,
    filters,
    spotPrice,
    vwap: Math.round(vwap * 100) / 100,
    atr: currentATR,
    adx: adx14,
    vix: vixValue,
    openingRange: Math.round(openingRangePct * 100) / 100,
    dayHigh,
    dayLow,
    candlesAnalyzed: candleCount,
    updatedAt: new Date(indicators.lastUpdated).toISOString(),
  };
}

export async function trackSignalClose(strategy: string, status: string) {
  const isWin = status === "target1_hit" || status === "target2_hit" || status === "target3_hit";
  await trackStrategyResult(strategy, isWin);
}

export async function stopEngine() {
  engineRunning = false;
  currentInstruments.clear();
  intervalIds.forEach(clearInterval);
  intervalIds = [];
  signalTokenMap.clear();
  strategyCooldown.clear();
  strategyConsecutiveLosses.clear();
  strategyDisabledUntil.clear();
  indicatorCache.clear();

  disconnectStream();

  await storage.createLog({ level: "info", source: "engine", message: "Engine stopped" });
  broadcast("engine_status", getEngineStatus());
}

function getStrategyInterval(strategy: StrategyKey): number {
  const intervals: Record<string, number> = {
    ORB: 60000,
    SMTR: 60000,
    EMA: 60000,
    VWAP_PULLBACK: 60000,
    RSI: 45000,
    VWAP_RSI: 60000,
    EMA_VWAP_RSI: 60000,
    MARKET_TOP: 45000,
    SCALP: 30000,
  };
  return intervals[strategy] || 60000;
}

async function subscribeSignalToStream(signal: { id: string; instrument: string; strikePrice: number; optionType: string }) {
  if (!isOptionType(signal.optionType)) {
    return;
  }

  const expiry = await resolveTradingExpiry(signal.instrument);
  const realLTP = await getOptionLTP(signal.instrument, signal.strikePrice, signal.optionType, expiry);
  if (realLTP !== null) {
    const cacheKey = `${signal.instrument}_${signal.strikePrice}_${signal.optionType}`;
    const tokenInfo = getSymbolTokenFromCache(cacheKey);
    if (tokenInfo) {
      let exchangeType = 2;
      if (signal.instrument === "SENSEX") exchangeType = 4;
      else if (isMCXInstrument(signal.instrument)) exchangeType = 5;
      subscribeTokenToStream(exchangeType, tokenInfo.token);
      signalTokenMap.set(signal.id, tokenInfo.token);
      log(`Subscribed signal ${signal.id} to tick stream`, "engine");
    }
  }
}

const tickThrottleMap: Map<string, number> = new Map();

async function handleTickUpdate(signalId: string, ltp: number) {
  const now = Date.now();
  const lastTick = tickThrottleMap.get(signalId) || 0;
  if (now - lastTick < 200) return;
  tickThrottleMap.set(signalId, now);

  const signal = await storage.getSignal(signalId);
  if (!signal || signal.status !== "active") return;

  const pointsPnl = Math.round((ltp - signal.entryPrice) * 100) / 100;
  const lotSize = getLotSize(signal.instrument);
  const moneyPnl = Math.round(pointsPnl * lotSize * 100) / 100;

  broadcast("price_update", { id: signalId, currentPrice: ltp, pnl: moneyPnl });
}

let lastSignalTime: number = 0;
const MIN_SIGNAL_GAP_MS = 60000;
let runningStrategyCycle = false;

async function runAllStrategiesSequentially(instrument: InstrumentType) {
  if (runningStrategyCycle) return;
  runningStrategyCycle = true;

  try {
    const { hour, minute, isMarketHours } = getISTTime();
    if (!isMarketHours) return;

    if (Date.now() - lastSignalTime < MIN_SIGNAL_GAP_MS) return;

    const activeSignals = await storage.getActiveSignals();
    const indicators = await getIndicators(instrument);
    if (!indicators) return;

    if (process.env.DEBUG_EXPIRY === "1") {
      const cycleExpiry = await resolveTradingExpiry(instrument);
      const cycleExpiryLabel = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(cycleExpiry);
      log(`Resolved expiry for ${instrument}: ${cycleExpiryLabel}`, "engine");
    }

    const activeStrategies = new Set(activeSignals.map(s => s.strategy));
    const shuffled = [...ACTIVE_STRATEGIES].sort(() => Math.random() - 0.5);

    for (const strategy of shuffled) {
      if (activeStrategies.has(strategy)) continue;
      if (isOnCooldown(strategy)) continue;
      if (isStrategyDisabled(strategy)) continue; // Circuit breaker check
      if (!isStrategyWithinConfiguredWindow(strategy, hour, minute)) continue;

      const result = analyzeStrategy(strategy, indicators, hour, minute);
      if (!result) continue;

      if (result.confidence < 80) continue;

      await createSignalFromResult(strategy, instrument, result, indicators);
      lastSignalTime = Date.now();
      break;
    }
  } catch (err: any) {
    log(`Strategy cycle error: ${err.message}`, "engine");
  } finally {
    runningStrategyCycle = false;
  }
}

async function createSignalFromResult(
  strategy: StrategyKey,
  instrument: InstrumentType,
  result: StrategySignalResult,
  indicators: MarketIndicators,
) {
  try {
    const expiry = await resolveTradingExpiry(instrument);
    const strikeDiff = STRIKE_STEPS[instrument] || 50;
    const atmStrike = Math.round(indicators.spotPrice / strikeDiff) * strikeDiff;

    const activeSignals = await storage.getActiveSignals();
    const strategyActiveSignal = activeSignals.find((s) => s.strategy === strategy);
    if (strategyActiveSignal) {
      log(`Strategy ${strategy} already has an active signal (${strategyActiveSignal.productType || "INT"}), skipping`, "engine");
      return;
    }

    const baseOffsets = result.direction === "CE"
      ? [0, -1, -2, -3, -4, -5, -6]
      : [0, 1, 2, 3, 4, 5, 6];

    const preferredOffset = result.strikeOffset ?? 0;
    const itmOffsets = preferredOffset !== 0 && baseOffsets.includes(preferredOffset)
      ? [preferredOffset, ...baseOffsets.filter((o) => o !== preferredOffset)]
      : baseOffsets;

    let strikePrice: number | null = null;
    let realLTP: number | null = null;
    let productType: ProductType | null = null;

    for (const offset of itmOffsets) {
      const candidateStrike = atmStrike + offset * strikeDiff;

      const allocation = resolveStrikeProductAllocation(
        instrument,
        candidateStrike,
        result.direction,
        activeSignals,
      );

      if (allocation.blocked) {
        const itmLabel = offset === 0 ? "ATM" : `ITM${Math.abs(offset)}`;
        log(
          `Strike/product blocked: ${itmLabel} ${candidateStrike} ${result.direction} - ${allocation.reason || "not available"}; shifting to next ITM`,
          strategy,
        );
        continue;
      }

      const { hour, minute } = getISTTime();
      if (!allocation.productType || !isProductTypeEntryAllowed(allocation.productType, hour, minute)) {
        log(
          `Entry blocked for ${strategy} ${instrument} ${candidateStrike} ${result.direction} (${allocation.productType || "N/A"}) at ${hour}:${String(minute).padStart(2, "0")}`,
          "engine",
        );
        continue;
      }

      const ltp = await getOptionLTP(instrument, candidateStrike, result.direction, expiry);
      if (!ltp || ltp <= 0) continue;
      if (ltp < 30 || ltp > 1500) continue;

      strikePrice = candidateStrike;
      realLTP = ltp;
      productType = allocation.productType;
      const itmLabel = offset === 0 ? "ATM" : `ITM${Math.abs(offset)}`;
      log(`Selected ${itmLabel} strike ${candidateStrike} ${result.direction} ${productType} @ ₹${ltp}`, strategy);
      break;
    }

    if (!strikePrice || !realLTP || !productType) {
      log(`No valid ITM strike found for ${instrument} ${result.direction}, skipping signal`, strategy);
      return;
    }

    const levels = calculateLevels(realLTP, result.riskPercent, strategy);

    const signal: InsertSignal = {
      strategy,
      instrument,
      optionType: result.direction,
      productType,
      strikePrice,
      entryPrice: realLTP,
      target1: levels.target1,
      target2: levels.target2,
      target3: levels.target3,
      stoploss: levels.stoploss,
      confidence: result.confidence,
      confidenceReason: result.reason,
      status: "active",
      telegramSent: true,
      currentPrice: realLTP,
      pnl: 0,
      exitPrice: null,
      exitReason: null,
    };

    const created = await storage.createSignal(signal);
    strategyCooldown.set(strategy, Date.now());

    await subscribeSignalToStream({
      id: created.id,
      instrument: created.instrument,
      strikePrice: created.strikePrice,
      optionType: created.optionType,
    });

    const formatTime = (date: Date) => {
      let hours = date.getUTCHours();
      const minutes = String(date.getUTCMinutes()).padStart(2, '0');
      const seconds = String(date.getUTCSeconds()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      return `${String(hours).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`;
    };

    await storage.createLog({
      level: "success",
      source: strategy,
      message: `Entry: ${instrument} ${strikePrice} ${result.direction} @ ₹${realLTP} @ ${formatTime(new Date())} | SL: ₹${levels.stoploss} | T1: ₹${levels.target1} | Conf: ${result.confidence}%`,
      data: JSON.stringify({ confidence: result.confidence, reason: result.reason }),
    });

    await sendEntrySignal({
      strategy,
      instrument,
      strike: strikePrice,
      optionType: result.direction,
      productType,
      entry: realLTP,
      target1: levels.target1,
      target2: levels.target2,
      target3: levels.target3,
      stoploss: levels.stoploss,
      confidence: result.confidence,
      entryTime: new Date(),
    });

    broadcast("signal_update", created);
  } catch (err: any) {
    await storage.createLog({
      level: "error",
      source: strategy,
      message: `Strategy error: ${err.message}`,
    });
  }
}

const trailingSLMap: Map<string, number> = new Map();

async function monitorActiveSignals() {
  const activeSignals = await storage.getActiveSignals();

  for (const signal of activeSignals) {

    const symbolToken = signalTokenMap.get(signal.id);
    let newPrice: number;

    if (symbolToken) {
      const livePrice = getLivePrice(symbolToken);
      if (livePrice !== null && livePrice > 0) {
        newPrice = livePrice;
      } else {
        newPrice = signal.currentPrice ?? signal.entryPrice;
      }
    } else {
      try {
        if (!isOptionType(signal.optionType)) {
          newPrice = signal.currentPrice ?? signal.entryPrice;
          continue;
        }

        const expiry = await resolveTradingExpiry(signal.instrument);
        const realLTP = await getOptionLTP(signal.instrument, signal.strikePrice, signal.optionType, expiry);
        if (realLTP !== null && realLTP > 0) {
          newPrice = realLTP;
          await subscribeSignalToStream(signal);
        } else {
          newPrice = signal.currentPrice ?? signal.entryPrice;
        }
      } catch {
        newPrice = signal.currentPrice ?? signal.entryPrice;
      }
    }

    const lotSize = getLotSize(signal.instrument);
    const pointsPnl = Math.round((newPrice - signal.entryPrice) * 100) / 100;
    const moneyPnl = Math.round(pointsPnl * lotSize * 100) / 100;

    let effectiveSL = signal.stoploss;
    const currentTrailSL = trailingSLMap.get(signal.id);
    if (currentTrailSL && currentTrailSL > effectiveSL) {
      effectiveSL = currentTrailSL;
    }

    const entryToT1 = signal.target1 ? signal.target1 - signal.entryPrice : signal.entryPrice * 0.05;
    const profitFromEntry = newPrice - signal.entryPrice;

    if (signal.target1 && newPrice >= signal.target1) {
      const newTrailSL = Math.round((signal.entryPrice + (signal.target1 - signal.entryPrice) * 0.6) * 100) / 100;
      if (newTrailSL > effectiveSL) {
        trailingSLMap.set(signal.id, newTrailSL);
        effectiveSL = newTrailSL;
      }
    } else if (profitFromEntry > 0 && entryToT1 > 0 && profitFromEntry / entryToT1 >= 0.7) {
      const newTrailSL = Math.round((signal.entryPrice + profitFromEntry * 0.15) * 100) / 100;
      if (newTrailSL > effectiveSL) {
        trailingSLMap.set(signal.id, newTrailSL);
        effectiveSL = newTrailSL;
      }
    }

    let newStatus = signal.status;
    let exitReason: string | null = null;
    let exitPrice: number | null = null;

    const { hour, minute } = getISTTime();
    const forcedExitReason = getForcedExitReason(signal.productType, hour, minute);
    if (forcedExitReason) {
      newStatus = "expired";
      exitPrice = newPrice;
      exitReason = forcedExitReason;
    } else if (newPrice >= signal.target1 && signal.target3 && newPrice >= signal.target3) {
      newStatus = "target3_hit";
      exitPrice = signal.target3;
      exitReason = "Target 3 reached";
    } else if (newPrice >= signal.target1 && signal.target2 && newPrice >= signal.target2) {
      newStatus = "target2_hit";
      exitPrice = signal.target2;
      exitReason = "Target 2 reached";
    } else if (newPrice >= signal.target1) {
      newStatus = "target1_hit";
      exitPrice = signal.target1;
      exitReason = "Target 1 reached";
    } else if (newPrice <= effectiveSL) {
      newStatus = "sl_hit";
      exitPrice = effectiveSL;
      if (effectiveSL > signal.stoploss) {
        exitReason = `Trailing SL hit (moved from ₹${signal.stoploss} to ₹${effectiveSL})`;
      } else {
        exitReason = "Stoploss triggered";
      }
    }

    const finalPointsPnl = exitPrice ? Math.round((exitPrice - signal.entryPrice) * 100) / 100 : pointsPnl;
    const finalMoneyPnl = Math.round(finalPointsPnl * lotSize * 100) / 100;

    await storage.updateSignal(signal.id, {
      currentPrice: exitPrice || newPrice,
      pnl: finalMoneyPnl,
      status: newStatus as any,
      exitPrice: exitPrice,
      exitReason: exitReason,
      closedTime: newStatus !== "active" ? new Date() : undefined,
    });

    if (newStatus !== "active" && newStatus !== signal.status) {
      signalTokenMap.delete(signal.id);
      tickThrottleMap.delete(signal.id);
      trailingSLMap.delete(signal.id);

      await sendExitSignal({
        strategy: signal.strategy,
        instrument: signal.instrument,
        strike: signal.strikePrice,
        optionType: signal.optionType,
        productType: signal.productType,
        exitPrice: exitPrice!,
        exitReason: exitReason!,
        pnl: finalMoneyPnl,
        lotSize,
        entryTime: signal.createdAt,
        exitTime: new Date(),
        entryPrice: signal.entryPrice,
      });

      const formatTime = (date: Date) => {
        let hours = date.getUTCHours();
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        const seconds = String(date.getUTCSeconds()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        return `${String(hours).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`;
      };
      const entryTimeStr = formatTime(new Date(signal.createdAt));
      const exitTimeStr = formatTime(new Date());
      const durationMs = Date.now() - new Date(signal.createdAt).getTime();
      const durationSeconds = Math.round(durationMs / 1000);
      const durationMinutes = Math.floor(durationSeconds / 60);
      const durationSecs = durationSeconds % 60;
      const durationStr = durationMinutes > 0 ? `${durationMinutes}m ${durationSecs}s` : `${durationSecs}s`;

      await storage.createLog({
        level: finalMoneyPnl >= 0 ? "success" : "warn",
        source: signal.strategy,
        message: `${exitReason}: ${signal.instrument} ${signal.strikePrice} ${signal.optionType} | Entry: ₹${signal.entryPrice} @ ${entryTimeStr} | Exit: ₹${exitPrice} @ ${exitTimeStr} | Duration: ${durationStr} | P&L: ${finalMoneyPnl >= 0 ? "+" : ""}₹${finalMoneyPnl}`,
      });

      broadcast("signal_update", { id: signal.id, status: newStatus, pnl: finalMoneyPnl });
    } else {
      broadcast("price_update", { id: signal.id, currentPrice: newPrice, pnl: moneyPnl });
    }
  }
}
