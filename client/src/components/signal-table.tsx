import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowUp, ArrowDown, Clock, Target, ShieldAlert, TrendingUp, TrendingDown, RotateCcw, X, Loader2 } from "lucide-react";
import type { Signal } from "@shared/schema";
import { STATUS_LABELS, STRATEGY_COLORS, getStrategyLabel, formatIstTime } from "@/lib/constants";

function getStatusBadge(status: string) {
  switch (status) {
    case "active":
      return <Badge variant="default" className="bg-chart-2 text-white border-transparent" data-testid={`badge-status-${status}`}><Clock className="w-3 h-3 mr-1" />Active</Badge>;
    case "target1_hit":
    case "target2_hit":
    case "target3_hit":
      return <Badge variant="default" className="bg-chart-3 text-white border-transparent" data-testid={`badge-status-${status}`}><Target className="w-3 h-3 mr-1" />{STATUS_LABELS[status]}</Badge>;
    case "sl_hit":
      return <Badge variant="destructive" data-testid={`badge-status-${status}`}><ShieldAlert className="w-3 h-3 mr-1" />SL Hit</Badge>;
    case "expired":
    case "closed":
      return <Badge variant="secondary" data-testid={`badge-status-${status}`}>{STATUS_LABELS[status] || "Closed"}</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function ConfidenceMeter({ value }: { value: number }) {
  const color = value >= 75 ? "text-chart-3" : value >= 50 ? "text-chart-4" : "text-destructive";
  return (
    <div className="flex items-center gap-1.5" data-testid="confidence-meter">
      <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${value >= 75 ? "bg-chart-3" : value >= 50 ? "bg-chart-4" : "bg-destructive"}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className={`text-xs font-mono font-semibold ${color}`}>{value}%</span>
    </div>
  );
}

function PnLDisplay({ pnl }: { pnl: number | null }) {
  if (pnl === null || pnl === undefined) return <span className="text-muted-foreground text-xs">--</span>;
  const isPositive = pnl >= 0;
  return (
    <span className={`font-mono text-sm font-semibold flex items-center gap-0.5 ${isPositive ? "text-chart-3" : "text-destructive"}`} data-testid="text-pnl">
      {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {isPositive ? "+" : ""}₹{Math.abs(pnl).toFixed(2)}
    </span>
  );
}

interface SignalTableProps {
  signals: Signal[];
  showStrategy?: boolean;
  loading?: boolean;
  onExitSignal?: (signalId: string) => void;
  isExiting?: boolean;
}

type SortColumn = "strategy" | "instrument" | "option" | "entryPrice" | "currentPrice" | "target1" | "stoploss" | "status" | "pnl" | "confidence" | "entryTime" | "exitTime" | "duration" | null;
type SortDirection = "asc" | "desc";

export function SignalTable({ signals, showStrategy = false, loading = false, onExitSignal, isExiting = false }: SignalTableProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const handleHeaderClick = (column: SortColumn) => {
    if (sortColumn === column) {
      // Toggle sort direction if clicking the same column
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // Set new sort column with desc as default
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  const handleResetSort = () => {
    setSortColumn(null);
    setSortDirection("desc");
  };

  if (loading) {
    return (
      <Card className="p-4">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      </Card>
    );
  }

  // Separate active and closed signals
  let sortedSignals: Signal[] = [];
  if (sortColumn === null) {
    // Default sort: active first, then closed by entry time descending
    const activeSignals = signals.filter((s) => s.status === "active");
    const closedSignals = signals.filter((s) => s.status !== "active");
    const sortedActive = activeSignals.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const sortedClosed = closedSignals.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    sortedSignals = [...sortedActive, ...sortedClosed];
  } else {
    // Apply custom sort
    sortedSignals = [...signals].sort((a, b) => {
      // Always keep active signals first
      if (a.status === "active" && b.status !== "active") return -1;
      if (a.status !== "active" && b.status === "active") return 1;

      let aVal: any, bVal: any;

      switch (sortColumn) {
        case "strategy":
          aVal = a.strategy;
          bVal = b.strategy;
          break;
        case "instrument":
          aVal = a.instrument;
          bVal = b.instrument;
          break;
        case "option":
          aVal = a.strikePrice;
          bVal = b.strikePrice;
          if (aVal === bVal) {
            aVal = a.optionType;
            bVal = b.optionType;
          }
          break;
        case "entryPrice":
          aVal = a.entryPrice ?? 0;
          bVal = b.entryPrice ?? 0;
          break;
        case "currentPrice":
          aVal = a.currentPrice ?? 0;
          bVal = b.currentPrice ?? 0;
          break;
        case "target1":
          aVal = a.target1 ?? 0;
          bVal = b.target1 ?? 0;
          break;
        case "stoploss":
          aVal = a.stoploss ?? 0;
          bVal = b.stoploss ?? 0;
          break;
        case "status":
          aVal = a.status;
          bVal = b.status;
          break;
        case "pnl":
          aVal = a.pnl ?? 0;
          bVal = b.pnl ?? 0;
          break;
        case "confidence":
          aVal = a.confidence ?? 0;
          bVal = b.confidence ?? 0;
          break;
        case "entryTime":
          aVal = new Date(a.createdAt).getTime();
          bVal = new Date(b.createdAt).getTime();
          break;
        case "exitTime":
          aVal = a.closedTime ? new Date(a.closedTime).getTime() : 0;
          bVal = b.closedTime ? new Date(b.closedTime).getTime() : 0;
          break;
        case "duration":
          const aDuration = a.closedTime ? new Date(a.closedTime).getTime() - new Date(a.createdAt).getTime() : 0;
          const bDuration = b.closedTime ? new Date(b.closedTime).getTime() - new Date(b.createdAt).getTime() : 0;
          aVal = aDuration;
          bVal = bDuration;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }

  if (sortedSignals.length === 0) {
    return (
      <Card className="p-8 flex flex-col items-center justify-center gap-2" data-testid="empty-signals">
        <Clock className="w-8 h-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No signals generated yet</p>
        <p className="text-xs text-muted-foreground">Waiting for market conditions to match strategy criteria...</p>
      </Card>
    );
  }

  const renderSortIndicator = (column: SortColumn) => {
    if (sortColumn !== column) return null;
    return sortDirection === "asc" ? (
      <ArrowUp className="w-3 h-3 inline ml-1" />
    ) : (
      <ArrowDown className="w-3 h-3 inline ml-1" />
    );
  };

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border">
              {showStrategy && (
                <TableHead
                  className="text-xs font-semibold uppercase tracking-wider cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => handleHeaderClick("strategy")}
                >
                  Strategy {renderSortIndicator("strategy")}
                </TableHead>
              )}
              <TableHead className="text-xs font-semibold uppercase tracking-wider px-0 w-10">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:bg-transparent"
                  onClick={handleResetSort}
                  title="Reset to default sort"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </Button>
              </TableHead>
              <TableHead
                className="text-xs font-semibold uppercase tracking-wider cursor-pointer hover:bg-accent transition-colors"
                onClick={() => handleHeaderClick("instrument")}
              >
                Instrument {renderSortIndicator("instrument")}
              </TableHead>
              <TableHead
                className="text-xs font-semibold uppercase tracking-wider cursor-pointer hover:bg-accent transition-colors"
                onClick={() => handleHeaderClick("option")}
              >
                Option {renderSortIndicator("option")}
              </TableHead>
              <TableHead
                className="text-xs font-semibold uppercase tracking-wider text-right cursor-pointer hover:bg-accent transition-colors"
                onClick={() => handleHeaderClick("entryPrice")}
              >
                Entry {renderSortIndicator("entryPrice")}
              </TableHead>
              <TableHead
                className="text-xs font-semibold uppercase tracking-wider text-right cursor-pointer hover:bg-accent transition-colors"
                onClick={() => handleHeaderClick("currentPrice")}
              >
                Current {renderSortIndicator("currentPrice")}
              </TableHead>
              <TableHead
                className="text-xs font-semibold uppercase tracking-wider text-right cursor-pointer hover:bg-accent transition-colors"
                onClick={() => handleHeaderClick("target1")}
              >
                Target 1 {renderSortIndicator("target1")}
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-right">T2/T3</TableHead>
              <TableHead
                className="text-xs font-semibold uppercase tracking-wider text-right cursor-pointer hover:bg-accent transition-colors"
                onClick={() => handleHeaderClick("stoploss")}
              >
                SL {renderSortIndicator("stoploss")}
              </TableHead>
              <TableHead
                className="text-xs font-semibold uppercase tracking-wider text-center cursor-pointer hover:bg-accent transition-colors"
                onClick={() => handleHeaderClick("status")}
              >
                Status {renderSortIndicator("status")}
              </TableHead>
              <TableHead
                className="text-xs font-semibold uppercase tracking-wider text-right cursor-pointer hover:bg-accent transition-colors"
                onClick={() => handleHeaderClick("pnl")}
              >
                P&L {renderSortIndicator("pnl")}
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-center">
                Action
              </TableHead>
              <TableHead
                className="text-xs font-semibold uppercase tracking-wider text-center cursor-pointer hover:bg-accent transition-colors"
                onClick={() => handleHeaderClick("confidence")}
              >
                Confidence {renderSortIndicator("confidence")}
              </TableHead>
              <TableHead
                className="text-xs font-semibold uppercase tracking-wider text-right cursor-pointer hover:bg-accent transition-colors"
                onClick={() => handleHeaderClick("entryTime")}
              >
                Entry Time {renderSortIndicator("entryTime")}
              </TableHead>
              <TableHead
                className="text-xs font-semibold uppercase tracking-wider text-right cursor-pointer hover:bg-accent transition-colors"
                onClick={() => handleHeaderClick("exitTime")}
              >
                Exit Time {renderSortIndicator("exitTime")}
              </TableHead>
              <TableHead
                className="text-xs font-semibold uppercase tracking-wider text-right cursor-pointer hover:bg-accent transition-colors"
                onClick={() => handleHeaderClick("duration")}
              >
                Duration {renderSortIndicator("duration")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedSignals.map((signal) => (
              <TableRow
                key={signal.id}
                className={`transition-colors ${signal.status === "active" ? "bg-accent/30" : ""}`}
                data-testid={`row-signal-${signal.id}`}
              >
                {showStrategy && (
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="text-xs font-mono"
                      style={{ borderColor: STRATEGY_COLORS[signal.strategy] || undefined, color: STRATEGY_COLORS[signal.strategy] || undefined }}
                    >
                      {getStrategyLabel(signal.strategy)}
                    </Badge>
                  </TableCell>
                )}
                <TableCell />
                <TableCell className="font-semibold text-sm" data-testid="text-instrument">
                  {signal.instrument}
                </TableCell>
                <TableCell data-testid="text-option">
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-sm font-semibold">{signal.strikePrice}</span>
                    <Badge
                      variant="outline"
                      className={`text-xs px-1.5 ${signal.optionType === "CE" ? "text-chart-3 border-chart-3" : "text-destructive border-destructive"}`}
                    >
                      {signal.optionType === "CE" ? <ArrowUp className="w-3 h-3 mr-0.5" /> : <ArrowDown className="w-3 h-3 mr-0.5" />}
                      {signal.optionType}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      {signal.productType || "INT"}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono text-sm" data-testid="text-entry">{signal.entryPrice?.toFixed(2)}</TableCell>
                <TableCell className="text-right font-mono text-sm" data-testid="text-current">
                  {signal.currentPrice ? signal.currentPrice.toFixed(2) : "--"}
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-chart-3" data-testid="text-target1">{signal.target1?.toFixed(2)}</TableCell>
                <TableCell className="text-right font-mono text-xs text-muted-foreground" data-testid="text-targets">
                  {signal.target2 ? signal.target2.toFixed(2) : "--"}/{signal.target3 ? signal.target3.toFixed(2) : "--"}
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-destructive" data-testid="text-stoploss">{signal.stoploss?.toFixed(2)}</TableCell>
                <TableCell className="text-center">{getStatusBadge(signal.status)}</TableCell>
                <TableCell className="text-right"><PnLDisplay pnl={signal.pnl} /></TableCell>
                <TableCell className="text-center">
                  {signal.status === "active" && onExitSignal && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0 border-destructive text-destructive hover:bg-destructive/10"
                      onClick={() => onExitSignal(signal.id)}
                      disabled={isExiting}
                      title="Exit position"
                    >
                      {isExiting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <X className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  )}
                </TableCell>
                <TableCell className="text-center"><ConfidenceMeter value={signal.confidence ?? 50} /></TableCell>
                <TableCell
                  className="text-right text-xs text-muted-foreground whitespace-nowrap"
                  data-testid="text-time"
                >
                  {formatIstTime(signal.createdAt)}
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                  {signal.status === "active" ? "--" : formatIstTime(signal.closedTime ?? null)}
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                  {signal.status === "active"
                    ? "--"
                    : signal.closedTime
                    ? (() => {
                        const duration = Math.round((new Date(signal.closedTime).getTime() - new Date(signal.createdAt).getTime()) / 1000);
                        const minutes = Math.floor(duration / 60);
                        const seconds = duration % 60;
                        return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
                      })()
                    : "--"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
