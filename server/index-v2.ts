import express from "express";
import { SmartAPI } from "smartapi-javascript";
import { WebSocketServer } from "ws";
import { config } from "../shared/config";
import { MarketDataService } from "./services/market-data-service";
import { TradingEngine } from "./services/trading-engine";
import { db } from "./db";
import { signals, logs } from "../shared/schema";
import { eq, desc } from "drizzle-orm";

const app = express();
app.use(express.json());

let marketDataService: MarketDataService;
let tradingEngine: TradingEngine;
let wss: WebSocketServer;

function broadcast(data: any) {
  if (!wss) return;

  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(data));
    }
  });
}

async function initializeServices() {
  try {
    console.log("Initializing AngelOne SmartAPI...");

    const smartApi = new SmartAPI({
      api_key: config.angelone.apiKey,
    });

    await smartApi.generateSession(
      config.angelone.clientId,
      config.angelone.password,
      config.angelone.totpSecret
    );

    console.log("✓ AngelOne authenticated");

    marketDataService = new MarketDataService(smartApi);
    await marketDataService.authenticate();

    tradingEngine = new TradingEngine(marketDataService, 100000);

    console.log("✓ Services initialized");

    return true;
  } catch (error) {
    console.error("Failed to initialize services:", error);
    return false;
  }
}

app.get("/api/signals", async (req, res) => {
  try {
    const allSignals = await db
      .select()
      .from(signals)
      .orderBy(desc(signals.createdAt))
      .limit(100);

    res.json(allSignals);
  } catch (error) {
    console.error("Error fetching signals:", error);
    res.status(500).json({ error: "Failed to fetch signals" });
  }
});

app.get("/api/signals/active", async (req, res) => {
  try {
    const activeSignals = await db
      .select()
      .from(signals)
      .where(eq(signals.status, "active"))
      .orderBy(desc(signals.createdAt));

    res.json(activeSignals);
  } catch (error) {
    console.error("Error fetching active signals:", error);
    res.status(500).json({ error: "Failed to fetch active signals" });
  }
});

app.get("/api/signals/:id", async (req, res) => {
  try {
    const signal = await db
      .select()
      .from(signals)
      .where(eq(signals.id, req.params.id))
      .limit(1);

    if (signal.length === 0) {
      return res.status(404).json({ error: "Signal not found" });
    }

    res.json(signal[0]);
  } catch (error) {
    console.error("Error fetching signal:", error);
    res.status(500).json({ error: "Failed to fetch signal" });
  }
});

app.post("/api/signals/:id/close", async (req, res) => {
  try {
    const { reason } = req.body;

    const [signal] = await db
      .select()
      .from(signals)
      .where(eq(signals.id, req.params.id))
      .limit(1);

    if (!signal) {
      return res.status(404).json({ error: "Signal not found" });
    }

    await db
      .update(signals)
      .set({
        status: "closed",
        exitPrice: signal.currentPrice,
        exitReason: reason || "Manual close",
        closedTime: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(signals.id, req.params.id));

    tradingEngine.getStrategyManager().removeActiveSignal(req.params.id);

    const updatedSignal = await db
      .select()
      .from(signals)
      .where(eq(signals.id, req.params.id))
      .limit(1);

    broadcast({
      type: "signal_closed",
      data: updatedSignal[0],
    });

    res.json({ success: true, signal: updatedSignal[0] });
  } catch (error) {
    console.error("Error closing signal:", error);
    res.status(500).json({ error: "Failed to close signal" });
  }
});

app.get("/api/strategies", (req, res) => {
  try {
    const strategies = tradingEngine.getStrategyManager().getAllStrategies();

    const strategyInfo = strategies.map(s => ({
      name: s.getName(),
      enabled: s.isEnabled(),
      config: s.getConfig(),
    }));

    res.json(strategyInfo);
  } catch (error) {
    console.error("Error fetching strategies:", error);
    res.status(500).json({ error: "Failed to fetch strategies" });
  }
});

app.post("/api/strategies/:name/toggle", (req, res) => {
  try {
    const { name } = req.params;
    const { enabled } = req.body;

    const manager = tradingEngine.getStrategyManager();

    if (enabled) {
      manager.enableStrategy(name);
    } else {
      manager.disableStrategy(name);
    }

    res.json({ success: true, name, enabled });
  } catch (error) {
    console.error("Error toggling strategy:", error);
    res.status(500).json({ error: "Failed to toggle strategy" });
  }
});

app.get("/api/logs", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;

    const allLogs = await db
      .select()
      .from(logs)
      .orderBy(desc(logs.createdAt))
      .limit(limit);

    res.json(allLogs);
  } catch (error) {
    console.error("Error fetching logs:", error);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

app.get("/api/stats", async (req, res) => {
  try {
    const allSignals = await db.select().from(signals);

    const activeCount = allSignals.filter(s => s.status === "active").length;
    const closedCount = allSignals.filter(s =>
      s.status === "closed" ||
      s.status === "target1_hit" ||
      s.status === "target2_hit" ||
      s.status === "target3_hit"
    ).length;

    const totalPnL = allSignals
      .filter(s => s.pnl !== null)
      .reduce((sum, s) => sum + (s.pnl || 0), 0);

    const winningTrades = allSignals.filter(s =>
      s.status === "target1_hit" ||
      s.status === "target2_hit" ||
      s.status === "target3_hit"
    ).length;

    const losingTrades = allSignals.filter(s => s.status === "sl_hit").length;

    const winRate = closedCount > 0
      ? ((winningTrades / closedCount) * 100).toFixed(2)
      : "0.00";

    res.json({
      totalSignals: allSignals.length,
      activeSignals: activeCount,
      closedSignals: closedCount,
      totalPnL: totalPnL.toFixed(2),
      winningTrades,
      losingTrades,
      winRate: `${winRate}%`,
      engineStatus: tradingEngine.isEngineRunning() ? "running" : "stopped",
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

app.post("/api/engine/start", async (req, res) => {
  try {
    await tradingEngine.start();
    res.json({ success: true, status: "running" });
  } catch (error) {
    console.error("Error starting engine:", error);
    res.status(500).json({ error: "Failed to start engine" });
  }
});

app.post("/api/engine/stop", (req, res) => {
  try {
    tradingEngine.stop();
    res.json({ success: true, status: "stopped" });
  } catch (error) {
    console.error("Error stopping engine:", error);
    res.status(500).json({ error: "Failed to stop engine" });
  }
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    services: {
      marketData: marketDataService?.isConnected() || false,
      tradingEngine: tradingEngine?.isEngineRunning() || false,
    },
    timestamp: new Date().toISOString(),
  });
});

async function startServer() {
  const PORT = process.env.PORT || 5000;

  const initialized = await initializeServices();
  if (!initialized) {
    console.error("Failed to initialize services. Server will not start.");
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    console.log("WebSocket client connected");

    ws.send(JSON.stringify({
      type: "connected",
      message: "Connected to trading server",
    }));

    ws.on("close", () => {
      console.log("WebSocket client disconnected");
    });
  });

  await tradingEngine.start();

  setInterval(async () => {
    await tradingEngine.updateActiveSignals();

    const stats = await db.select().from(signals);
    broadcast({
      type: "stats_update",
      data: {
        total: stats.length,
        active: stats.filter(s => s.status === "active").length,
      },
    });
  }, 30000);

  console.log("✓ Trading system fully operational");
}

if (process.env.NODE_ENV !== "test") {
  startServer().catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
}

export { app, marketDataService, tradingEngine };
