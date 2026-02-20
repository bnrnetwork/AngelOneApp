import { useQuery } from "@tanstack/react-query";
import { SignalTable } from "@/components/signal-table";
import { StatsCards } from "@/components/stats-cards";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { STRATEGIES, STRATEGY_COLORS } from "@/lib/constants";
import { useWebSocket } from "@/hooks/use-websocket";
import { queryClient } from "@/lib/queryClient";
import type { Signal } from "@shared/schema";

interface StrategySignalsProps {
  strategyKey: string;
}

export default function StrategySignals({ strategyKey }: StrategySignalsProps) {
  const strategy = STRATEGIES.find((s) => s.key === strategyKey);

  const { data: signals = [], isLoading } = useQuery<Signal[]>({
    queryKey: ["/api/signals", strategyKey],
    refetchInterval: 5000,
  });

  useWebSocket("signal_update", () => {
    queryClient.invalidateQueries({ queryKey: ["/api/signals", strategyKey] });
    queryClient.invalidateQueries({ queryKey: ["/api/signals"] });
  });

  useWebSocket("price_update", (data: { id: string; currentPrice: number; pnl: number }) => {
    queryClient.setQueryData<Signal[]>(["/api/signals", strategyKey], (old) => {
      if (!old) return old;
      return old.map((s) =>
        s.id === data.id ? { ...s, currentPrice: data.currentPrice, pnl: data.pnl } : s
      );
    });
    queryClient.setQueryData<Signal[]>(["/api/signals"], (old) => {
      if (!old) return old;
      return old.map((s) =>
        s.id === data.id ? { ...s, currentPrice: data.currentPrice, pnl: data.pnl } : s
      );
    });
  });

  const activeCount = signals.filter((s) => s.status === "active").length;
  const color = STRATEGY_COLORS[strategyKey] || "hsl(217, 91%, 45%)";

  if (!strategy) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Strategy not found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 max-w-full overflow-y-auto h-full">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
        <h1 className="text-xl font-bold tracking-tight" data-testid="text-page-title">{strategy.name}</h1>
        <Badge variant="secondary" className="text-[10px]">{activeCount} active</Badge>
      </div>

      <Card className="p-3">
        <p className="text-sm text-muted-foreground" data-testid="text-strategy-description">{strategy.description}</p>
      </Card>

      <StatsCards signals={signals} />

      <SignalTable signals={signals} loading={isLoading} />
    </div>
  );
}
