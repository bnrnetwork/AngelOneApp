import { createHmac } from "crypto";
import smartapiPkg from "smartapi-javascript";
import { LOT_SIZES } from "@shared/schema";

const { SmartAPI } = smartapiPkg as any;

type OptionType = "CE" | "PE";

interface TokenInfo {
  token: string;
  symbol: string;
  exchange: string;
  instrument: string;
  strike: number;
  optionType: OptionType;
}

interface IndexInfo {
  exchange: string;
  token: string;
}

interface OptionChainStrike {
  strike: number;
  ceLTP: number | null;
  peLTP: number | null;
  ceToken: string | null;
  peToken: string | null;
}

interface OptionChainWithOIStrike {
  strike: number;
  ceLTP: number | null;
  peLTP: number | null;
  ceOI: number;
  peOI: number;
  ceVolume: number;
  peVolume: number;
}

interface OptionChainData {
  spotPrice: number;
  atmStrike: number;
  expiry: string;
  strikes: OptionChainStrike[];
}

interface OptionChainWithOIData {
  spotPrice: number;
  atmStrike: number;
  expiry: string;
  strikes: OptionChainWithOIStrike[];
}

interface AngelSession {
  jwtToken?: string;
  refreshToken?: string;
  feedToken?: string;
}

/* =========================================================
   MASTER CONTRACT LOADER
========================================================= */

let masterCache: any[] = [];
let masterLoadedDate: string | null = null;

async function loadMaster(): Promise<any[]> {
  const today = new Date().toDateString();

  if (masterCache.length > 0 && masterLoadedDate === today) {
    return masterCache;
  }

  try {
    const res = await fetch(
      "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json"
    );
    const data = await res.json();
    masterCache = Array.isArray(data) ? data : [];
    masterLoadedDate = today;
  } catch {
    masterCache = [];
    masterLoadedDate = today;
  }

  return masterCache;
}

/* =========================================================
   INSTRUMENT CONFIG
========================================================= */

const instrumentConfig: Record<string, { exchange: string; instrumentType: string; step: number }> = {
  NIFTY: {
    exchange: "NFO",
    instrumentType: "OPTIDX",
    step: 50,
  },
  BANKNIFTY: {
    exchange: "NFO",
    instrumentType: "OPTIDX",
    step: 100,
  },
  SENSEX: {
    exchange: "BFO",
    instrumentType: "OPTIDX",
    step: 100,
  },
  CRUDEOIL: {
    exchange: "MCX",
    instrumentType: "OPTFUT",
    step: 50,
  },
  NATURALGAS: {
    exchange: "MCX",
    instrumentType: "OPTFUT",
    step: 5,
  },
};

const indexTokens: Record<string, IndexInfo> = {
  NIFTY: { exchange: "NSE", token: "99926000" },
  BANKNIFTY: { exchange: "NSE", token: "99926009" },
  SENSEX: { exchange: "BSE", token: "99919000" },
  CRUDEOIL: { exchange: "MCX", token: "99926021" },
  NATURALGAS: { exchange: "MCX", token: "99926022" },
};

const exchangeTypeMap: Record<number, string> = {
  1: "NSE",
  2: "NFO",
  3: "BSE",
  4: "BFO",
  5: "MCX",
};

/* =========================================================
   AUTH + SESSION
========================================================= */

let smartApi: any | null = null;
let sessionInfo: AngelSession = {};
let loggedIn = false;
let simulatedMode = false;

function resolveCredentials() {
  const apiKey = process.env.ANGEL_API_KEY;
  const clientCode = process.env.ANGEL_CLIENT_ID;
  const password = process.env.ANGEL_PIN || process.env.ANGELONE_PASSWORD || process.env.ANGEL_PASSWORD;
  const totp = process.env.ANGEL_TOTP || process.env.ANGEL_TOTP_SECRET;

  const resolvedTotp = totp ? resolveTotpCode(totp) : undefined;

  return {
    apiKey,
    clientCode,
    password,
    totp: resolvedTotp,
    hasCreds: Boolean(apiKey && clientCode && password && resolvedTotp),
  };
}

