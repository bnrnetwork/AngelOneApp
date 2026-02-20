/**
 * REGIME AI CLASSIFIER
 * ONNX-based regime detection for market classification
 *
 * Input features (5-min timeframe):
 * 1. ATR %
 * 2. EMA20 slope
 * 3. Price distance from VWAP
 * 4. RSI
 * 5. ORB range %
 * 6. Volume spike ratio
 * 7. India VIX
 *
 * Output classes:
 * 0 → SIDEWAYS (range-bound, low volatility)
 * 1 → TRENDING (directional bias, momentum)
 * 2 → BREAKOUT (strong move starting)
 */

import * as fs from "fs";
import * as path from "path";

export type MarketRegime = "SIDEWAYS" | "TRENDING" | "BREAKOUT";

export interface RegimeFeatures {
  atrPercent: number;
  ema20Slope: number;
  priceDistanceFromVwap: number;
  rsi: number;
  orbRangePercent: number;
  volumeSpikeRatio: number;
  indiaVix: number;
}

export interface RegimeResult {
  regime: MarketRegime;
  confidence: number; // 0-100
  scores: {
    sideways: number;
    trending: number;
    breakout: number;
  };
  reasoning: string;
}

export class RegimeAI {
  private modelPath: string = "";
  private modelLoaded: boolean = false;
  private onnxRuntime: any = null;
  private session: any = null;

  // Fallback heuristic-based classifier if ONNX not available
  private static readonly REGIME_THRESHOLDS = {
    SIDEWAYS: {
      maxAtrPercent: 1.0,
      maxVixLevel: 15,
      minRsiDeviation: 30,
      maxVolumeSpikeRatio: 1.5,
    },
    TRENDING: {
      minAtrPercent: 0.8,
      maxAtrPercent: 2.5,
      minVixLevel: 11,
      maxVixLevel: 22,
      minEmaSlope: 0.05,
    },
    BREAKOUT: {
      minAtrPercent: 2.0,
      minVolumeSpikeRatio: 1.8,
      minOrbRangePercent: 1.0,
    },
  };

  constructor(modelPath?: string) {
    if (modelPath) {
      this.modelPath = modelPath;
    }
  }

  /**
   * Load ONNX model
   */
  async loadModel(): Promise<boolean> {
    try {
      if (!this.modelPath || !fs.existsSync(this.modelPath)) {
        console.warn(
          "ONNX model not found. Using heuristic-based classification."
        );
        this.modelLoaded = false;
        return false;
      }

      // Dynamically import onnxruntime (optional dependency)
      try {
        const ort = await import("onnxruntime-node");
        this.onnxRuntime = ort;

        const modelBuffer = fs.readFileSync(this.modelPath);
        this.session = await ort.InferenceSession.create(modelBuffer);
        this.modelLoaded = true;
        console.log("ONNX model loaded successfully");
        return true;
      } catch (importError) {
        console.warn("onnxruntime-node not available. Using heuristic-based classification.");
        this.modelLoaded = false;
        return false;
      }
    } catch (error) {
      console.error("Failed to load ONNX model:", error);
      this.modelLoaded = false;
      return false;
    }
  }

  /**
   * Predict market regime using ONNX model
   */
  async predict(features: RegimeFeatures): Promise<RegimeResult> {
    if (!this.modelLoaded || !this.session) {
      // Fallback to heuristic classification
      return this.predictHeuristic(features);
    }

    try {
      const featureArray = [
        features.atrPercent,
        features.ema20Slope,
        features.priceDistanceFromVwap,
        features.rsi,
        features.orbRangePercent,
        features.volumeSpikeRatio,
        features.indiaVix,
      ];

      const tensor = new this.onnxRuntime.Tensor("float32", featureArray, [
        1,
        7,
      ]);

      const results = await this.session.run({ input: tensor });
      const outputName = Object.keys(results)[0];
      const outputTensor = results[outputName];

      // Assuming model outputs probabilities for each class
      const scores = Array.from(outputTensor.data) as number[];
      const maxIndex = scores.indexOf(Math.max(...scores));

      const regimes: MarketRegime[] = ["SIDEWAYS", "TRENDING", "BREAKOUT"];
      const regime = regimes[maxIndex];
      const confidence = (scores[maxIndex] ?? 0) * 100;

      return {
        regime,
        confidence,
        scores: {
          sideways: (scores[0] ?? 0) * 100,
          trending: (scores[1] ?? 0) * 100,
          breakout: (scores[2] ?? 0) * 100,
        },
        reasoning: `ONNX model prediction: ${regime} (confidence: ${confidence.toFixed(1)}%)`,
      };
    } catch (error) {
      console.error("ONNX prediction error:", error);
      // Fallback to heuristic
      return this.predictHeuristic(features);
    }
  }

  /**
   * Heuristic-based regime classification (fallback)
   */
  private predictHeuristic(features: RegimeFeatures): RegimeResult {
    const scores = {
      sideways: this.scoreSideways(features),
      trending: this.scoreTrending(features),
      breakout: this.scoreBreakout(features),
    };

    const maxScore = Math.max(scores.sideways, scores.trending, scores.breakout);
    let regime: MarketRegime = "SIDEWAYS";

    if (maxScore === scores.trending) regime = "TRENDING";
    else if (maxScore === scores.breakout) regime = "BREAKOUT";

    const totalScore = scores.sideways + scores.trending + scores.breakout;
    const confidence = (maxScore / totalScore) * 100;

    return {
      regime,
      confidence: Math.min(100, Math.max(50, confidence)),
      scores: {
        sideways: (scores.sideways / totalScore) * 100,
        trending: (scores.trending / totalScore) * 100,
        breakout: (scores.breakout / totalScore) * 100,
      },
      reasoning: this.getRegimeReasoning(features, regime, scores),
    };
  }

