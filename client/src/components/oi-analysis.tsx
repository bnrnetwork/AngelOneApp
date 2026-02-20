import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Eye, ShieldAlert, TrendingUp, TrendingDown, AlertTriangle, Activity } from "lucide-react";

interface OIAnalysisData {
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

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 70 ? "bg-green-500" : value >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${color} transition-all duration-500 rounded-full`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-mono font-bold shrink-0" data-testid="text-oi-confidence-score">{value}/100</span>
    </div>
  );
}

function getDirectionInfo(dir: string) {
  switch (dir) {
    case "BUY_CE":
      return { label: "Buy CE", color: "text-chart-3", icon: TrendingUp, badgeClass: "bg-green-500/15 text-green-700 dark:text-green-400 border-transparent" };
    case "BUY_PE":
      return { label: "Buy PE", color: "text-destructive", icon: TrendingDown, badgeClass: "bg-red-500/15 text-red-700 dark:text-red-400 border-transparent" };
    default:
      return { label: "No Trade", color: "text-muted-foreground", icon: ShieldAlert, badgeClass: "bg-muted text-muted-foreground border-transparent" };
  }
}

function getMatrixBadge(matrix: string) {
  switch (matrix) {
    case "STRONG_BULLISH":
      return <Badge variant="outline" className="text-[10px] bg-green-500/15 text-green-700 dark:text-green-400 border-transparent">Strong Bullish</Badge>;
    case "STRONG_BEARISH":
      return <Badge variant="outline" className="text-[10px] bg-red-500/15 text-red-700 dark:text-red-400 border-transparent">Strong Bearish</Badge>;
    case "FAKE_BREAKOUT":
      return <Badge variant="outline" className="text-[10px] bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-transparent">Fake Breakout</Badge>;
    case "FAKE_BREAKDOWN":
      return <Badge variant="outline" className="text-[10px] bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-transparent">Fake Breakdown</Badge>;
    default:
      return <Badge variant="secondary" className="text-[10px]">Neutral</Badge>;
  }
}

export function OIAnalysis({ instrument, enabled = true }: { instrument: string; enabled?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading, isError } = useQuery<OIAnalysisData>({
    queryKey: ["/api/oi-analysis", instrument],
    refetchInterval: 60000,
    retry: 1,
    staleTime: 30000,
    enabled: !!instrument && enabled,
  });

  if (isLoading) {
    return (
      <Card className="p-3" data-testid="card-oi-loading">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-primary animate-pulse" />
          <span className="text-xs text-muted-foreground">Loading OI Analysis...</span>
        </div>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card className="p-3" data-testid="card-oi-error">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">OI Analysis unavailable</span>
        </div>
      </Card>
    );
  }

  const dirInfo = getDirectionInfo(data.tradeDirection);
  const DirIcon = dirInfo.icon;

  return (
    <Card className="p-3" data-testid="card-oi-analysis">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-2 cursor-pointer"
        data-testid="button-toggle-oi"
      >
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <Eye className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-xs font-semibold flex-shrink-0">OI Analysis</span>
          {getMatrixBadge(data.oiMatrix)}
          <Badge variant="outline" className={`text-[10px] ${dirInfo.badgeClass}`} data-testid="badge-oi-direction">
            <DirIcon className="w-3 h-3 mr-0.5" />
            {dirInfo.label}
          </Badge>
          <Badge variant={data.confidence >= 70 ? "default" : data.confidence >= 50 ? "secondary" : "outline"} className="text-[10px]" data-testid="badge-oi-confidence">
            {data.confidence}%
          </Badge>
          {data.fakeBreakout.bullTrap && (
            <Badge variant="outline" className="text-[10px] bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-transparent">
              <AlertTriangle className="w-3 h-3 mr-0.5" />
              Bull Trap
            </Badge>
          )}
          {data.fakeBreakout.bearTrap && (
            <Badge variant="outline" className="text-[10px] bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-transparent">
              <AlertTriangle className="w-3 h-3 mr-0.5" />
              Bear Trap
            </Badge>
          )}
          {data.writerTrap.detected && (
            <Badge variant="outline" className="text-[10px] bg-purple-500/15 text-purple-700 dark:text-purple-400 border-transparent">
              Writer Trap
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[10px] text-muted-foreground hidden sm:inline" data-testid="text-oi-pcr">
            PCR: {data.marketStructure.pcr.toFixed(2)}
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-border pt-3" data-testid="section-oi-details">
          {data.tradeDirection !== "NO_TRADE" && (
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className="text-muted-foreground">Strike:</span>
              <span className="font-semibold" data-testid="text-strike-selection">{data.strikeSelection}</span>
            </div>
          )}

          <ConfidenceBar value={data.confidence} />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs" data-testid="section-oi-stats">
            <div>
              <span className="text-muted-foreground block">Resistance</span>
              <span className="font-semibold text-destructive">{data.marketStructure.resistance}</span>
              <span className="text-[10px] text-muted-foreground ml-1">({(data.marketStructure.highestCEOI / 1000).toFixed(0)}K OI)</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Support</span>
              <span className="font-semibold text-chart-3">{data.marketStructure.support}</span>
              <span className="text-[10px] text-muted-foreground ml-1">({(data.marketStructure.highestPEOI / 1000).toFixed(0)}K OI)</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Spot</span>
              <span className="font-semibold">{data.spotPrice.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">ATM</span>
              <span className="font-semibold">{data.atmStrike}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs" data-testid="section-oi-filters">
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${data.volatilityFilters.volumeSpike ? "bg-green-500" : "bg-red-500"}`} />
              <span className="text-muted-foreground">Volume Spike:</span>
              <span className="font-semibold">{data.volatilityFilters.volumeSpike ? "Yes" : "No"}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <span className="text-muted-foreground">VIX:</span>
              <span className="font-semibold text-[11px]">{data.volatilityFilters.vixDirection}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Total CE OI:</span>
              <span className="font-semibold">{(data.totalCEOI / 1000).toFixed(0)}K</span>
            </div>
          </div>

          <div className="space-y-1.5" data-testid="section-oi-reasons">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Analysis Breakdown</span>
            {data.reasons.map((reason, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs" data-testid={`oi-reason-${i}`}>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${
                  reason.includes("CAUTION") || reason.includes("TRAP") || reason.includes("crush")
                    ? "bg-yellow-500"
                    : reason.includes("Bullish") || reason.includes("BUY CE") || reason.includes("expansion") || reason.includes("spike")
                    ? "bg-green-500"
                    : reason.includes("Bearish") || reason.includes("BUY PE")
                    ? "bg-red-500"
                    : "bg-muted-foreground"
                }`} />
                <span className="text-muted-foreground">{reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