function resolveTotpCode(value: string): string {
  const trimmed = value.trim();
  if (/^\d{6,8}$/.test(trimmed)) {
    return trimmed;
  }

  return generateTotpFromSecret(trimmed);
}

function generateTotpFromSecret(secret: string): string {
  const key = base32ToBuffer(secret);
  const epoch = Math.floor(Date.now() / 1000);
  const step = 30;
  const counter = Math.floor(epoch / step);

  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuffer.writeUInt32BE(counter % 0x100000000, 4);

  const hmac = createHmac("sha1", key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000;
  return String(code).padStart(6, "0");
}

function base32ToBuffer(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = input.replace(/=+$/g, "").toUpperCase().replace(/[^A-Z2-7]/g, "");

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of cleaned) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

async function ensureLoggedIn(): Promise<boolean> {
  if (loggedIn) return true;
  return loginToAngelOne();
}

export async function loginToAngelOne(): Promise<boolean> {
  const { apiKey, clientCode, password, totp, hasCreds } = resolveCredentials();

  if (!hasCreds) {
    simulatedMode = false;
    loggedIn = false;
    console.warn("AngelOne login skipped: missing credentials");
    return false;
  }

  try {
    smartApi = new SmartAPI({ api_key: apiKey });
    const session = await smartApi.generateSession(clientCode, password, totp);

    if (session?.status && session?.data?.jwtToken) {
      sessionInfo = {
        jwtToken: session.data.jwtToken,
        refreshToken: session.data.refreshToken,
        feedToken: session.data.feedToken,
      };
      smartApi.setAccessToken(session.data.jwtToken);
      if (session.data.refreshToken) {
        smartApi.setPublicToken(session.data.refreshToken);
      }
      loggedIn = true;
      simulatedMode = false;
      return true;
    }
    console.warn(
      `AngelOne login failed: status=${session?.status ?? "unknown"} message=${session?.message ?? "unknown"}`
    );
  } catch (err: any) {
    console.warn(`AngelOne login exception: ${err?.message ?? "unknown error"}`);
  }

  loggedIn = false;
  simulatedMode = false;
  return false;
}

export function isLoggedIn(): boolean {
  return loggedIn;
}

export async function getProfile(): Promise<any> {
  if (!simulatedMode && (await ensureLoggedIn()) && smartApi) {
    return smartApi.getProfile();
  }

  return {
    name: "Trader",
    clientcode: process.env.ANGEL_CLIENT_ID || "SIM",
  };
}

export async function getRMS(): Promise<any> {
  if (!simulatedMode && (await ensureLoggedIn()) && smartApi) {
    return smartApi.getRMS();
  }

  return {
    availablecash: "100000",
    net: "100000",
    collateral: "0",
    utiliseddebits: "0",
    m2mrealized: "0",
    m2munrealized: "0",
  };
}

/* =========================================================
   MARKET DATA HELPERS
========================================================= */

const livePrices: Map<string, number> = new Map();
const tokenMeta: Map<string, { type: "index" | "option"; instrument: string; strike?: number; optionType?: OptionType }> = new Map();
const tokenExchange: Map<string, string> = new Map();
const optionTokenCache: Map<string, TokenInfo> = new Map();

const subscribedTokens: Set<string> = new Set();
let streamConnected = false;
let streamTimer: ReturnType<typeof setInterval> | null = null;
let onTickCallback: ((symbolToken: string, ltp: number) => void) | null = null;

const IST_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function getATMStrike(ltp: number, step: number) {
  return Math.round(ltp / step) * step;
}

function getISTDateKey(date: Date): string {
  return IST_DATE_FORMATTER.format(date);
}

function parseMasterExpiry(value: unknown): Date | null {
  if (!value) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const numeric = Date.parse(raw);
  if (!Number.isNaN(numeric)) {
    return new Date(numeric);
  }

  const compactMatch = raw.toUpperCase().match(/^(\d{2})([A-Z]{3})(\d{4})$/);
  if (!compactMatch) {
    return null;
  }

  const day = Number(compactMatch[1]);
  const mon = compactMatch[2];
  const year = Number(compactMatch[3]);

  const monthMap: Record<string, number> = {
    JAN: 0,
    FEB: 1,
    MAR: 2,
    APR: 3,
    MAY: 4,
    JUN: 5,
    JUL: 6,
    AUG: 7,
    SEP: 8,
    OCT: 9,
    NOV: 10,
    DEC: 11,
  };

  const month = monthMap[mon];
  if (month == null) {
    return null;
  }

  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
}

function normalizeToken(token: unknown): string {
  return String(token ?? "");
}

function toNumber(value: any): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function extractQuotes(response: any): any[] {
  const data = response?.data ?? response;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.fetched)) return data.fetched;
  if (Array.isArray(data?.fetchedData)) return data.fetchedData;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function getQuoteValue(quote: any, keys: string[]): number | null {
  for (const key of keys) {
    if (quote && quote[key] != null) {
      return toNumber(quote[key]);
    }
  }
  return null;
}

