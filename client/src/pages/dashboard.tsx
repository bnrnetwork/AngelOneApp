import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatsCards } from "@/components/stats-cards";
import { SignalTable } from "@/components/signal-table";
import { Play, Square, TrendingUp, Activity, Zap, Wifi, WifiOff, Radio, ChevronDown, IndianRupee } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useWebSocket } from "@/hooks/use-websocket";
import { CombinedMarketAnalysis } from "@/components/combined-market-analysis";
import { OIAnalysis } from "@/components/oi-analysis";
import type { Signal } from "@shared/schema";
import { ALL_INSTRUMENTS, CAPITAL_OPTIONS } from "@shared/schema";
import { DEFAULT_CAPITAL, MARKET_OPEN_HOUR, MARKET_OPEN_MINUTE } from "@shared/config";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_CAPITAL_KEY = "algotrader_default_capital";
const MARKET_OPEN_NOTICE_KEY = "algotrader_market_open_notice";

function getIstTimeParts(): { hour: number; minute: number; date: string } {
  const formatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const values = parts.reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});
  const hour = Number(values.hour ?? "0");
  const minute = Number(values.minute ?? "0");
  const date = `${values.year}-${values.month}-${values.day}`;
  return { hour, minute, date };
}

function getStoredDefaultCapital(): number {
  try {
    const val = localStorage.getItem(DEFAULT_CAPITAL_KEY);
    const parsed = val ? parseInt(val, 10) : NaN;
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_CAPITAL;
    return parsed === 10000 ? DEFAULT_CAPITAL : parsed;
  } catch {
    return DEFAULT_CAPITAL;
  }
}

