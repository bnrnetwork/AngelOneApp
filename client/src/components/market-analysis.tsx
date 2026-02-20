import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Activity } from "lucide-react";

interface AnalysisFactor {
  label: string;
  signal: "bullish" | "bearish" | "neutral";
  detail: string;
}

interface MarketAnalysisData {
  instrument: string;
  trend: "Uptrend" | "Downtrend" | "Sideways";
  trendStrength: "Strong" | "Moderate" | "Weak";
  probability: number;
  bullishPct: number;
  bearishPct: number;
  headline: string;
  summary: string;
  observations: string[];
  factors: AnalysisFactor[];
  spotPrice: number;
  dayHigh: number;
  dayLow: number;
  dayOpen: number;
  atr: number;
  candlesAnalyzed?: number;
  changeFromOpen: number;
  updatedAt: string;
}

function TrendIcon({ trend, className }: { trend: string; className?: string }) {
  if (trend === "Uptrend") return <TrendingUp className={className || "w-4 h-4"} />;
  if (trend === "Downtrend") return <TrendingDown className={className || "w-4 h-4"} />;
  return <Minus className={className || "w-4 h-4"} />;
}

function SignalDot({ signal }: { signal: string }) {
  const color = signal === "bullish" ? "bg-green-500" : signal === "bearish" ? "bg-red-500" : "bg-yellow-500";
  return <span className={`inline-block w-2 h-2 rounded-full ${color} shrink-0 mt-1`} />;
}

export function MarketAnalysis({ instrument }: { instrument: string }) {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useQuery<MarketAnalysisData>({
    queryKey: ["/api/market-analysis", instrument],
    refetchInterval: 10000,
    retry: 3,
    retryDelay: 3000,
    enabled: !!instrument,
  });

  if (isLoading || !data) {
    return (
      <Card className="p-3" data-testid="card-market-analysis-loading">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-muted-foreground animate-pulse" />
          <span className="text-sm text-muted-foreground">
            {isLoading ? "Loading market analysis..." : "Waiting for market data..."}
          </span>
        </div>
      </Card>
    );
  }

  const trendColor = data.trend === "Uptrend"
    ? "text-green-500"
    : data.trend === "Downtrend"
      ? "text-red-500"
      : "text-yellow-500";

  const changeColor = data.changeFromOpen >= 0 ? "text-green-500" : "text-red-500";
  const changeSign = data.changeFromOpen >= 0 ? "+" : "";

  return (
    <Card className="overflow-visible" data-testid="card-market-analysis">
      <button
        className="w-full text-left p-3 flex items-center gap-3 flex-wrap cursor-pointer"
        onClick={() => setExpanded(!expanded)}
        data-testid="button-toggle-analysis"
      >
        <div className="flex items-center gap-2 shrink-0">
          <TrendIcon trend={data.trend} className={`w-4 h-4 ${trendColor}`} />
          <span className={`font-bold text-sm ${trendColor}`} data-testid="badge-trend">{data.trend}</span>
          <Badge variant="secondary" className="text-[10px]" data-testid="badge-strength">{data.trendStrength}</Badge>
        </div>

        <span className="text-xs text-muted-foreground truncate flex-1 min-w-0" data-testid="text-headline">
          {data.headline}
        </span>

        <div className="flex items-center gap-3 shrink-0">
          <span className="font-mono text-xs font-medium" data-testid="text-spot-price">
            {data.spotPrice.toLocaleString("en-IN", { maximumFractionDigits: 1 })}
          </span>
          <span className={`font-mono text-xs font-medium ${changeColor}`} data-testid="text-change">
            {changeSign}{data.changeFromOpen.toFixed(2)}%
          </span>
          <span className={`font-mono text-xs font-bold ${trendColor}`} data-testid="text-probability">
            {data.probability}%
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 flex flex-col gap-3 border-t border-border pt-3" data-testid="section-analysis-details">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden flex">
              <div
                className="h-full bg-green-500 transition-all duration-500"
                style={{ width: `${data.bullishPct}%` }}
                data-testid="bar-bullish"
              />
              <div
                className="h-full bg-red-500 transition-all duration-500"
                style={{ width: `${data.bearishPct}%` }}
                data-testid="bar-bearish"
              />
            </div>
            <span className="text-[10px] text-green-500 font-mono shrink-0">{data.bullishPct}%</span>
            <span className="text-[10px] text-muted-foreground">/</span>
            <span className="text-[10px] text-red-500 font-mono shrink-0">{data.bearishPct}%</span>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed" data-testid="text-summary">
            {data.summary}
          </p>

          {data.observations.length > 0 && (
            <div className="flex flex-col gap-1" data-testid="section-observations">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Key Observations</span>
              {data.observations.map((obs, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px] text-foreground" data-testid={`text-observation-${i}`}>
                  <span className="text-muted-foreground shrink-0">-</span>
                  <span>{obs}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-1" data-testid="section-factors">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Indicator Breakdown</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {data.factors.map((f, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px]" data-testid={`factor-${i}`}>
                  <SignalDot signal={f.signal} />
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium text-foreground">{f.label}</span>
                    <span className="text-muted-foreground">{f.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 text-[10px] text-muted-foreground border-t border-border pt-2 flex-wrap" data-testid="section-stats">
            <span>Open: {data.dayOpen.toLocaleString("en-IN", { maximumFractionDigits: 1 })}</span>
            <span>H: {data.dayHigh.toLocaleString("en-IN", { maximumFractionDigits: 1 })}</span>
            <span>L: {data.dayLow.toLocaleString("en-IN", { maximumFractionDigits: 1 })}</span>
            <span>ATR: {data.atr.toFixed(1)}</span>
            <span>Range: {(data.dayHigh - data.dayLow).toFixed(1)}</span>
            {data.candlesAnalyzed && <span>Candles: {data.candlesAnalyzed}</span>}
          </div>
        </div>
      )}
    </Card>
  );
}
