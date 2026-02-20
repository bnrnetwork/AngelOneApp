import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, TrendingUp, TrendingDown, Minus, Zap } from "lucide-react";

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
  headline: string;
  factors: AnalysisFactor[];
  spotPrice: number;
  changeFromOpen: number;
}

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
  filters: RegimeFilter[];
  spotPrice: number;
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "Uptrend") return <TrendingUp className="w-4 h-4" />;
  if (trend === "Downtrend") return <TrendingDown className="w-4 h-4" />;
  return <Minus className="w-4 h-4" />;
}

function SignalDot({ signal }: { signal: string }) {
  const color = signal === "bullish" ? "bg-green-500" : signal === "bearish" ? "bg-red-500" : "bg-yellow-500";
  return <span className={`inline-block w-2 h-2 rounded-full ${color} shrink-0`} />;
}

export function CombinedMarketAnalysis({ instrument, enabled = true }: { instrument: string; enabled?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  const { data: analysisData, isLoading: analysisLoading } = useQuery<MarketAnalysisData>({
    queryKey: ["/api/market-analysis", instrument],
    refetchInterval: 10000,
    retry: 3,
    retryDelay: 3000,
    enabled: !!instrument && enabled,
  });

  const { data: regimeData, isLoading: regimeLoading } = useQuery<MarketRegimeData>({
    queryKey: ["/api/market-regime", instrument],
    refetchInterval: 10000,
    retry: 3,
    retryDelay: 3000,
    enabled: !!instrument && enabled,
  });

  const isLoading = analysisLoading || regimeLoading;
  const trendColor = analysisData?.trend === "Uptrend"
    ? "text-green-500"
    : analysisData?.trend === "Downtrend"
      ? "text-red-500"
      : "text-yellow-500";

  return (
    <Card className="overflow-visible">
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger className="w-full">
          <div className={`w-full text-left p-3 flex items-center gap-3 flex-wrap cursor-pointer hover:bg-muted/50 transition-colors ${expanded ? "rounded-t-lg" : "rounded-lg"}`}>
            <ChevronDown
              className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
                expanded ? "rotate-0" : "-rotate-90"
              }`}
            />
            {expanded ? (
              <>
                <TrendIcon trend={analysisData?.trend || ""} />
                <span className={`font-semibold text-sm ${trendColor}`}>
                  {analysisData
                    ? `${analysisData.trend} • ${regimeData?.marketType || "..."}`
                    : "Loading Market Analysis & Regime..."}
                </span>
                {analysisData && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    {analysisData.spotPrice.toLocaleString("en-IN", { maximumFractionDigits: 1 })}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="font-semibold text-sm">
                  Market Analysis: <span className={`${trendColor}`}>{analysisData?.trend || "..."}</span>
                </span>
                <span className="font-semibold text-sm ml-4">
                  Market Regime: <span className="text-chart-2">{regimeData?.marketType || "..."}</span>
                </span>
              </>
            )}
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent className="p-3 border-t">
          <div className="grid grid-cols-2 gap-4">
            {/* Market Analysis Section - Left */}
            {analysisData && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <TrendIcon trend={analysisData.trend} />
                  <span className={`font-bold text-sm ${trendColor}`}>{analysisData.trend}</span>
                  <Badge variant="secondary" className="text-[10px]">{analysisData.trendStrength}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{analysisData.headline}</p>
                {analysisData.factors && analysisData.factors.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground">Analysis Factors</h4>
                    {analysisData.factors.map((factor, idx) => (
                      <div key={idx} className="flex gap-2 text-xs">
                        <SignalDot signal={factor.signal} />
                        <div className="flex-1">
                          <div className="font-medium">{factor.label}</div>
                          <div className="text-muted-foreground">{factor.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Market Regime Section - Right */}
            {regimeData && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-chart-2" />
                  <span className="font-semibold text-sm">{regimeData.marketType}</span>
                  <Badge variant={regimeData.confidence === "High" ? "default" : regimeData.confidence === "Medium" ? "secondary" : "outline"} className="text-[10px]">
                    {regimeData.confidence} Confidence
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Score:</span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 rounded-full ${
                        regimeData.score >= 75 ? "bg-green-500" : regimeData.score >= 60 ? "bg-yellow-500" : "bg-red-500"
                      }`}
                      style={{ width: `${Math.min((regimeData.score / regimeData.maxScore) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono font-bold shrink-0">{regimeData.score}/{regimeData.maxScore}</span>
                </div>
                <p className="text-xs text-muted-foreground font-medium italic">{regimeData.action}</p>
                {regimeData.filters && regimeData.filters.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-semibold text-muted-foreground">Regime Filters</h4>
                    {regimeData.filters.map((filter, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs">
                        <div className={`w-3 h-3 rounded shrink-0 mt-0.5 ${filter.met ? "bg-green-500" : "bg-red-500"}`} />
                        <div className="flex-1">
                          <div className="font-medium">{filter.label}</div>
                          <div className="text-muted-foreground">{filter.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

