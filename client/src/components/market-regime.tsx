import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Zap, Shield, AlertTriangle, Target } from "lucide-react";

interface RegimeFilter {
  label: string;
  met: boolean;
  score: number;
  detail: string;
}

interface MarketRegimeData {
  instrument: string;
  marketType: string;
  confidence: "High" | "Medium" | "Low";
  score: number;
  maxScore: number;
  tradeDirection: "CE" | "PE" | "Avoid";
  action: string;
  suggestedSL: number;
  suggestedTarget: number;
  filters: RegimeFilter[];
  spotPrice: number;
  vwap: number;
  atr: number;
  adx: number;
  vix: number;
  openingRange: number;
  dayHigh: number;
  dayLow: number;
  candlesAnalyzed: number;
  updatedAt: string;
}

function ScoreBar({ score, maxScore }: { score: number; maxScore: number }) {
  const pct = Math.min((score / maxScore) * 100, 100);
  const color = score >= 75 ? "bg-green-500" : score >= 60 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${color} transition-all duration-500 rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono font-bold shrink-0" data-testid="text-regime-score">{score}/{maxScore}</span>
    </div>
  );
}

export function MarketRegime({ instrument }: { instrument: string }) {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useQuery<MarketRegimeData>({
    queryKey: ["/api/market-regime", instrument],
    refetchInterval: 10000,
    retry: 3,
    retryDelay: 3000,
    enabled: !!instrument,
  });

  if (isLoading || !data) {
    return (
      <Card className="p-3" data-testid="card-regime-loading">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-muted-foreground animate-pulse" />
          <span className="text-sm text-muted-foreground">
            {isLoading ? "Loading trade decision engine..." : "Waiting for regime data..."}
          </span>
        </div>
      </Card>
    );
  }

  const directionColor = data.tradeDirection === "CE"
    ? "text-green-500"
    : data.tradeDirection === "PE"
      ? "text-red-500"
      : "text-yellow-500";

  const confidenceVariant = data.confidence === "High"
    ? "default"
    : data.confidence === "Medium"
      ? "secondary"
      : "outline";

  const marketTypeColor = data.marketType.includes("UPTREND")
    ? "text-green-500"
    : data.marketType.includes("DOWNTREND")
      ? "text-red-500"
      : "text-yellow-500";

  const DirectionIcon = data.tradeDirection === "CE"
    ? Target
    : data.tradeDirection === "PE"
      ? AlertTriangle
      : Shield;

  return (
    <Card className="overflow-visible" data-testid="card-market-regime">
      <button
        className="w-full text-left p-3 flex items-center gap-3 flex-wrap cursor-pointer"
        onClick={() => setExpanded(!expanded)}
        data-testid="button-toggle-regime"
      >
        <div className="flex items-center gap-2 shrink-0">
          <DirectionIcon className={`w-4 h-4 ${directionColor}`} />
          <span className={`font-bold text-sm ${marketTypeColor}`} data-testid="text-market-type">
            {data.marketType}
          </span>
          <Badge variant={confidenceVariant} className="text-[10px]" data-testid="badge-confidence">
            {data.confidence}
          </Badge>
        </div>

        <span className={`text-xs font-medium truncate flex-1 min-w-0 ${directionColor}`} data-testid="text-trade-direction">
          {data.tradeDirection === "Avoid" ? "No Trade" : `Buy ATM ${data.tradeDirection}`}
        </span>

        <div className="flex items-center gap-3 shrink-0">
          <span className="font-mono text-xs" data-testid="text-regime-score-compact">
            Score: {data.score}/{data.maxScore}
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 flex flex-col gap-3 border-t border-border pt-3" data-testid="section-regime-details">
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground" data-testid="text-action">{data.action}</p>
            <ScoreBar score={data.score} maxScore={data.maxScore} />
          </div>

          {data.tradeDirection !== "Avoid" && data.suggestedSL > 0 && (
            <div className="flex items-center gap-4 text-xs">
              <span className="text-red-500 font-medium" data-testid="text-sl">SL: {data.suggestedSL.toFixed(1)} pts</span>
              <span className="text-green-500 font-medium" data-testid="text-target">Target: {data.suggestedTarget.toFixed(1)} pts (1:2 RR)</span>
            </div>
          )}

          <div className="flex flex-col gap-1.5" data-testid="section-filters">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Regime Filters</span>
            {data.filters.map((f, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px]" data-testid={`filter-${i}`}>
                <span className={`inline-block w-2 h-2 rounded-full shrink-0 mt-1 ${f.met ? "bg-green-500" : "bg-red-500"}`} />
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-foreground">{f.label}</span>
                    {f.met && f.score > 0 && (
                      <span className="text-[9px] text-green-500 font-mono">+{f.score}</span>
                    )}
                  </div>
                  <span className="text-muted-foreground">{f.detail}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 text-[10px] text-muted-foreground border-t border-border pt-2 flex-wrap" data-testid="section-regime-stats">
            <span>ADX: {data.adx.toFixed(1)}</span>
            <span>ATR: {data.atr.toFixed(1)}</span>
            {data.vix > 0 && <span>VIX: {data.vix.toFixed(2)}</span>}
            <span>ORB: {data.openingRange.toFixed(2)}%</span>
            <span>VWAP: {data.vwap.toFixed(1)}</span>
            <span>Candles: {data.candlesAnalyzed}</span>
          </div>
        </div>
      )}
    </Card>
  );
}