  /**
   * Score for SIDEWAYS regime
   */
  private scoreSideways(features: RegimeFeatures): number {
    let score = 50;

    // Low ATR favors sideways
    if (features.atrPercent < RegimeAI.REGIME_THRESHOLDS.SIDEWAYS.maxAtrPercent) {
      score += 15;
    }

    // Low VIX favors sideways
    if (
      features.indiaVix <
      RegimeAI.REGIME_THRESHOLDS.SIDEWAYS.maxVixLevel
    ) {
      score += 15;
    }

    // RSI near middle (50) favors sideways
    const rsiDeviation = Math.abs(features.rsi - 50);
    if (
      rsiDeviation >
      RegimeAI.REGIME_THRESHOLDS.SIDEWAYS.minRsiDeviation
    ) {
      score -= 10;
    } else {
      score += 10;
    }

    // Low volume spike favors sideways
    if (
      features.volumeSpikeRatio <
      RegimeAI.REGIME_THRESHOLDS.SIDEWAYS.maxVolumeSpikeRatio
    ) {
      score += 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Score for TRENDING regime
   */
  private scoreTrending(features: RegimeFeatures): number {
    let score = 50;

    // Moderate ATR favors trending
    if (
      features.atrPercent >= RegimeAI.REGIME_THRESHOLDS.TRENDING.minAtrPercent &&
      features.atrPercent <= RegimeAI.REGIME_THRESHOLDS.TRENDING.maxAtrPercent
    ) {
      score += 20;
    }

    // Moderate VIX favors trending
    if (
      features.indiaVix >=
        RegimeAI.REGIME_THRESHOLDS.TRENDING.minVixLevel &&
      features.indiaVix <=
        RegimeAI.REGIME_THRESHOLDS.TRENDING.maxVixLevel
    ) {
      score += 15;
    }

    // Clear EMA slope favors trending
    if (
      Math.abs(features.ema20Slope) >
      RegimeAI.REGIME_THRESHOLDS.TRENDING.minEmaSlope
    ) {
      score += 15;
    }

    // Extreme RSI (very oversold/overbought) favors trending
    if (features.rsi < 25 || features.rsi > 75) {
      score += 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Score for BREAKOUT regime
   */
  private scoreBreakout(features: RegimeFeatures): number {
    let score = 50;

    // High ATR favors breakout
    if (
      features.atrPercent >
      RegimeAI.REGIME_THRESHOLDS.BREAKOUT.minAtrPercent
    ) {
      score += 25;
    }

    // Strong volume spike favors breakout
    if (
      features.volumeSpikeRatio >
      RegimeAI.REGIME_THRESHOLDS.BREAKOUT.minVolumeSpikeRatio
    ) {
      score += 20;
    }

    // Large ORB range favors breakout
    if (
      features.orbRangePercent >
      RegimeAI.REGIME_THRESHOLDS.BREAKOUT.minOrbRangePercent
    ) {
      score += 20;
    }

    // High VIX favors breakout
    if (features.indiaVix > 20) {
      score += 10;
    }

    // Clear price movement from VWAP favors breakout
    if (Math.abs(features.priceDistanceFromVwap) > 0.5) {
      score += 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate reasoning for predicted regime
   */
  private getRegimeReasoning(
    features: RegimeFeatures,
    regime: MarketRegime,
    scores: Record<string, number>
  ): string {
    const reasons: string[] = [];

    if (regime === "SIDEWAYS") {
      reasons.push(
        `Low ATR (${features.atrPercent.toFixed(2)}%)`
      );
      if (features.indiaVix < 15) {
        reasons.push(`Low VIX (${features.indiaVix.toFixed(2)})`);
      }
      reasons.push(
        `RSI near middle (${features.rsi.toFixed(2)})`
      );
    } else if (regime === "TRENDING") {
      if (Math.abs(features.ema20Slope) > 0.05) {
        reasons.push(
          `Strong EMA slope (${features.ema20Slope.toFixed(3)})`
        );
      }
      reasons.push(
        `Moderate volatility (ATR: ${features.atrPercent.toFixed(2)}%)`
      );
      if (features.rsi < 25 || features.rsi > 75) {
        reasons.push(
          `Extreme RSI (${features.rsi.toFixed(2)}) indicates momentum`
        );
      }
    } else if (regime === "BREAKOUT") {
      if (features.atrPercent > 2.0) {
        reasons.push(
          `High ATR expansion (${features.atrPercent.toFixed(2)}%)`
        );
      }
      if (features.volumeSpikeRatio > 1.8) {
        reasons.push(
          `Strong volume spike (${features.volumeSpikeRatio.toFixed(2)}x)`
        );
      }
      reasons.push(
        `ORB range (${features.orbRangePercent.toFixed(2)}%) suggests move`
      );
    }

    return `${regime}: ${reasons.join(", ")}`;
  }
}