function scaleByLotSize(value: number, instrument: string): number {
  const lotSize = LOT_SIZES[instrument] ?? 1;
  if (lotSize <= 0) return value;
  return Math.round(value / lotSize);
}

async function fetchMarketData(exchangeTokens: Record<string, string[]>, mode: "LTP" | "FULL" = "FULL") {
  if (!smartApi) return null;
  const response = await smartApi.marketData({
    mode,
    exchangeTokens,
  });
  return extractQuotes(response);
}

async function resolveCommodityFutureIndex(instrument: string): Promise<IndexInfo | null> {
  if (instrument !== "CRUDEOIL" && instrument !== "NATURALGAS") {
    return null;
  }

  const master = await loadMaster();
  const todayKey = getISTDateKey(new Date());

  const candidates = master
    .filter((item) => item.exch_seg === "MCX" && item.name === instrument && item.instrumenttype === "FUTCOM")
    .map((item) => {
      const parsedExpiry = parseMasterExpiry(item.expiry);
      return {
        token: normalizeToken(item.token),
        expiry: parsedExpiry,
      };
    })
    .filter((item) => item.expiry != null && item.token)
    .sort((a, b) => (a.expiry!.getTime() - b.expiry!.getTime()));

  if (!candidates.length) {
    return null;
  }

  const next = candidates.find((item) => getISTDateKey(item.expiry!) >= todayKey) || candidates[0];
  return { exchange: "MCX", token: next.token };
}

async function getIndexLTP(instrument: string): Promise<number | null> {
  let idxInfo = indexTokens[instrument];
  if (!idxInfo) return null;

  if (!simulatedMode && (await ensureLoggedIn()) && smartApi) {
    const quotes = await fetchMarketData({
      [idxInfo.exchange]: [idxInfo.token],
    });
    const quote = quotes?.[0];
    const ltp = getQuoteValue(quote, ["ltp", "LTP", "last_traded_price", "lastPrice", "close"]);
    if (ltp != null) {
      livePrices.set(idxInfo.token, ltp);
      tokenExchange.set(idxInfo.token, idxInfo.exchange);
      tokenMeta.set(idxInfo.token, { type: "index", instrument });
      return ltp;
    }

    const fallbackIdx = await resolveCommodityFutureIndex(instrument);
    if (fallbackIdx) {
      idxInfo = fallbackIdx;
      const fallbackQuotes = await fetchMarketData({
        [idxInfo.exchange]: [idxInfo.token],
      });
      const fallbackQuote = fallbackQuotes?.[0];
      const fallbackLtp = getQuoteValue(fallbackQuote, ["ltp", "LTP", "last_traded_price", "lastPrice", "close"]);
      if (fallbackLtp != null) {
        livePrices.set(idxInfo.token, fallbackLtp);
        tokenExchange.set(idxInfo.token, idxInfo.exchange);
        tokenMeta.set(idxInfo.token, { type: "index", instrument });
        return fallbackLtp;
      }
    }
  }

  return livePrices.get(idxInfo.token) ?? null;
}

