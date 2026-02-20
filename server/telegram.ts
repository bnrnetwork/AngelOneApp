import { log } from "./index";
import { LOT_SIZES } from "@shared/schema";

const sentMessages = new Set<string>();
const warnedLotSizes = new Set<string>();

function formatTimeIST(date: Date): string {
  const formatted = date.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  return formatted.replace("am", "AM").replace("pm", "PM");
}

function getLotSize(instrument: string): number {
  const lotSize = LOT_SIZES[instrument];
  if (lotSize == null) {
    if (!warnedLotSizes.has(instrument)) {
      log(`Missing lot size for ${instrument}, defaulting to 1`, "telegram");
      warnedLotSizes.add(instrument);
    }
    return 1;
  }
  return lotSize;
}

function getMessageKey(strategy: string, instrument: string, strike: number, optionType: string, type: string): string {
  return `${strategy}-${instrument}-${strike}-${optionType}-${type}-${Date.now()}`;
}

function normalizeProductType(productType?: string): "INT" | "CF" {
  return productType === "CF" ? "CF" : "INT";
}

export async function sendEntrySignal(params: {
  strategy: string;
  instrument: string;
  strike: number;
  optionType: string;
  productType?: string;
  entry: number;
  target1: number;
  target2?: number;
  target3?: number;
  stoploss: number;
  confidence: number;
  entryTime?: Date;
}): Promise<boolean> {
  const key = getMessageKey(params.strategy, params.instrument, params.strike, params.optionType, "entry");
  if (sentMessages.has(key)) {
    log(`Duplicate entry signal suppressed: ${key}`, "telegram");
    return false;
  }

  const targets = [params.target1.toFixed(2)];
  if (params.target2) targets.push(params.target2.toFixed(2));
  if (params.target3) targets.push(params.target3.toFixed(2));
  const productType = normalizeProductType(params.productType);

  const lotSize = getLotSize(params.instrument);
  const entryTimeStr = params.entryTime ? formatTimeIST(new Date(params.entryTime)) : formatTimeIST(new Date());
  
  const message = `[SIGNAL] ${params.strategy} ENTRY
⏰ Time: ${entryTimeStr}

Instrument: ${params.instrument} (Lot: ${lotSize})
Option: ${params.strike} ${params.optionType} ${productType}
Entry: ${params.entry.toFixed(2)}
Target: ${targets.join("/")}
Stoploss: ${params.stoploss.toFixed(2)}
Confidence: ${params.confidence}%

#${params.strategy} #${params.instrument} #AlgoTrader`;

  const sent = await sendTelegramMessage(message);
  if (sent) {
    sentMessages.add(key);
  }
  return sent;
}

export async function sendExitSignal(params: {
  strategy: string;
  instrument: string;
  strike: number;
  optionType: string;
  productType?: string;
  exitPrice: number;
  exitReason: string;
  pnl: number;
  lotSize?: number;
  entryTime?: Date;
  exitTime?: Date;
  entryPrice?: number;
}): Promise<boolean> {
  const key = getMessageKey(params.strategy, params.instrument, params.strike, params.optionType, params.exitReason);

  const resultTag = params.pnl >= 0 ? "[PROFIT]" : "[LOSS]";
  const lotInfo = params.lotSize ? ` (Lot: ${params.lotSize})` : "";
  const productType = normalizeProductType(params.productType);
  
  const entryTimeStr = params.entryTime ? formatTimeIST(new Date(params.entryTime)) : "--";
  const exitTimeStr = params.exitTime ? formatTimeIST(new Date(params.exitTime)) : formatTimeIST(new Date());
  
  let durationStr = "--";
  if (params.entryTime && params.exitTime) {
    const durationMs = new Date(params.exitTime).getTime() - new Date(params.entryTime).getTime();
    const seconds = Math.round(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    durationStr = minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;
  }
  
  const message = `${resultTag} ${params.strategy} EXIT
⏰ Entry: ${entryTimeStr} | Exit: ${exitTimeStr} | Duration: ${durationStr}

Instrument: ${params.instrument}${lotInfo}
Option: ${params.strike} ${params.optionType} ${productType}
Entry: ${params.entryPrice ? "₹" + params.entryPrice.toFixed(2) : "--"}
Exit: ${params.exitPrice.toFixed(2)}
Reason: ${params.exitReason}
P&L: ${params.pnl >= 0 ? "+" : ""}₹${params.pnl.toFixed(2)}

#${params.strategy} #${params.instrument} #AlgoTrader`;

  const sent = await sendTelegramMessage(message);
  if (sent) {
    sentMessages.add(key);
  }
  return sent;
}

export async function sendDailyPnlSummary(message: string): Promise<boolean> {
  return sendTelegramMessage(message);
}

export async function sendTelegramMessage(text: string): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    log("Telegram credentials not configured", "telegram");
    return false;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    });
    const data = await response.json();
    if (data.ok) {
      log(`Telegram message sent successfully`, "telegram");
      return true;
    } else {
      log(`Telegram send failed: ${data.description}`, "telegram");
      return false;
    }
  } catch (err: any) {
    log(`Telegram error: ${err.message}`, "telegram");
    return false;
  }
}

export function clearSentMessages() {
  sentMessages.clear();
}
