import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { LineChart, RefreshCw, ArrowUp, ArrowDown } from "lucide-react";
import { ApiError, queryClient } from "@/lib/queryClient";
import { ALL_INSTRUMENTS } from "@shared/schema";

interface StrikeData {
  strike: number;
  ceLTP: number | null;
  peLTP: number | null;
  ceOI: number;
  peOI: number;
  ceVolume: number;
  peVolume: number;
  ceToken: string | null;
  peToken: string | null;
}

interface OptionChainData {
  spotPrice: number;
  atmStrike: number;
  expiry: string;
  strikes: StrikeData[];
}

interface OptionChainErrorPayload {
  message?: string;
  hint?: string;
  code?: string;
}

function parseOptionChainError(error: unknown): OptionChainErrorPayload {
  if (error instanceof ApiError) {
    const payload = (error.data ?? null) as OptionChainErrorPayload | null;
    return {
      message: payload?.message || error.message,
      hint: payload?.hint,
      code: payload?.code,
    };
  }

  const rawMessage = error instanceof Error ? error.message : String(error ?? "");

  const firstBrace = rawMessage.indexOf("{");
  if (firstBrace !== -1) {
    const jsonPart = rawMessage.slice(firstBrace);
    try {
      const parsed = JSON.parse(jsonPart) as OptionChainErrorPayload;
      return {
        message: parsed.message || rawMessage,
        hint: parsed.hint,
        code: parsed.code,
      };
    } catch {
      return { message: rawMessage };
    }
  }

  return { message: rawMessage };
}

function OptionChainTable({ instrument }: { instrument: string }) {
  const { data, isLoading, isError, error } = useQuery<OptionChainData>({
    queryKey: ["/api/option-chain", instrument],
    refetchInterval: 30000,
    retry: 2,
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/option-chain", instrument] });
  };

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3 text-center">Loading option chain data from AngelOne...</p>
      </Card>
    );
  }

  if (isError || !data) {
    const parsedError = parseOptionChainError(error);
    return (
      <Card className="p-8 flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">Could not load option chain data</p>
        <p className="text-xs text-destructive">{parsedError.message || "AngelOne connection required"}</p>
        {parsedError.hint && (
          <p className="text-xs text-muted-foreground text-center max-w-md">{parsedError.hint}</p>
        )}
        {parsedError.code && (
          <Badge variant="outline" className="text-[10px]">{parsedError.code}</Badge>
        )}
        <Button variant="outline" size="sm" onClick={handleRefresh} data-testid="button-retry-chain">
          <RefreshCw className="w-3 h-3 mr-1" />
          Retry
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs" data-testid={`badge-spot-${instrument}`}>
            Spot: {data.spotPrice.toFixed(2)}
          </Badge>
          <Badge variant="secondary" className="text-xs" data-testid={`badge-atm-${instrument}`}>
            ATM: {data.atmStrike}
          </Badge>
          <Badge variant="outline" className="text-xs" data-testid={`badge-expiry-${instrument}`}>
            Exp: {data.expiry.slice(0, 10)}
          </Badge>
        </div>
        <Button variant="ghost" size="icon" onClick={handleRefresh} data-testid="button-refresh-chain">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border">
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-right text-chart-3">CE OI</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-right text-chart-3">CE Vol</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-right text-chart-3">CE LTP</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-center bg-muted/50">Strike</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-left text-destructive">PE LTP</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-left text-destructive">PE Vol</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-left text-destructive">PE OI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.strikes.map((row) => {
                const isATM = row.strike === data.atmStrike;
                const isITM_CE = row.strike < data.spotPrice;
                const isITM_PE = row.strike > data.spotPrice;

                return (
                  <TableRow
                    key={row.strike}
                    className={`transition-colors ${isATM ? "bg-primary/10 font-bold" : ""}`}
                    data-testid={`row-strike-${row.strike}`}
                  >
                    <TableCell className="text-right font-mono text-xs text-chart-3">
                      {row.ceOI?.toLocaleString() ?? "--"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-chart-3">
                      {row.ceVolume?.toLocaleString() ?? "--"}
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm ${isITM_CE ? "bg-chart-3/5" : ""}`}>
                      <div className="flex items-center justify-end gap-1">
                        {row.ceLTP !== null ? (
                          <>
                            <span className="text-chart-3">{row.ceLTP.toFixed(2)}</span>
                            {isITM_CE && <Badge variant="outline" className="text-[9px] px-1 text-chart-3 border-chart-3 no-default-hover-elevate no-default-active-elevate">ITM</Badge>}
                          </>
                        ) : (
                          <span className="text-muted-foreground">--</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className={`text-center font-mono text-sm font-semibold bg-muted/30 ${isATM ? "text-primary" : ""}`}>
                      <div className="flex items-center justify-center gap-1">
                        {row.strike}
                        {isATM && <Badge variant="default" className="text-[9px] px-1">ATM</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className={`text-left font-mono text-sm ${isITM_PE ? "bg-destructive/5" : ""}`}>
                      <div className="flex items-center gap-1">
                        {row.peLTP !== null ? (
                          <>
                            <span className="text-destructive">{row.peLTP.toFixed(2)}</span>
                            {isITM_PE && <Badge variant="outline" className="text-[9px] px-1 text-destructive border-destructive no-default-hover-elevate no-default-active-elevate">ITM</Badge>}
                          </>
                        ) : (
                          <span className="text-muted-foreground">--</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-left font-mono text-xs text-destructive">
                      {row.peVolume?.toLocaleString() ?? "--"}
                    </TableCell>
                    <TableCell className="text-left font-mono text-xs text-destructive">
                      {row.peOI?.toLocaleString() ?? "--"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

export default function OptionCharts() {
  const [activeTab, setActiveTab] = useState("NIFTY");

  return (
    <div className="flex flex-col gap-4 p-4 max-w-full overflow-y-auto h-full">
      <div className="flex items-center gap-2 flex-wrap">
        <LineChart className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-bold tracking-tight" data-testid="text-page-title">Option Chain</h1>
        <Badge variant="secondary" className="text-[10px]" data-testid="badge-chain-type">Live Data</Badge>
      </div>
      <p className="text-sm text-muted-foreground">Real-time option chain with CE/PE prices from AngelOne.</p>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className={`grid w-full max-w-lg`} style={{ gridTemplateColumns: `repeat(${ALL_INSTRUMENTS.length}, 1fr)` }} data-testid="tabs-chain-selector">
          {ALL_INSTRUMENTS.map((inst) => (
            <TabsTrigger key={inst.key} value={inst.key} className="text-xs font-semibold" data-testid={`tab-${inst.key.toLowerCase()}`}>
              {inst.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {ALL_INSTRUMENTS.map((inst) => (
          <TabsContent key={inst.key} value={inst.key} className="mt-4">
            {activeTab === inst.key && <OptionChainTable instrument={inst.key} />}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