async function getFallbackSpotFromOptionMaster(instrument: string, expiry: Date): Promise<number | null> {
  const config = instrumentConfig[instrument];
  if (!config) return null;

  const targetExpiryKey = getISTDateKey(expiry);
  const master = await loadMaster();
  const strikes = Array.from(
    new Set(
      master
        .filter((item) => {
          if (item.name !== instrument) return false;
          if (item.exch_seg !== config.exchange) return false;
          if (item.instrumenttype !== config.instrumentType) return false;
          const parsedExpiry = parseMasterExpiry(item.expiry);
          if (!parsedExpiry || getISTDateKey(parsedExpiry) !== targetExpiryKey) return false;
          const symbol = String(item.symbol || "");
          if (!symbol.endsWith("CE") && !symbol.endsWith("PE")) return false;
          const strike = Number(item.strike) / 100;
          return Number.isFinite(strike) && strike > 0;
        })
        .map((item) => Number(item.strike) / 100)
    )
  ).sort((a, b) => a - b);

  if (!strikes.length) return null;
  return strikes[Math.floor(strikes.length / 2)];
}

export async function resolveTradingExpiry(instrument: string): Promise<Date> {
  const config = instrumentConfig[instrument];
  if (!config) {
    throw new Error(`Unsupported instrument for expiry resolution: ${instrument}`);
  }

  const master = await loadMaster();
  const todayKey = getISTDateKey(new Date());

  const filtered = master.filter(item =>
    item.name === instrument &&
    item.exch_seg === config.exchange &&
    item.instrumenttype === config.instrumentType
  );

  const expiryByDateKey = new Map<string, Date>();
  for (const item of filtered) {
    const parsed = parseMasterExpiry(item.expiry);
    if (!parsed) continue;

    const key = getISTDateKey(parsed);
    if (!expiryByDateKey.has(key)) {
      expiryByDateKey.set(key, parsed);
    }
  }

  const expiries = Array.from(expiryByDateKey.values())
    .sort((a, b) => a.getTime() - b.getTime());

  const todayExpiry = expiries.find((date) => getISTDateKey(date) === todayKey);
  if (todayExpiry) {
    return todayExpiry;
  }

  const nextExpiry = expiries.find((date) => getISTDateKey(date) > todayKey);
  if (nextExpiry) {
    return nextExpiry;
  }

  if (!expiries.length) {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + 7);
    return fallback;
  }

  return expiries[0];
}

async function getOptionToken(
  instrument: string,
  expiry: Date,
  strike: number,
  optionType: OptionType
): Promise<TokenInfo | null> {
  const expiryKey = getISTDateKey(expiry);
  const cacheKey = `${instrument}_${expiryKey}_${strike}_${optionType}`;
  const cached = optionTokenCache.get(cacheKey);
  if (cached) return cached;

  const config = instrumentConfig[instrument];
  const master = await loadMaster();
  const targetExpiryKey = getISTDateKey(expiry);

  const match = master.find(item =>
    item.name === instrument &&
    item.exch_seg === config.exchange &&
    item.instrumenttype === config.instrumentType &&
    (() => {
      const parsedExpiry = parseMasterExpiry(item.expiry);
      return parsedExpiry ? getISTDateKey(parsedExpiry) === targetExpiryKey : false;
    })() &&
    Number(item.strike) === strike * 100 &&
    item.symbol.endsWith(optionType)
  );

  if (!match) {
    return null;
  }

  const info = {
    token: normalizeToken(match.token),
    symbol: String(match.symbol),
    exchange: config.exchange,
    instrument,
    strike,
    optionType,
  };
  optionTokenCache.set(cacheKey, info);
  optionTokenCache.set(`${instrument}_${strike}_${optionType}`, info);
  tokenMeta.set(info.token, { type: "option", instrument, strike, optionType });
  tokenExchange.set(info.token, config.exchange);
  return info;
}

