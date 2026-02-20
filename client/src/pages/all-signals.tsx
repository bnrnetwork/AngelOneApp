import { useQuery } from "@tanstack/react-query";
import { SignalTable } from "@/components/signal-table";
import { Badge } from "@/components/ui/badge";
import { Layers } from "lucide-react";
import { useWebSocket } from "@/hooks/use-websocket";
import { queryClient } from "@/lib/queryClient";
import type { Signal } from "@shared/schema";

export default function AllSignals() {
  const { data: signals = [], isLoading } = useQuery<Signal[]>({
    queryKey: ["/api/signals"],
    refetchInterval: 5000,
  });

  useWebSocket("signal_update", () => {
    queryClient.invalidateQueries({ queryKey: ["/api/signals"] });
  });

  useWebSocket("price_update", (data: { id: string; currentPrice: number; pnl: number }) => {
    queryClient.setQueryData<Signal[]>(["/api/signals"], (old) => {
      if (!old) return old;
      return old.map((s) =>
        s.id === data.id ? { ...s, currentPrice: data.currentPrice, pnl: data.pnl } : s
      );
    });
  });

  const activeCount = signals.filter((s) => s.status === "active").length;
  const totalCount = signals.length;

  return (
    <div className="flex flex-col gap-4 p-4 max-w-full h-full">
      <div className="flex items-center gap-2 flex-wrap">
        <Layers className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-bold tracking-tight" data-testid="text-page-title">All Signals</h1>
        <Badge variant="secondary" className="text-[10px]" data-testid="badge-active-count">{activeCount} active</Badge>
        <Badge variant="outline" className="text-[10px]">{totalCount} total</Badge>
      </div>
      <p className="text-sm text-muted-foreground">All signals generated today. Click column headers to sort. Active orders displayed first.</p>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="pr-4">
          <SignalTable signals={signals} showStrategy loading={isLoading} />
        </div>
      </div>
    </div>
  );
}
