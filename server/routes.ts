import type { Express } from "express";
import { type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { loginToAngelOne, getRMS, getProfile, isLoggedIn, getOptionChainWithOI } from "./angelone";
import { startEngine, stopEngine, getEngineStatus, setBroadcast, setAngeloneConnected, getMarketAnalysis, getMarketRegime, setCapital, getCapital, setDefaultCapital, getDefaultCapital, trackSignalClose } from "./strategies";
import { analyzeOI } from "./oi-analysis";
import { log } from "./index";
import { z } from "zod";
import { ALL_INSTRUMENTS } from "@shared/schema";

const VALID_INSTRUMENTS = ALL_INSTRUMENTS.map(i => i.key);

// 🔐 Control flags (SAFE FOR BOLT)
const ENABLE_WS = process.env.ENABLE_WS === "true";
const ENABLE_TRADING = process.env.ENABLE_TRADING === "true";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ===============================
  // ✅ SAFE WEBSOCKET SETUP
  // ===============================

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

  // ===============================
  // ✅ SAFE ANGEL AUTO START
  // ===============================

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

  // ===============================
  // 🚀 REST API ROUTES (UNCHANGED)
  // ===============================