export async function getOptionLTP(
  instrument: string,
  strike: number,
  optionType: OptionType,
  resolvedExpiry?: Date
): Promise<number | null> {
  const config = instrumentConfig[instrument];
  if (!config) return null;

  if (!simulatedMode && (await ensureLoggedIn()) && smartApi) {
    const expiry = resolvedExpiry ?? await resolveTradingExpiry(instrument);
    const tokenInfo = await getOptionToken(instrument, expiry, strike, optionType);
    if (!tokenInfo) return null;

    const quotes = await fetchMarketData({
      [config.exchange]: [tokenInfo.token],
    });
    const quote = quotes?.[0];
    const ltp = getQuoteValue(quote, ["ltp", "LTP", "last_traded_price", "lastPrice", "close"]);
    if (ltp != null) {
      livePrices.set(tokenInfo.token, ltp);
      return ltp;
    }
  }

  return null;
}

export async function getOptionChain(instrument: string): Promise<OptionChainData | null> {
  return getFullOptionChain(instrument);
}

export async function getFullOptionChain(instrument: string): Promise<OptionChainData | null> {
  const config = instrumentConfig[instrument];
  if (!config) return null;

  const expiry = await resolveTradingExpiry(instrument);

  const spotPrice = (await getIndexLTP(instrument)) ?? (await getFallbackSpotFromOptionMaster(instrument, expiry));
  if (spotPrice == null) return null;

  const atmStrike = getATMStrike(spotPrice, config.step);

  const strikes: OptionChainStrike[] = [];
  const tokens: string[] = [];
  const strikeInfo: Array<{ strike: number; ceToken: string | null; peToken: string | null }> = [];

  // Fetch all tokens in parallel instead of sequentially
  const tokenPromises: Array<Promise<TokenInfo | null>> = [];
  const strikeList: number[] = [];

  for (let i = -9; i <= 9; i++) {
    const strike = atmStrike + i * config.step;
    strikeList.push(strike);
    tokenPromises.push(getOptionToken(instrument, expiry, strike, "CE"));
    tokenPromises.push(getOptionToken(instrument, expiry, strike, "PE"));
  }

  const allTokens = await Promise.all(tokenPromises);

  for (let i = 0; i < strikeList.length; i++) {
    const strike = strikeList[i];
    const ceToken = allTokens[i * 2]?.token ?? null;
    const peToken = allTokens[i * 2 + 1]?.token ?? null;

    if (ceToken) tokens.push(ceToken);
    if (peToken) tokens.push(peToken);

    strikeInfo.push({ strike, ceToken, peToken });
  }

  let quoteMap = new Map<string, any>();
  if (!simulatedMode && (await ensureLoggedIn()) && smartApi && tokens.length > 0) {
    const quotes = await fetchMarketData({
      [config.exchange]: tokens,
    });

    quotes?.forEach((quote: any) => {
      const token = normalizeToken(quote?.symbolToken ?? quote?.symboltoken ?? quote?.token);
      if (token) quoteMap.set(token, quote);
    });
  }

  strikeInfo.forEach((info) => {
    const ceQuote = info.ceToken ? quoteMap.get(info.ceToken) : null;
    const peQuote = info.peToken ? quoteMap.get(info.peToken) : null;

    const ceLTP = ceQuote ? getQuoteValue(ceQuote, ["ltp", "LTP", "last_traded_price", "lastPrice", "close"]) : null;
    const peLTP = peQuote ? getQuoteValue(peQuote, ["ltp", "LTP", "last_traded_price", "lastPrice", "close"]) : null;

    strikes.push({
      strike: info.strike,
      ceLTP,
      peLTP,
      ceToken: info.ceToken,
      peToken: info.peToken,
    });
  });

  return { spotPrice, atmStrike, expiry: expiry.toISOString(), strikes };
}

