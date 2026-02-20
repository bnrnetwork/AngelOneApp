import { CandleData } from "./types";

export class TechnicalIndicators {
  static ema(values: number[], period: number): number[] {
    if (values.length < period) return [];

    const multiplier = 2 / (period + 1);
    const emaValues: number[] = [];

    let sma = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    emaValues.push(sma);

    for (let i = period; i < values.length; i++) {
      const ema = (values[i] - emaValues[emaValues.length - 1]) * multiplier + emaValues[emaValues.length - 1];
      emaValues.push(ema);
    }

    return emaValues;
  }

  static sma(values: number[], period: number): number[] {
    if (values.length < period) return [];

    const result: number[] = [];
    for (let i = period - 1; i < values.length; i++) {
      const sum = values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
    return result;
  }

  static rsi(values: number[], period: number = 14): number[] {
    if (values.length < period + 1) return [];

    const gains: number[] = [];
    const losses: number[] = [];

    for (let i = 1; i < values.length; i++) {
      const change = values[i] - values[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }

    const avgGains = this.ema(gains, period);
    const avgLosses = this.ema(losses, period);

    return avgGains.map((gain, i) => {
      if (avgLosses[i] === 0) return 100;
      const rs = gain / avgLosses[i];
      return 100 - (100 / (1 + rs));
    });
  }

  static atr(candles: CandleData[], period: number = 14): number[] {
    if (candles.length < period + 1) return [];

    const trueRanges: number[] = [];

    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRanges.push(tr);
    }

    return this.sma(trueRanges, period);
  }

  static vwap(candles: CandleData[]): number[] {
    let cumulativeTPV = 0;
    let cumulativeVolume = 0;
    const vwapValues: number[] = [];

    for (const candle of candles) {
      const typicalPrice = (candle.high + candle.low + candle.close) / 3;
      cumulativeTPV += typicalPrice * candle.volume;
      cumulativeVolume += candle.volume;

      vwapValues.push(cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : typicalPrice);
    }

    return vwapValues;
  }

  static bollingerBands(values: number[], period: number = 20, stdDev: number = 2): {
    upper: number[];
    middle: number[];
    lower: number[];
  } {
    const middle = this.sma(values, period);
    const upper: number[] = [];
    const lower: number[] = [];

    for (let i = period - 1; i < values.length; i++) {
      const slice = values.slice(i - period + 1, i + 1);
      const mean = middle[i - period + 1];
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
      const std = Math.sqrt(variance);

      upper.push(mean + (stdDev * std));
      lower.push(mean - (stdDev * std));
    }

    return { upper, middle, lower };
  }

  static supertrend(candles: CandleData[], period: number = 10, multiplier: number = 3): {
    trend: number[];
    direction: ("up" | "down")[];
  } {
    const atr = this.atr(candles, period);
    const trend: number[] = [];
    const direction: ("up" | "down")[] = [];

    let upperBand: number[] = [];
    let lowerBand: number[] = [];

    for (let i = 0; i < candles.length - period; i++) {
      const hl2 = (candles[i + period].high + candles[i + period].low) / 2;
      upperBand.push(hl2 + (multiplier * atr[i]));
      lowerBand.push(hl2 - (multiplier * atr[i]));
    }

    let currentTrend = 1;
    for (let i = 0; i < upperBand.length; i++) {
      const close = candles[i + period].close;

      if (close > upperBand[i]) {
        currentTrend = 1;
      } else if (close < lowerBand[i]) {
        currentTrend = -1;
      }

      trend.push(currentTrend === 1 ? lowerBand[i] : upperBand[i]);
      direction.push(currentTrend === 1 ? "up" : "down");
    }

    return { trend, direction };
  }

  static volumeProfile(candles: CandleData[], bins: number = 20): {
    priceLevel: number;
    volume: number;
  }[] {
    if (candles.length === 0) return [];

    const maxPrice = Math.max(...candles.map(c => c.high));
    const minPrice = Math.min(...candles.map(c => c.low));
    const priceRange = maxPrice - minPrice;
    const binSize = priceRange / bins;

    const profile: Map<number, number> = new Map();

    for (const candle of candles) {
      const bin = Math.floor((candle.close - minPrice) / binSize);
      const priceLevel = minPrice + (bin * binSize);
      profile.set(priceLevel, (profile.get(priceLevel) || 0) + candle.volume);
    }

    return Array.from(profile.entries())
      .map(([priceLevel, volume]) => ({ priceLevel, volume }))
      .sort((a, b) => b.volume - a.volume);
  }
}
