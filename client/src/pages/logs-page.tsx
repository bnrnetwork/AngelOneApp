import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollText, RefreshCw, AlertCircle, Info, AlertTriangle, CheckCircle } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useWebSocket } from "@/hooks/use-websocket";
import type { Log } from "@shared/schema";

function getLevelIcon(level: string) {
  switch (level) {
    case "error":
      return <AlertCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />;
    case "warn":
      return <AlertTriangle className="w-3.5 h-3.5 text-chart-4 flex-shrink-0" />;
    case "success":
      return <CheckCircle className="w-3.5 h-3.5 text-chart-3 flex-shrink-0" />;
    default:
      return <Info className="w-3.5 h-3.5 text-primary flex-shrink-0" />;
  }
}

function getLevelColor(level: string) {
  switch (level) {
    case "error":
      return "text-destructive";
    case "warn":
      return "text-chart-4";
    case "success":
      return "text-chart-3";
    default:
      return "text-foreground";
  }
}

export default function LogsPage() {
  const { data: logs = [], isLoading } = useQuery<Log[]>({
    queryKey: ["/api/logs"],
    refetchInterval: 5000,
  });

  useWebSocket("log", () => {
    queryClient.invalidateQueries({ queryKey: ["/api/logs"] });
  });

  return (
    <div className="flex flex-col gap-4 p-4 max-w-full overflow-y-auto h-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ScrollText className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold tracking-tight" data-testid="text-page-title">System Logs</h1>
          <Badge variant="secondary" className="text-[10px]">{logs.length} entries</Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/logs"] })}
          data-testid="button-refresh-logs"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1" />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <Card className="p-4">
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-6 bg-muted rounded animate-pulse" />
            ))}
          </div>
        </Card>
      ) : logs.length === 0 ? (
        <Card className="p-8 flex flex-col items-center gap-2">
          <ScrollText className="w-8 h-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No log entries yet</p>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-y-auto max-h-[calc(100vh-200px)]">
            <div className="font-mono text-xs divide-y divide-border" data-testid="log-entries">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-2 px-3 py-2"
                  data-testid={`row-log-${log.id}`}
                >
                  {getLevelIcon(log.level)}
                  <span className="text-muted-foreground whitespace-nowrap flex-shrink-0">
                    {(() => {
                      const date = new Date(log.createdAt);
                      let hours = date.getUTCHours();
                      const minutes = String(date.getUTCMinutes()).padStart(2, '0');
                      const seconds = String(date.getUTCSeconds()).padStart(2, '0');
                      const ampm = hours >= 12 ? 'PM' : 'AM';
                      hours = hours % 12 || 12;
                      return `${String(hours).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`;
                    })()}
                  </span>
                  <Badge variant="outline" className="text-[9px] px-1 flex-shrink-0">{log.source}</Badge>
                  <span className={`${getLevelColor(log.level)} break-all`}>{log.message}</span>
                  {log.data && (
                    <span className="text-muted-foreground break-all ml-1">{log.data}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
