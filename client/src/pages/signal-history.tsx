import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SignalTable } from "@/components/signal-table";
import { StatsCards } from "@/components/stats-cards";
import { History, Trash2, CalendarDays, AlertCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Signal } from "@shared/schema";

function generateLast30Days(): { value: string; label: string }[] {
  const days: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const value = d.toISOString().split("T")[0];
    const label = d.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    days.push({ value, label: i === 0 ? `Today - ${label}` : label });
  }
  return days;
}

export default function SignalHistory() {
  const [selectedDate, setSelectedDate] = useState<string>("");
  const { toast } = useToast();
  const last30Days = generateLast30Days();

  const { data: availableDates = [] } = useQuery<string[]>({
    queryKey: ["/api/signals/dates"],
  });

  const { data: signals = [], isLoading } = useQuery<Signal[]>({
    queryKey: ["/api/signals/history", selectedDate],
    enabled: !!selectedDate,
  });

  const clearMutation = useMutation({
    mutationFn: async (date: string) => {
      const res = await apiRequest("POST", `/api/signals/clear/${date}`);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Signals Cleared",
        description: `Removed ${data.cleared} SL Hit/Expired signals for ${data.date}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/signals/history", selectedDate] });
      queryClient.invalidateQueries({ queryKey: ["/api/signals/dates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/signals"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to clear signals", variant: "destructive" });
    },
  });

  const slHitCount = signals.filter((s) => s.status === "sl_hit").length;
  const expiredCount = signals.filter((s) => s.status === "expired").length;
  const clearableCount = slHitCount + expiredCount;

  const daysWithData = new Set(availableDates);

  return (
    <div className="flex flex-col gap-4 p-4 max-w-full overflow-y-auto h-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold tracking-tight" data-testid="text-page-title">Signal History</h1>
          <Badge variant="secondary" className="text-[10px]">Last 30 Days</Badge>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        View past trading signals day by day. Select a date to see that day's signals and performance.
      </p>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          <Select value={selectedDate} onValueChange={setSelectedDate}>
            <SelectTrigger className="w-[260px]" data-testid="select-date">
              <SelectValue placeholder="Select a date..." />
            </SelectTrigger>
            <SelectContent>
              {last30Days.map((day) => (
                <SelectItem key={day.value} value={day.value} data-testid={`option-date-${day.value}`}>
                  <div className="flex items-center gap-2">
                    <span>{day.label}</span>
                    {daysWithData.has(day.value) && (
                      <span className="w-1.5 h-1.5 rounded-full bg-chart-3 inline-block flex-shrink-0" />
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedDate && clearableCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => clearMutation.mutate(selectedDate)}
            disabled={clearMutation.isPending}
            data-testid="button-clear-signals"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            Clear {clearableCount} ({slHitCount} SL + {expiredCount} Expired)
          </Button>
        )}
      </div>

      {!selectedDate ? (
        <Card className="p-8 flex flex-col items-center gap-3">
          <CalendarDays className="w-10 h-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground text-center">Select a date from the dropdown to view that day's trading signals and performance.</p>
          {availableDates.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {availableDates.length} day{availableDates.length > 1 ? "s" : ""} with signal data available
            </p>
          )}
        </Card>
      ) : isLoading ? (
        <Card className="p-4">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
            ))}
          </div>
        </Card>
      ) : signals.length === 0 ? (
        <Card className="p-8 flex flex-col items-center gap-3">
          <AlertCircle className="w-8 h-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No signals found for {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        </Card>
      ) : (
        <>
          <StatsCards signals={signals} />

          <div>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-semibold">
                Signals for {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
              </h2>
              <Badge variant="secondary" className="text-[10px]">{signals.length} total</Badge>
            </div>
            <SignalTable signals={signals} showStrategy loading={false} />
          </div>
        </>
      )}
    </div>
  );
}
