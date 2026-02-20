/**
 * Shared Utility Functions for AlgoTrader
 * 
 * This file contains common utility functions used across
 * both client and server components.
 */

import type { Signal } from "./schema";

/**
 * Calculate the duration between two timestamps in a human-readable format
 * @param startTime - Start timestamp
 * @param endTime - End timestamp (defaults to now)
 * @returns Formatted duration string (e.g., "5m 30s", "2h 15m")
 */
export function formatDuration(startTime: Date | string, endTime?: Date | string | null): string {
  if (!endTime) return "--";
  
  const start = startTime instanceof Date ? startTime : new Date(startTime);
  const end = endTime instanceof Date ? endTime : new Date(endTime);
  
  const duration = Math.round((end.getTime() - start.getTime()) / 1000); // in seconds
  
  if (duration < 60) {
    return `${duration}s`;
  }
  
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;
  
  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

/**
 * Calculate P&L percentage
 * @param entryPrice - Entry price
 * @param exitPrice - Exit or current price
 * @returns P&L percentage
 */
export function calculatePnlPercentage(entryPrice: number, exitPrice: number): number {
  if (entryPrice === 0) return 0;
  return ((exitPrice - entryPrice) / entryPrice) * 100;
}

/**
 * Format currency in Indian Rupee format
 * @param amount - Amount to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted currency string
 */
export function formatCurrency(amount: number, decimals: number = 2): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

/**
 * Format large numbers in compact notation (K, L, Cr)
 * @param num - Number to format
 * @returns Formatted string (e.g., "10K", "1.5L", "2.5Cr")
 */
export function formatCompactNumber(num: number): string {
  if (num >= 10000000) {
    // Crores
    return `${(num / 10000000).toFixed(2)}Cr`;
  } else if (num >= 100000) {
    // Lakhs
    return `${(num / 100000).toFixed(2)}L`;
  } else if (num >= 1000) {
    // Thousands
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}

/**
 * Calculate risk-reward ratio
 * @param entryPrice - Entry price
 * @param target - Target price
 * @param stoploss - Stoploss price
 * @returns Risk-reward ratio
 */
export function calculateRiskRewardRatio(
  entryPrice: number,
  target: number,
  stoploss: number
): number {
  const risk = Math.abs(entryPrice - stoploss);
  const reward = Math.abs(target - entryPrice);
  
  if (risk === 0) return 0;
  return reward / risk;
}

/**
 * Determine signal status color class
 * @param status - Signal status
 * @returns Tailwind color class
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case "active":
      return "text-blue-500";
    case "target1_hit":
    case "target2_hit":
    case "target3_hit":
      return "text-green-500";
    case "sl_hit":
      return "text-red-500";
    case "expired":
    case "closed":
      return "text-gray-500";
    default:
      return "text-muted-foreground";
  }
}

/**
 * Check if a signal is profitable
 * @param signal - Signal object
 * @returns True if signal has positive P&L
 */
export function isSignalProfitable(signal: Signal): boolean {
  return (signal.pnl ?? 0) > 0;
}

/**
 * Calculate win rate from signals
 * @param signals - Array of signals
 * @returns Win rate as percentage (0-100)
 */
export function calculateWinRate(signals: Signal[]): number {
  if (signals.length === 0) return 0;
  
  const closedSignals = signals.filter(s => 
    s.status !== "active" && s.pnl !== null && s.pnl !== undefined
  );
  
  if (closedSignals.length === 0) return 0;
  
  const profitableSignals = closedSignals.filter(s => (s.pnl ?? 0) > 0);
  
  return (profitableSignals.length / closedSignals.length) * 100;
}

/**
 * Get active signals from signal array
 * @param signals - Array of signals
 * @returns Filtered array of active signals
 */
export function getActiveSignals(signals: Signal[]): Signal[] {
  return signals.filter(s => s.status === "active");
}

/**
 * Get closed signals from signal array
 * @param signals - Array of signals
 * @returns Filtered array of closed signals
 */
export function getClosedSignals(signals: Signal[]): Signal[] {
  return signals.filter(s => s.status !== "active");
}

/**
 * Calculate total P&L from signals
 * @param signals - Array of signals
 * @returns Total P&L
 */
export function calculateTotalPnl(signals: Signal[]): number {
  return signals.reduce((total, signal) => total + (signal.pnl ?? 0), 0);
}

/**
 * Validate if a number is within a range
 * @param value - Value to check
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns True if value is within range
 */
export function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

/**
 * Clamp a number between min and max
 * @param value - Value to clamp
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Format percentage with sign
 * @param value - Percentage value
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted percentage string with + or - sign
 */
export function formatPercentage(value: number, decimals: number = 2): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * Safe division to avoid division by zero
 * @param numerator - Numerator
 * @param denominator - Denominator
 * @param fallback - Fallback value if denominator is zero
 * @returns Result of division or fallback
 */
export function safeDivide(numerator: number, denominator: number, fallback: number = 0): number {
  return denominator === 0 ? fallback : numerator / denominator;
}