export async function getOptionChainWithOI(instrument: string): Promise<OptionChainWithOIData | null> {
  const base = await getFullOptionChain(instrument);
  if (!base) return null;

  const config = instrumentConfig[instrument];
  if (!config) return null;

  const tokens: string[] = [];
  base.strikes.forEach((row) => {
    if (row.ceToken) tokens.push(row.ceToken);
    if (row.peToken) tokens.push(row.peToken);
  });

  let quoteMap = new Map<string, any>();
  if (!simulatedMode && (await ensureLoggedIn()) && smartApi && tokens.length > 0) {
    const quotes = await fetchMarketData({
      [config.exchange]: tokens,
    });

    quotes?.forEach((quote: any) => {
      const token = normalizeToken(quote?.symbolToken ?? quote?.symboltoken ?? quote?.token);
      if (token) quoteMap.set(token, quote);
    });
  }

  const strikes: OptionChainWithOIStrike[] = base.strikes.map((row) => {
    const ceQuote = row.ceToken ? quoteMap.get(row.ceToken) : null;
    const peQuote = row.peToken ? quoteMap.get(row.peToken) : null;

    if (process.env.DEBUG_OPTION_CHAIN === "1" && instrument === "NIFTY" && row.strike === 25500) {
      console.log("Option chain debug NIFTY 25500", {
        ceToken: row.ceToken,
        peToken: row.peToken,
        ceQuote,
        peQuote,
      });
    }

    const ceOIUnits = getQuoteValue(ceQuote, ["openInterest", "opnInterest", "oi", "open_interest"]) ?? 0;
    const peOIUnits = getQuoteValue(peQuote, ["openInterest", "opnInterest", "oi", "open_interest"]) ?? 0;

    const ceVolumeUnits = getQuoteValue(ceQuote, ["tradeVolume", "totalTradedVolume", "volumeTraded", "volume"]) ?? 0;
    const peVolumeUnits = getQuoteValue(peQuote, ["tradeVolume", "totalTradedVolume", "volumeTraded", "volume"]) ?? 0;

    const ceOI = scaleByLotSize(ceOIUnits, instrument);
    const peOI = scaleByLotSize(peOIUnits, instrument);
    const ceVolume = scaleByLotSize(ceVolumeUnits, instrument);
    const peVolume = scaleByLotSize(peVolumeUnits, instrument);

    return {
      strike: row.strike,
      ceLTP: row.ceLTP,
      peLTP: row.peLTP,
      ceOI,
      peOI,
      ceVolume,
      peVolume,
    };
  });

  return { spotPrice: base.spotPrice, atmStrike: base.atmStrike, expiry: base.expiry, strikes };
}

export async function getLTP(exchange: string, symbol: string, token: string): Promise<number | null> {
  if (!simulatedMode && (await ensureLoggedIn()) && smartApi) {
    const quotes = await fetchMarketData({
      [exchange]: [token],
    });
    const quote = quotes?.[0];
    const ltp = getQuoteValue(quote, ["ltp", "LTP", "last_traded_price", "lastPrice", "close"]);
    if (ltp != null) {
      livePrices.set(token, ltp);
      tokenExchange.set(token, exchange);
      return ltp;
    }
  }

  if (symbol === "India VIX" || token === "99926017") {
    return livePrices.get(token) ?? null;
  }

  return livePrices.get(token) ?? null;
}

export async function getCandleData(
  exchange: string,
  token: string,
  interval: string,
  fromDate: string,
  toDate: string
): Promise<any[] | null> {
  if (!simulatedMode && (await ensureLoggedIn()) && smartApi) {
    const response = await smartApi.getCandleData({
      exchange,
      symboltoken: token,
      interval,
      fromdate: fromDate,
      todate: toDate,
    });

    if (Array.isArray(response?.data)) {
      return response.data;
    }

    if (Array.isArray(response?.data?.data)) {
      return response.data.data;
    }
  }

  return null;
}

export function getExchangeForIndex(instrument: string): IndexInfo | null {
  return indexTokens[instrument] || null;
}

export function isMCXInstrument(instrument: string): boolean {
  return instrument === "CRUDEOIL" || instrument === "NATURALGAS";
}

/* =========================================================
   STREAMING (POLLING)
========================================================= */

function pushTick(symbolToken: string, ltp: number) {
  livePrices.set(symbolToken, ltp);
  if (onTickCallback) onTickCallback(symbolToken, ltp);
}

