import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Target, Activity, Zap, BarChart3, Clock, Grid2X2, Brain } from "lucide-react";
import type { Signal } from "@shared/schema";
import { calculateWinRate, calculateTotalPnl, getActiveSignals, safeDivide } from "@shared/utils";

interface StatsCardsProps {
  signals: Signal[];
}

export function StatsCards({ signals }: StatsCardsProps) {
  const activeCount = getActiveSignals(signals).length;
  const targetHits = signals.filter((s) => s.status.startsWith("target")).length;
  const slHits = signals.filter((s) => s.status === "sl_hit").length;
  const expiredCount = signals.filter((s) => s.status === "expired").length;
  const totalPnl = calculateTotalPnl(signals);
  const winRate = calculateWinRate(signals).toFixed(1);
  const avgConfidence = signals.length > 0
    ? (signals.reduce((sum, s) => sum + (s.confidence || 0), 0) / signals.length).toFixed(0)
    : "0";
  const avgRegimeConfidence = signals.length > 0
    ? safeDivide(
        signals.reduce((sum, s) => sum + (s.regimeConfidence || 0), 0),
        signals.length,
        0
      ).toFixed(0)
    : "0";

  const stats = [
    {
      label: "Active Signals",
      value: activeCount,
      icon: Activity,
      color: "text-chart-2",
    },
    {
      label: "Total P&L",
      value: `${totalPnl >= 0 ? "+" : "-"}₹${Math.abs(totalPnl).toFixed(2)}`,
      icon: totalPnl >= 0 ? TrendingUp : TrendingDown,
      color: totalPnl >= 0 ? "text-chart-3" : "text-destructive",
    },
    {
      label: "Win Rate",
      value: `${winRate}%`,
      icon: Target,
      color: "text-chart-4",
    },
    {
      label: "Total Trades",
      value: signals.length,
      icon: Grid2X2,
      color: "text-chart-1",
    },
    {
      label: "Avg Confidence",
      value: `${avgConfidence}%`,
      icon: BarChart3,
      color: "text-primary",
    },
    {
      label: "Regime AI",
      value: `${avgRegimeConfidence}%`,
      icon: Brain,
      color: "text-chart-5",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-8 gap-3" data-testid="stats-cards">
      {stats.map((stat) => (
        <Card key={stat.label} className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <stat.icon className={`w-4 h-4 ${stat.color}`} />
            <span className="text-xs text-muted-foreground truncate">{stat.label}</span>
          </div>
          <div className={`text-lg font-mono font-bold ${stat.color}`} data-testid={`text-stat-${stat.label.toLowerCase().replace(/\s/g, "-")}`}>
            {stat.value}
          </div>
        </Card>
      ))}
      
      {/* Combined Exit Stats Card - Table View */}
      <Card className="p-3 lg:col-span-1">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="w-4 h-4 text-chart-1" />
          <span className="text-xs text-muted-foreground font-semibold">Exit Status</span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-left py-1 text-muted-foreground font-medium">Targets</th>
              <th className="text-center py-1 text-muted-foreground font-medium">SL</th>
              <th className="text-right py-1 text-muted-foreground font-medium">Expired</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="text-left py-1.5 font-mono font-bold text-chart-3">{targetHits}</td>
              <td className="text-center py-1.5 font-mono font-bold text-destructive">{slHits}</td>
              <td className="text-right py-1.5 font-mono font-bold text-muted-foreground">{expiredCount}</td>
            </tr>
          </tbody>
        </table>
      </Card>
    </div>
  );
}
