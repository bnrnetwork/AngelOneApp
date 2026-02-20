import type { Express } from "express";
import { type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { loginToAngelOne, getRMS, getProfile, isLoggedIn, getOptionChainWithOI } from "./angelone";
import { startEngine, stopEngine, getEngineStatus, setBroadcast, setAngeloneConnected, getMarketAnalysis, getMarketRegime, setCapital, getCapital, setDefaultCapital, getDefaultCapital, trackSignalClose } from "./strategies";
import { analyzeOI } from "./oi-analysis";
import { log } from "./index";
import { z } from "zod";
import { ALL_INSTRUMENTS } from "../shared/schema";

const VALID_INSTRUMENTS = ALL_INSTRUMENTS.map(i => i.key);

const ENABLE_WS = process.env.ENABLE_WS === "true";
const ENABLE_TRADING = process.env.ENABLE_TRADING === "true";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  const clients = new Set<WebSocket>();

  if (ENABLE_WS) {
    const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

    wss.on("connection", (ws) => {
      clients.add(ws);
      log("WebSocket client connected", "ws");

      ws.on("close", () => {
        clients.delete(ws);
      });
    });

    log("WebSocket server enabled", "ws");
  } else {
    log("WebSocket disabled (safe deploy mode)", "ws");
  }

  function broadcast(type: string, data: any) {
    const msg = JSON.stringify({ type, data });
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    });
  }

  setBroadcast(broadcast);

  if (ENABLE_TRADING) {
    loginToAngelOne()
      .then(async (success) => {
        setAngeloneConnected(success);

        if (success) {
          log("AngelOne authenticated on startup", "angelone");
          await storage.createLog({
            level: "success",
            source: "angelone",
            message: "Connected to AngelOne API",
          });
        } else {
          log("AngelOne auth failed on startup", "angelone");
        }

        try {
          const status = getEngineStatus();
          if (!status.running) {
            await startEngine(["NIFTY"]);
            log("Engine auto-started with NIFTY on boot", "engine");
          }
        } catch (err: any) {
          log(`Auto-start failed: ${err.message}`, "engine");
        }
      })
      .catch(() => {
        setAngeloneConnected(false);
      });
  } else {
    log("Trading engine disabled (safe deploy mode)", "engine");
  }

  app.get("/api/signals", async (req, res) => {
    try {
      const signals = await storage.getSignals();
      res.json(signals);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/signals/history/:strategy", async (req, res) => {
    try {
      const { strategy } = req.params;
      const signals = await storage.getSignalsByStrategy(strategy);
      res.json(signals);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/signals/:id/close", async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const signal = await storage.getSignalById(id);
      if (!signal) {
        return res.status(404).json({ error: "Signal not found" });
      }

      await storage.updateSignal(id, {
        status: "closed",
        exitPrice: signal.currentPrice,
        exitReason: reason || "Manual close",
        closedTime: new Date(),
      });

      await trackSignalClose(signal);

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/logs", async (req, res) => {
    try {
      const logs = await storage.getLogs();
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/balance", async (req, res) => {
    try {
      if (!isLoggedIn()) {
        return res.status(401).json({ error: "Not logged in to AngelOne" });
      }

      const rms = await getRMS();
      res.json(rms);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/profile", async (req, res) => {
    try {
      if (!isLoggedIn()) {
        return res.status(401).json({ error: "Not logged in to AngelOne" });
      }

      const profile = await getProfile();
      res.json(profile);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/engine/status", (req, res) => {
    try {
      const status = getEngineStatus();
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/engine/start", async (req, res) => {
    try {
      const { instruments } = req.body;

      if (!instruments || !Array.isArray(instruments)) {
        return res.status(400).json({ error: "instruments array required" });
      }

      await startEngine(instruments);
      res.json({ success: true, message: "Engine started" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/engine/stop", async (req, res) => {
    try {
      await stopEngine();
      res.json({ success: true, message: "Engine stopped" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/market-analysis/:instrument", async (req, res) => {
    try {
      const { instrument } = req.params;

      if (!VALID_INSTRUMENTS.includes(instrument)) {
        return res.status(400).json({ error: "Invalid instrument" });
      }

      const analysis = await getMarketAnalysis(instrument);
      res.json(analysis);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/market-regime/:instrument", async (req, res) => {
    try {
      const { instrument } = req.params;

      if (!VALID_INSTRUMENTS.includes(instrument)) {
        return res.status(400).json({ error: "Invalid instrument" });
      }

      const regime = await getMarketRegime(instrument);
      res.json(regime);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/oi-analysis/:instrument", async (req, res) => {
    try {
      const { instrument } = req.params;

      if (!VALID_INSTRUMENTS.includes(instrument)) {
        return res.status(400).json({ error: "Invalid instrument" });
      }

      const optionChain = await getOptionChainWithOI(instrument);
      const analysis = analyzeOI(optionChain, instrument);

      res.json(analysis);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/capital", (req, res) => {
    try {
      const capital = getCapital();
      res.json({ capital });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/capital", (req, res) => {
    try {
      const { capital } = req.body;

      if (typeof capital !== "number" || capital <= 0) {
        return res.status(400).json({ error: "Invalid capital amount" });
      }

      setCapital(capital);
      res.json({ success: true, capital });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/capital/default", (req, res) => {
    try {
      const defaultCapital = getDefaultCapital();
      res.json({ defaultCapital });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/capital/default", (req, res) => {
    try {
      const { capital } = req.body;

      if (typeof capital !== "number" || capital <= 0) {
        return res.status(400).json({ error: "Invalid capital amount" });
      }

      setDefaultCapital(capital);
      res.json({ success: true, defaultCapital: capital });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      trading: ENABLE_TRADING,
      websocket: ENABLE_WS,
      angelone: isLoggedIn(),
    });
  });

  return httpServer;
}
