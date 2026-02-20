import { OptionChainData, OIAnalysis } from "./types";

export class OIAnalyzer {
  static analyzeOptionChain(
    optionChain: OptionChainData[],
    spotPrice: number
  ): OIAnalysis {
    if (optionChain.length === 0) {
      return this.getDefaultAnalysis();
    }

    const maxCallOI = optionChain.reduce((max, opt) =>
      opt.callOI > max.oi ? { strike: opt.strikePrice, oi: opt.callOI } : max,
      { strike: 0, oi: 0 }
    );

    const maxPutOI = optionChain.reduce((max, opt) =>
      opt.putOI > max.oi ? { strike: opt.strikePrice, oi: opt.putOI } : max,
      { strike: 0, oi: 0 }
    );

    const totalCallOIChange = optionChain.reduce((sum, opt) => sum + opt.callOIChange, 0);
    const totalPutOIChange = optionChain.reduce((sum, opt) => sum + opt.putOIChange, 0);

    const callOITrend = totalCallOIChange > 1000000 ? "INCREASING" :
                        totalCallOIChange < -1000000 ? "DECREASING" : "STABLE";

    const putOITrend = totalPutOIChange > 1000000 ? "INCREASING" :
                       totalPutOIChange < -1000000 ? "DECREASING" : "STABLE";

    const totalPutOI = optionChain.reduce((sum, opt) => sum + opt.putOI, 0);
    const totalCallOI = optionChain.reduce((sum, opt) => sum + opt.callOI, 0);
    const pcrRatio = totalCallOI > 0 ? totalPutOI / totalCallOI : 1;

    const writingActivity = this.detectWritingActivity(callOITrend, putOITrend, spotPrice, maxCallOI.strike, maxPutOI.strike);

    const sentiment = this.determineSentiment(
      spotPrice,
      maxCallOI.strike,
      maxPutOI.strike,
      pcrRatio,
      callOITrend,
      putOITrend
    );

    const confidence = this.calculateConfidence(
      optionChain,
      callOITrend,
      putOITrend,
      pcrRatio
    );

    return {
      maxCallOI,
      maxPutOI,
      callOITrend,
      putOITrend,
      pcrRatio,
      sentiment,
      confidence,
      writingActivity,
    };
  }

  private static detectWritingActivity(
    callOITrend: "INCREASING" | "DECREASING" | "STABLE",
    putOITrend: "INCREASING" | "DECREASING" | "STABLE",
    spotPrice: number,
    maxCallStrike: number,
    maxPutStrike: number
  ): "CE_WRITING" | "PE_WRITING" | "CE_UNWINDING" | "PE_UNWINDING" | "NEUTRAL" {
    if (callOITrend === "INCREASING" && spotPrice < maxCallStrike) {
      return "CE_WRITING";
    }

    if (putOITrend === "INCREASING" && spotPrice > maxPutStrike) {
      return "PE_WRITING";
    }

    if (callOITrend === "DECREASING") {
      return "CE_UNWINDING";
    }

    if (putOITrend === "DECREASING") {
      return "PE_UNWINDING";
    }

    return "NEUTRAL";
  }

  private static determineSentiment(
    spotPrice: number,
    maxCallStrike: number,
    maxPutStrike: number,
    pcrRatio: number,
    callOITrend: string,
    putOITrend: string
  ): "BULLISH" | "BEARISH" | "NEUTRAL" {
    let bullishPoints = 0;
    let bearishPoints = 0;

    if (spotPrice > maxPutStrike && spotPrice < maxCallStrike) {
      bullishPoints += 2;
    }

    if (pcrRatio > 1.2) {
      bullishPoints += 2;
    } else if (pcrRatio < 0.8) {
      bearishPoints += 2;
    }

    if (callOITrend === "DECREASING") bullishPoints += 1;
    if (putOITrend === "INCREASING") bearishPoints += 1;
    if (callOITrend === "INCREASING") bearishPoints += 1;
    if (putOITrend === "DECREASING") bullishPoints += 1;

    if (bullishPoints > bearishPoints + 2) return "BULLISH";
    if (bearishPoints > bullishPoints + 2) return "BEARISH";
    return "NEUTRAL";
  }

  private static calculateConfidence(
    optionChain: OptionChainData[],
    callOITrend: string,
    putOITrend: string,
    pcrRatio: number
  ): number {
    let confidence = 50;

    const totalCallOI = optionChain.reduce((sum, opt) => sum + opt.callOI, 0);
    const totalPutOI = optionChain.reduce((sum, opt) => sum + opt.putOI, 0);

    if (totalCallOI > 10000000 || totalPutOI > 10000000) {
      confidence += 10;
    }

    if (callOITrend !== "STABLE" || putOITrend !== "STABLE") {
      confidence += 15;
    }

    if (pcrRatio > 1.5 || pcrRatio < 0.5) {
      confidence += 15;
    }

    const avgCallVolume = optionChain.reduce((sum, opt) => sum + opt.callVolume, 0) / optionChain.length;
    const avgPutVolume = optionChain.reduce((sum, opt) => sum + opt.putVolume, 0) / optionChain.length;

    if (avgCallVolume > 50000 || avgPutVolume > 50000) {
      confidence += 10;
    }

    return Math.min(confidence, 95);
  }

  static detectFakeBreakout(
    priceMove: "UP" | "DOWN",
    callOIChange: number,
    putOIChange: number,
    volumeRatio: number,
    atrRatio: number
  ): { isFake: boolean; reason: string } {
    if (priceMove === "UP") {
      if (callOIChange > 2000000 && volumeRatio < 1.5) {
        return {
          isFake: true,
          reason: "Heavy CE writing with weak volume - Bull trap likely"
        };
      }

      if (callOIChange > 2000000 && putOIChange > 2000000 && atrRatio < 0.5) {
        return {
          isFake: true,
          reason: "Both CE and PE OI increasing with weak ATR - Fake breakout"
        };
      }
    }

    if (priceMove === "DOWN") {
      if (putOIChange > 2000000 && volumeRatio < 1.5) {
        return {
          isFake: true,
          reason: "Heavy PE writing with weak volume - Bear trap likely"
        };
      }

      if (callOIChange > 2000000 && putOIChange > 2000000 && atrRatio < 0.5) {
        return {
          isFake: true,
          reason: "Both CE and PE OI increasing with weak ATR - Fake breakdown"
        };
      }
    }

    return { isFake: false, reason: "Valid breakout confirmed" };
  }

  private static getDefaultAnalysis(): OIAnalysis {
    return {
      maxCallOI: { strike: 0, oi: 0 },
      maxPutOI: { strike: 0, oi: 0 },
      callOITrend: "STABLE",
      putOITrend: "STABLE",
      pcrRatio: 1,
      sentiment: "NEUTRAL",
      confidence: 0,
      writingActivity: "NEUTRAL",
    };
  }
}
