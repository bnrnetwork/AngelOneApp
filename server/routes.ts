import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { loginToAngelOne, getRMS, getProfile, isLoggedIn, getOptionChainWithOI } from "./angelone";
import { startEngine, stopEngine, getEngineStatus, setBroadcast, setAngeloneConnected, getMarketAnalysis, getMarketRegime, setCapital, getCapital, setDefaultCapital, getDefaultCapital, trackSignalClose } from "./strategies";
import { analyzeOI } from "./oi-analysis";
import { log } from "./index";
import { z } from "zod";
import { ALL_INSTRUMENTS } from "@shared/schema";

const VALID_INSTRUMENTS = ALL_INSTRUMENTS.map(i => i.key);

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  const clients = new Set<WebSocket>();

  wss.on("connection", (ws) => {
    clients.add(ws);
    log("WebSocket client connected", "ws");

    ws.on("close", () => {
      clients.delete(ws);
    });
  });

  function broadcast(type: string, data: any) {
    const msg = JSON.stringify({ type, data });
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    });
  }

  setBroadcast(broadcast);

  loginToAngelOne().then(async (success) => {
    setAngeloneConnected(success);
    if (success) {
      log("AngelOne authenticated on startup", "angelone");
      await storage.createLog({ level: "success", source: "angelone", message: "Connected to AngelOne API" });
    } else {
      log("AngelOne auth failed on startup - will retry on engine start", "angelone");
      await storage.createLog({ level: "warn", source: "angelone", message: "Initial connection failed, will retry" });
    }

    try {
      const status = getEngineStatus();
      if (!status.running) {
        await startEngine(["NIFTY"]);
        log("Engine auto-started with NIFTY on boot", "engine");
        await storage.createLog({ level: "success", source: "engine", message: "Auto-started with NIFTY" });
      }
    } catch (err: any) {
      log(`Auto-start failed: ${err.message}`, "engine");
    }
  }).catch(() => {
    setAngeloneConnected(false);
    storage.createLog({ level: "warn", source: "angelone", message: "Connection attempt failed" });
  });

  app.get("/api/signals/history/:date", async (req, res) => {
    try {
      const date = req.params.date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD" });
      }
      const dateSignals = await storage.getSignalsByDate(date);
      res.json(dateSignals);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/signals/dates", async (_req, res) => {
    try {
      const dates = await storage.getAvailableSignalDates();
      res.json(dates);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/signals/clear/:date", async (req, res) => {
    try {
      const date = req.params.date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD" });
      }
      const cleared = await storage.clearExpiredSignals(date);
      await storage.createLog({
        level: "info",
        source: "signals",
        message: `Cleared ${cleared} SL Hit/Expired signals for ${date}`,
      });
      res.json({ cleared, date });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/signals", async (req, res) => {
    try {
      const strategy = req.query.strategy as string | undefined;
      const signals = strategy
        ? await storage.getTodaySignals(strategy)
        : await storage.getTodaySignals();
      res.json(signals);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/signals/:strategy", async (req, res) => {
    try {
      const signals = await storage.getTodaySignals(req.params.strategy);
      res.json(signals);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/balance", async (_req, res) => {
    try {
      const emptyBalance = {
        availablecash: "0",
        net: "0",
        collateral: "0",
        utiliseddebits: "0",
        m2mrealized: "0",
        m2munrealized: "0",
      };
      if (!isLoggedIn()) {
        const success = await loginToAngelOne();
        if (!success) {
          return res.json(emptyBalance);
        }
      }
      const rms = await getRMS();
      const rmsData = (rms as any)?.data ?? rms;
      const normalized = (rmsData as any)?.data ?? rmsData;
      const payload = normalized && typeof normalized === "object"
        ? { ...emptyBalance, ...normalized }
        : emptyBalance;
      res.json(payload);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/profile", async (_req, res) => {
    try {
      if (!isLoggedIn()) {
        await loginToAngelOne();
      }
      const profile = await getProfile();
      const fallbackClient = process.env.ANGEL_CLIENT_ID || "--";
      const rawClient = (profile as any)?.clientcode ?? fallbackClient;
      const clientcode = String(rawClient || "").trim();
      const safeProfile = {
        ...profile,
        name: (profile as any)?.name || "Trader",
        clientcode: clientcode && clientcode.toLowerCase() !== "null" ? clientcode : fallbackClient,
      };
      res.json(profile ? safeProfile : { name: "Trader", clientcode: fallbackClient });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/engine/status", (_req, res) => {
    res.json(getEngineStatus());
  });

  const engineStartSchema = z.object({
    instruments: z.array(z.enum(["NIFTY", "BANKNIFTY", "SENSEX", "CRUDEOIL", "NATURALGAS"])).min(1),
    capital: z.number().optional(),
    mode: z.enum(["live", "backtest"]).optional().default("live"),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  });

  app.post("/api/engine/start", async (req, res) => {
    try {
      const parsed = engineStartSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request. Provide instruments array with at least one valid instrument." });
      }
      const { instruments, capital, mode, startDate, endDate } = parsed.data;

      // Validate backtest mode requirements
      if (mode === "backtest") {
        if (!startDate || !endDate) {
          return res.status(400).json({ message: "Backtest mode requires startDate and endDate" });
        }
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          return res.status(400).json({ message: "Invalid date format" });
        }
        if (start >= end) {
          return res.status(400).json({ message: "Start date must be before end date" });
        }
      }

      if (capital) {
        setCapital(capital);
      }

      if (!isLoggedIn() && mode === "live") {
        const success = await loginToAngelOne();
        setAngeloneConnected(success);
        if (!success) {
          await storage.createLog({ level: "warn", source: "engine", message: "Started without AngelOne connection - using simulated data" });
        }
      }

      // Pass mode and dates to engine
      await startEngine(instruments as any, { mode, startDate, endDate });

      const modeText = mode === "live" ? "live trading" : `backtest (${startDate} to ${endDate})`;
      await storage.createLog({
        level: "success",
        source: "engine",
        message: `Engine started in ${modeText} mode for ${instruments.join(", ")}`
      });

      res.json({
        message: `Engine started in ${modeText} mode for ${instruments.join(", ")}`,
        status: getEngineStatus()
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/engine/stop", async (_req, res) => {
    try {
      await stopEngine();
      res.json({ message: "Engine stopped", status: getEngineStatus() });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/capital", (_req, res) => {
    res.json({ capital: getCapital(), defaultCapital: getDefaultCapital() });
  });

  app.post("/api/capital", (req, res) => {
    try {
      const { capital } = req.body;
      if (typeof capital === "number" && capital > 0) {
        setCapital(capital);
        res.json({ capital: getCapital() });
      } else {
        res.status(400).json({ message: "Invalid capital value" });
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/capital/default", (req, res) => {
    try {
      const { defaultCapital } = req.body;
      if (typeof defaultCapital === "number" && defaultCapital > 0) {
        setDefaultCapital(defaultCapital);
        res.json({ defaultCapital: getDefaultCapital(), capital: getCapital() });
      } else {
        res.status(400).json({ message: "Invalid default capital value" });
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/option-chain/:instrument", async (req, res) => {
    try {
      const instrument = req.params.instrument.toUpperCase();
      if (!VALID_INSTRUMENTS.includes(instrument as any)) {
        return res.status(400).json({ message: `Invalid instrument. Choose from: ${VALID_INSTRUMENTS.join(", ")}` });
      }
      if (!isLoggedIn()) {
        const success = await loginToAngelOne();
        if (!success) {
          return res.status(503).json({ message: "Not connected to AngelOne" });
        }
      }
      const chain = await getOptionChainWithOI(instrument);
      if (!chain) {
        return res.status(502).json({
          message: `Option chain data unavailable for ${instrument}. Could not resolve live market data/token mapping from AngelOne.`,
          code: "OPTION_CHAIN_UNAVAILABLE",
          instrument,
          hint: "Verify AngelOne session is active and market data for this instrument is currently available.",
        });
      }
      res.json(chain);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/market-analysis/:instrument", (req, res) => {
    try {
      const instrument = req.params.instrument.toUpperCase();
      if (!VALID_INSTRUMENTS.includes(instrument as any)) {
        return res.status(400).json({ message: "Invalid instrument" });
      }
      const analysis = getMarketAnalysis(instrument);
      if (!analysis) {
        return res.status(404).json({ message: "No indicator data available. Engine may not be running for this instrument." });
      }
      res.json(analysis);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/market-regime/:instrument", async (req, res) => {
    try {
      const instrument = req.params.instrument.toUpperCase();
      if (!VALID_INSTRUMENTS.includes(instrument as any)) {
        return res.status(400).json({ message: "Invalid instrument" });
      }
      const regime = await getMarketRegime(instrument);
      if (!regime) {
        return res.status(404).json({ message: "No indicator data available. Engine may not be running for this instrument." });
      }
      res.json(regime);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/oi-analysis/:instrument", async (req, res) => {
    try {
      const instrument = req.params.instrument.toUpperCase();
      if (!VALID_INSTRUMENTS.includes(instrument as any)) {
        return res.status(400).json({ message: "Invalid instrument" });
      }
      const analysis = await analyzeOI(instrument);
      if (!analysis) {
        return res.status(404).json({ message: "Could not fetch OI data. AngelOne connection required." });
      }
      res.json(analysis);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/logs", async (_req, res) => {
    try {
      const logEntries = await storage.getLogs(500);
      res.json(logEntries);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Cleanup endpoint - Delete all today's data and stop engine
  app.post("/api/cleanup/today", async (_req, res) => {
    try {
      const status = getEngineStatus();
      
      // Stop engine if running
      if (status.running) {
        await stopEngine();
        log("Engine stopped for data cleanup", "engine");
      }

      // Clear all today's data
      const result = await storage.clearTodayData();
      
      await storage.createLog({
        level: "info",
        source: "cleanup",
        message: `Deleted ${result.signalsDeleted} signals and ${result.logsDeleted} logs from today`
      });

      res.json({
        message: "All today's data cleared successfully",
        signalsDeleted: result.signalsDeleted,
        logsDeleted: result.logsDeleted,
        engineStopped: status.running
      });
      
      log(`Cleanup complete: ${result.signalsDeleted} signals, ${result.logsDeleted} logs deleted`, "cleanup");
    } catch (err: any) {
      await storage.createLog({
        level: "error",
        source: "cleanup",
        message: `Cleanup failed: ${err.message}`
      });
      res.status(500).json({ message: err.message });
    }
  });

  // Exit signal endpoints
  app.post("/api/signals/:id/exit", async (req, res) => {
    try {
      const { id } = req.params;
      const requestedExitPrice = Number(req.body?.exitPrice);

      const signal = await storage.getSignal(id);
      if (!signal) {
        return res.status(404).json({ message: "Signal not found" });
      }

      if (signal.status !== "active") {
        return res.status(400).json({ message: "Only active signals can be exited" });
      }

      const resolvedExitPrice = Number.isFinite(requestedExitPrice) && requestedExitPrice > 0
        ? requestedExitPrice
        : (signal.currentPrice && signal.currentPrice > 0 ? signal.currentPrice : signal.entryPrice);

      if (!resolvedExitPrice || resolvedExitPrice <= 0) {
        return res.status(400).json({ message: "Unable to resolve a valid exit price" });
      }

      const updated = await storage.exitSignal(id, resolvedExitPrice);

      // Track result for circuit breaker
      if (updated) {
        await trackSignalClose(updated.strategy, updated.status);
      }

      await storage.createLog({
        level: "info",
        source: "signals",
        message: `Signal ${id} manually exited at ${resolvedExitPrice}`
      });

      res.json({ message: "Signal exited successfully", signal: updated });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Exit all active signals
  app.post("/api/signals/bulk/exit-all", async (_req, res) => {
    try {
      const count = await storage.exitAllSignals();

      await storage.createLog({
        level: "info",
        source: "signals",
        message: `All ${count} active signals manually exited`
      });

      res.json({ message: `Exited ${count} signals`, count });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Exit all profitable signals
  app.post("/api/signals/bulk/exit-profits", async (_req, res) => {
    try {
      const count = await storage.exitAllProfitSignals();

      await storage.createLog({
        level: "info",
        source: "signals",
        message: `All ${count} profitable signals manually exited`
      });

      res.json({ message: `Exited ${count} profitable signals`, count });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Exit all loss signals
  app.post("/api/signals/bulk/exit-losses", async (_req, res) => {
    try {
      const count = await storage.exitAllLossSignals();

      await storage.createLog({
        level: "info",
        source: "signals",
        message: `All ${count} loss signals manually exited`
      });

      res.json({ message: `Exited ${count} loss signals`, count });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  return httpServer;
}