export default function Dashboard() {
  const [selectedInstruments, setSelectedInstruments] = useState<string[]>(["NIFTY"]);
  const [selectedCapital, setSelectedCapital] = useState<number>(getStoredDefaultCapital());
  const [defaultCapitalInput, setDefaultCapitalInput] = useState<string>(
    String(Math.round(getStoredDefaultCapital() / 1000))
  );
  const [mode, setMode] = useState<"live" | "backtest">("live");
  const [backtestStartDate, setBacktestStartDate] = useState<string>("");
  const [backtestEndDate, setBacktestEndDate] = useState<string>("");
  const capitalSyncedRef = useRef(false);
  const { toast } = useToast();

  const { data: status } = useQuery<{
    running: boolean;
    instruments: string[];
    instrument: string | null;
    connected: boolean;
    streaming?: boolean;
    capital?: number;
    defaultCapital?: number;
  }>({
    queryKey: ["/api/engine/status"],
    refetchInterval: 5000,
  });

  const { data: signals = [], isLoading } = useQuery<Signal[]>({
    queryKey: ["/api/signals"],
    refetchInterval: 10000,
  });

  const { data: balance } = useQuery<any>({
    queryKey: ["/api/balance"],
  });

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DEFAULT_CAPITAL_KEY);
      if (stored && parseInt(stored, 10) === 10000) {
        localStorage.setItem(DEFAULT_CAPITAL_KEY, String(DEFAULT_CAPITAL));
      }
    } catch {
      // Ignore storage errors to avoid breaking the dashboard.
    }
  }, []);

  useEffect(() => {
    const checkMarketOpen = () => {
      const { hour, minute, date } = getIstTimeParts();
      if (hour !== MARKET_OPEN_HOUR || minute !== MARKET_OPEN_MINUTE) return;
      const lastShown = localStorage.getItem(MARKET_OPEN_NOTICE_KEY);
      if (lastShown === date) return;
      localStorage.setItem(MARKET_OPEN_NOTICE_KEY, date);
      toast({ title: "Market Open", description: "Have a Profitable Message" });
    };

    checkMarketOpen();
    const intervalId = window.setInterval(checkMarketOpen, 30000);
    return () => window.clearInterval(intervalId);
  }, [toast]);

  // Sync capital with API response on first load
  useEffect(() => {
    if (!capitalSyncedRef.current && status?.capital !== undefined) {
      setSelectedCapital(status.capital);
      setDefaultCapitalInput(String(Math.round(status.capital / 1000)));
      capitalSyncedRef.current = true;
    }
  }, [status?.capital]);

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

  useWebSocket("engine_status", () => {
    queryClient.invalidateQueries({ queryKey: ["/api/engine/status"] });
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        instruments: selectedInstruments,
        capital: selectedCapital,
        mode,
      };

      if (mode === "backtest") {
        if (!backtestStartDate || !backtestEndDate) {
          throw new Error("Please select both start and end dates for backtest");
        }
        payload.startDate = backtestStartDate;
        payload.endDate = backtestEndDate;
      }

      const res = await apiRequest("POST", "/api/engine/start", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/engine/status"] });
      const modeText = mode === "live" ? "Live Trading" : `Backtest (${backtestStartDate} to ${backtestEndDate})`;
      toast({ title: "Engine Started", description: `${modeText} on ${selectedInstruments.join(", ")}` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const stopMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/engine/stop");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/engine/status"] });
      toast({ title: "Engine Stopped", description: "All strategies paused" });
    },
  });

  const capitalMutation = useMutation({
    mutationFn: async (capital: number) => {
      const res = await apiRequest("POST", "/api/capital", { capital });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/engine/status"] });
    },
  });

  const exitAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/signals/bulk/exit-all");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/signals"] });
      toast({ title: "Success", description: `Exited ${data.count} positions` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const exitProfitsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/signals/bulk/exit-profits");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/signals"] });
      toast({ title: "Success", description: `Exited ${data.count} profitable positions` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const exitLossesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/signals/bulk/exit-losses");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/signals"] });
      toast({ title: "Success", description: `Exited ${data.count} loss positions` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const exitSignalMutation = useMutation({
    mutationFn: async (signalId: string) => {
      const signal = signals.find((s) => s.id === signalId);
      const exitPrice = signal?.currentPrice && signal.currentPrice > 0
        ? signal.currentPrice
        : (signal?.entryPrice || 0);
      const res = await apiRequest("POST", `/api/signals/${signalId}/exit`, { exitPrice });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/signals"] });
      toast({ title: "Success", description: "Position exited successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleCapitalChange = (value: string) => {
    const numVal = parseInt(value, 10);
    setSelectedCapital(numVal);
    capitalMutation.mutate(numVal);
  };

  const handleDefaultCapitalSave = () => {
    const numVal = parseInt(defaultCapitalInput, 10);
    if (isNaN(numVal) || numVal <= 0) {
      toast({ title: "Invalid", description: "Enter a valid number in thousands", variant: "destructive" });
      return;
    }
    const capitalValue = numVal * 1000;
    localStorage.setItem(DEFAULT_CAPITAL_KEY, String(capitalValue));
    setSelectedCapital(capitalValue);
    capitalMutation.mutate(capitalValue);
    toast({ title: "Default Updated", description: `Default capital set to ${numVal}K` });
  };

  const toggleInstrument = (instrument: string) => {
    setSelectedInstruments((prev) => {
      if (prev.includes(instrument)) {
        if (prev.length === 1) return prev;
        return prev.filter((i) => i !== instrument);
      }
      return [...prev, instrument];
    });
  };

  const isRunning = status?.running ?? false;
  const activeSignals = signals.filter((s) => s.status === "active");
  const recentSignals = signals.slice(0, 10);
  const runningInstruments = status?.instruments || [];
  const primaryInstrument = runningInstruments[0] || selectedInstruments[0] || "NIFTY";

  return (
    <div className="flex flex-col gap-4 p-4 max-w-full overflow-y-auto h-full">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold tracking-tight" data-testid="text-page-title">Dashboard</h1>
        <p className="text-sm text-muted-foreground">AngelOne Algo Trading Signal Engine</p>
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-[220px] justify-between"
                  disabled={isRunning}
                  data-testid="select-instruments"
                >
                  <span className="truncate text-sm">
                    {selectedInstruments.length === 0
                      ? "Select Instruments"
                      : selectedInstruments.length <= 2
                        ? selectedInstruments.map(i => ALL_INSTRUMENTS.find(x => x.key === i)?.label || i).join(", ")
                        : `${selectedInstruments.length} selected`}
                  </span>
                  <ChevronDown className="w-4 h-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[220px] p-2" align="start">
                <div className="flex flex-col gap-1">
                  {ALL_INSTRUMENTS.map((inst) => (
                    <label
                      key={inst.key}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover-elevate"
                      data-testid={`checkbox-${inst.key.toLowerCase()}`}
                    >
                      <Checkbox
                        checked={selectedInstruments.includes(inst.key)}
                        onCheckedChange={() => toggleInstrument(inst.key)}
                        disabled={isRunning}
                      />
                      <span className="text-sm">{inst.label}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <Select
              value={String(selectedCapital)}
              onValueChange={handleCapitalChange}
              data-testid="select-capital"
            >
              <SelectTrigger className="w-[140px]" data-testid="select-capital-trigger">
                <div className="flex items-center gap-1">
                  <IndianRupee className="w-3 h-3" />
                  <SelectValue placeholder="Capital" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {CAPITAL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)} data-testid={`capital-${opt.label}`}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Default(K):</span>
              <Input
                className="w-[60px] text-center"
                value={defaultCapitalInput}
                onChange={(e) => setDefaultCapitalInput(e.target.value)}
                onBlur={handleDefaultCapitalSave}
                onKeyDown={(e) => e.key === "Enter" && handleDefaultCapitalSave()}
                data-testid="input-default-capital"
              />
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-card">
              <button
                className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
                  mode === "live"
                    ? "bg-green-500 text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setMode("live")}
                disabled={isRunning}
                data-testid="button-mode-live"
              >
                Live
              </button>
              <button
                className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
                  mode === "backtest"
                    ? "bg-blue-500 text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setMode("backtest")}
                disabled={isRunning}
                data-testid="button-mode-backtest"
              >
                Backtest
              </button>
            </div>

            {mode === "backtest" && !isRunning && (
              <>
                <Input
                  type="date"
                  value={backtestStartDate}
                  onChange={(e) => setBacktestStartDate(e.target.value)}
                  className="w-[150px]"
                  placeholder="Start Date"
                  data-testid="input-backtest-start"
                />
                <Input
                  type="date"
                  value={backtestEndDate}
                  onChange={(e) => setBacktestEndDate(e.target.value)}
                  className="w-[150px]"
                  placeholder="End Date"
                  data-testid="input-backtest-end"
                />
              </>
            )}

            {!isRunning ? (
              <Button
                onClick={() => startMutation.mutate()}
                disabled={selectedInstruments.length === 0 || startMutation.isPending}
                data-testid="button-start"
              >
                <Play className="w-4 h-4 mr-1" />
                {startMutation.isPending ? "Starting..." : "Proceed"}
              </Button>
            ) : (
              <>
                <Button
                  variant="destructive"
                  onClick={() => stopMutation.mutate()}
                  disabled={stopMutation.isPending}
                  data-testid="button-stop"
                >
                  <Square className="w-4 h-4 mr-1" />
                  Stop
                </Button>

                <Button
                  variant="outline"
                  onClick={() => exitAllMutation.mutate()}
                  disabled={exitAllMutation.isPending || activeSignals.length === 0}
                  className="border-red-500 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                  data-testid="button-exit-all"
                >
                  Exit All
                </Button>

                <Button
                  variant="outline"
                  onClick={() => exitProfitsMutation.mutate()}
                  disabled={exitProfitsMutation.isPending || activeSignals.filter(s => (s.pnl ?? 0) > 0).length === 0}
                  className="border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
                  data-testid="button-exit-profits"
                >
                  Exit Profits
                </Button>

                <Button
                  variant="outline"
                  onClick={() => exitLossesMutation.mutate()}
                  disabled={exitLossesMutation.isPending || activeSignals.filter(s => (s.pnl ?? 0) < 0).length === 0}
                  className="border-red-500 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                  data-testid="button-exit-losses"
                >
                  Exit Losses
                </Button>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {isRunning && runningInstruments.length > 0 && (
              <Badge variant="outline" className="text-chart-3 border-chart-3 gap-1" data-testid="badge-running">
                <Activity className="w-3 h-3" />
                Running: {runningInstruments.join(", ")}
              </Badge>
            )}
            <Badge variant={status?.connected ? "outline" : "secondary"} className={status?.connected ? "text-chart-3 border-chart-3 gap-1" : "gap-1"} data-testid="badge-connection">
              {status?.connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {status?.connected ? "Connected" : "Disconnected"}
            </Badge>
            {isRunning && status?.streaming && (
              <Badge variant="outline" className="text-chart-2 border-chart-2 gap-1 animate-pulse" data-testid="badge-streaming">
                <Radio className="w-3 h-3" />
                Live Ticks
              </Badge>
            )}
            {selectedCapital > 0 && (
              <Badge variant="secondary" data-testid="badge-capital">
                Capital: {selectedCapital >= 100000
                  ? `${(selectedCapital / 100000).toFixed(selectedCapital % 100000 === 0 ? 0 : 2)}L`
                  : `${selectedCapital / 1000}K`}
              </Badge>
            )}
          </div>
        </div>
      </Card>

      {balance && (
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm text-muted-foreground">Available:</span>
              <span className="font-mono font-bold text-sm" data-testid="text-available-balance">
                {balance.availablecash ? `₹${parseFloat(balance.availablecash).toLocaleString("en-IN")}` : "--"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-chart-3" />
              <span className="text-sm text-muted-foreground">Net:</span>
              <span className="font-mono font-bold text-sm" data-testid="text-net-balance">
                {balance.net ? `₹${parseFloat(balance.net).toLocaleString("en-IN")}` : "--"}
              </span>
            </div>
          </div>
        </Card>
      )}

      <CombinedMarketAnalysis instrument={primaryInstrument} />

      <StatsCards signals={signals} />

      <OIAnalysis instrument={primaryInstrument} />

      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold">Recent Signals</h2>
          <Badge variant="secondary" className="text-[10px]">{activeSignals.length} active</Badge>
        </div>
        <SignalTable signals={recentSignals} showStrategy loading={isLoading} onExitSignal={exitSignalMutation.mutate} isExiting={exitSignalMutation.isPending} />
      </div>
    </div>
  );
}