async function pollSubscribedTokens() {
  if (!subscribedTokens.size) return;

  const tokensByExchange: Record<string, string[]> = {};

  subscribedTokens.forEach((token) => {
    const exchange = tokenExchange.get(token) || "NFO";
    if (!tokensByExchange[exchange]) tokensByExchange[exchange] = [];
    tokensByExchange[exchange].push(token);
  });

  if (!simulatedMode && (await ensureLoggedIn()) && smartApi) {
    const exchanges = Object.keys(tokensByExchange);
    for (const exchange of exchanges) {
      const tokens = tokensByExchange[exchange];
      if (!tokens || tokens.length === 0) continue;

      const quotes = await fetchMarketData({
        [exchange]: tokens,
      }, "LTP");

      quotes?.forEach((quote: any) => {
        const token = normalizeToken(quote?.symbolToken ?? quote?.symboltoken ?? quote?.token);
        const ltp = getQuoteValue(quote, ["ltp", "LTP", "last_traded_price", "lastPrice", "close"]);
        if (token && ltp != null) pushTick(token, ltp);
      });
    }
  }
}

export function connectStream(): void {
  if (streamConnected) return;
  streamConnected = true;
  if (!streamTimer) {
    streamTimer = setInterval(() => {
      pollSubscribedTokens().catch(() => undefined);
    }, 1200);
  }
}

export function disconnectStream(): void {
  streamConnected = false;
  if (streamTimer) {
    clearInterval(streamTimer);
    streamTimer = null;
  }
}

export function isStreamConnected(): boolean {
  return streamConnected;
}

export function setOnTickCallback(cb: (symbolToken: string, ltp: number) => void): void {
  onTickCallback = cb;
}

export function subscribeTokenToStream(exchangeType: number, symbolToken: string): void {
  const exchange = exchangeTypeMap[exchangeType] || "NFO";
  subscribedTokens.add(symbolToken);
  tokenExchange.set(symbolToken, exchange);
}

export function getLivePrice(symbolToken: string): number | null {
  return livePrices.get(symbolToken) ?? null;
}

export function getSymbolTokenFromCache(cacheKey: string): TokenInfo | null {
  return optionTokenCache.get(cacheKey) ?? null;
}

/* =========================================================
   LEGACY HELPER
========================================================= */

export async function buildATMOption(
  smartApiInstance: any,
  instrument: string,
  spotLTP: number
) {
  const config = instrumentConfig[instrument];
  if (!config) {
    throw new Error("Unsupported instrument");
  }

  const expiry = await resolveTradingExpiry(instrument);
  const atm = getATMStrike(spotLTP, config.step);

  const ce = await getOptionToken(instrument, expiry, atm, "CE");
  const pe = await getOptionToken(instrument, expiry, atm, "PE");

  if (!ce || !pe) {
    throw new Error("Token not found for ATM option");
  }

  const quotes = await smartApiInstance.marketData({
    mode: "FULL",
    exchangeTokens: {
      [config.exchange]: [ce.token, pe.token],
    },
  });

  const fetched = extractQuotes(quotes);
  const quoteMap = new Map<string, any>();
  fetched.forEach((quote: any) => {
    const token = normalizeToken(quote?.symbolToken ?? quote?.symboltoken ?? quote?.token);
    if (token) quoteMap.set(token, quote);
  });

  const ceQuote = quoteMap.get(ce.token);
  const peQuote = quoteMap.get(pe.token);

  const ceLTP = getQuoteValue(ceQuote, ["ltp", "LTP", "last_traded_price", "lastPrice", "close"]);
  const peLTP = getQuoteValue(peQuote, ["ltp", "LTP", "last_traded_price", "lastPrice", "close"]);

  return {
    expiry,
    strike: atm,
    CE: {
      symbol: ce.symbol,
      token: ce.token,
      ltp: ceLTP,
    },
    PE: {
      symbol: pe.symbol,
      token: pe.token,
      ltp: peLTP,
    },
  };
}
