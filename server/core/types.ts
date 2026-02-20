export type Instrument = "NIFTY" | "BANKNIFTY" | "SENSEX" | "CRUDEOIL" | "NATURALGAS";
export type OptionType = "CE" | "PE";
export type ProductType = "INT" | "CF";
export type MarketBias = "BULLISH" | "BEARISH" | "NEUTRAL";
export type MarketRegime = "SIDEWAYS" | "TRENDING" | "BREAKOUT" | "VOLATILE";
export type SignalStatus = "active" | "target1_hit" | "target2_hit" | "target3_hit" | "sl_hit" | "expired" | "closed";

export interface MarketData {
  symbol: string;
  ltp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: Date;
}

export interface CandleData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: Date;
}

export interface OptionChainData {
  strikePrice: number;
  callOI: number;
  callOIChange: number;
  callVolume: number;
  callLTP: number;
  callIV: number;
  putOI: number;
  putOIChange: number;
  putVolume: number;
  putLTP: number;
  putIV: number;
}

export interface OIAnalysis {
  maxCallOI: { strike: number; oi: number };
  maxPutOI: { strike: number; oi: number };
  callOITrend: "INCREASING" | "DECREASING" | "STABLE";
  putOITrend: "INCREASING" | "DECREASING" | "STABLE";
  pcrRatio: number;
  sentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
  confidence: number;
  writingActivity: "CE_WRITING" | "PE_WRITING" | "CE_UNWINDING" | "PE_UNWINDING" | "NEUTRAL";
}

export interface RegimeAnalysis {
  regime: MarketRegime;
  confidence: number;
  bias: MarketBias;
  volatility: number;
  trendStrength: number;
  reason: string;
}

export interface BreakoutAnalysis {
  score: number;
  isValid: boolean;
  isFake: boolean;
  volumeConfirmed: boolean;
  atrConfirmed: boolean;
  oiConfirmed: boolean;
  reason: string;
}

export interface TradingSignal {
  strategy: string;
  instrument: Instrument;
  optionType: OptionType;
  productType: ProductType;
  strikePrice: number;
  entryPrice: number;
  target1: number;
  target2?: number;
  target3?: number;
  stoploss: number;
  confidence: number;
  confidenceReason: string;
  marketBias: MarketBias;
  marketRegime: MarketRegime;
  regimeConfidence?: number;
  breakoutScore?: number;
  oiConfirmation?: string;
  vixAtEntry?: number;
  riskRewardRatio?: number;
}

export interface StrategyConfig {
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

export interface RiskMetrics {
  positionSize: number;
  riskAmount: number;
  riskRewardRatio: number;
  maxLoss: number;
  winProbability: number;
  expectedValue: number;
}
