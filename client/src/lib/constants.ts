// Re-export from shared schema for backward compatibility
export {
  STRATEGIES,
  STRATEGY_COLORS,
  STATUS_LABELS,
  getStrategyLabel,
  type StrategyKey,
} from "@shared/schema";

export function formatIstTime(value: Date | string | null): string {
  if (!value) return "--";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}
