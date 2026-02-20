# AngelOne AlgoTrader - Deployment Reference

**Purpose**: Quick reference documentation for deployment, architecture overview, and API endpoints. For current strategy documentation, see [INDEX.md](INDEX.md) and [server/strategies/README.md](server/strategies/README.md).

---

## ⚠️ Note on Strategy Documentation

This document references the original 8 strategies. The system has been updated with **13 comprehensive production-grade strategies** and advanced AI-driven regime classification. See:
- **Current Strategies**: [server/strategies/README.md](server/strategies/README.md)
- **Architecture**: [ARCHITECTURE_DIAGRAM.md](ARCHITECTURE_DIAGRAM.md)
- **Integration Guide**: [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md)

---

## System Overview

AngelOne Algo Trading Signal Engine that generates real-time trading signals using multi-strategy approaches across NIFTY, BANKNIFTY, SENSEX, CRUDEOIL, and NATURALGAS. Signal-only tracking with Telegram notifications—no direct order execution.

## Technology Stack

- **Frontend**: React + TypeScript + Tailwind CSS + ShadCN UI
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Real-time**: WebSocket for live signal updates
- **Market Data**: AngelOne SmartAPI (LTP, option chains, OI data)
- **Notifications**: Telegram Bot API

## Project Structure

```
client/src/
  ├── components/
  │   ├── signal-table.tsx        - Display active signals
  │   ├── stats-cards.tsx         - Trading statistics
  │   ├── market-analysis.tsx     - Market trends
  │   ├── market-regime.tsx       - Regime detection
  │   ├── oi-analysis.tsx         - Option chain analysis
  │   └── theme-provider.tsx      - Dark/light mode
  ├── pages/
  │   ├── dashboard.tsx           - Main trading dashboard
  │   ├── all-signals.tsx         - All signals view
  │   ├── signal-history.tsx      - 30-day history
  │   ├── balance.tsx             - Account info
  │   └── logs-page.tsx           - System logs
  └── lib/
      ├── constants.ts            - Strategy definitions
      ├── websocket.ts            - WebSocket client
      └── queryClient.ts          - TanStack Query

server/
  ├── angelone.ts                 - SmartAPI integration
  ├── strategies.ts               - Strategy engine
  ├── oi-analysis.ts              - OI analysis
  ├── telegram.ts                 - Telegram alerts
  ├── storage.ts                  - Database ops
  └── routes.ts                   - API endpoints

shared/
  ├── schema.ts                   - Database schema + strategies
  ├── utils.ts                    - Utilities
  └── config.ts                   - Configuration
```

## API Endpoints
- `GET /api/signals` - All signals (optional ?strategy= filter)
- `GET /api/signals/:strategy` - Strategy-specific signals
- `GET /api/signals/history/:date` - Signals for a specific date (YYYY-MM-DD)
- `GET /api/signals/dates` - Available dates with signal data (last 30 days)
- `POST /api/signals/clear/:date` - Clear SL Hit/Expired signals for a date
- `GET /api/balance` - Account balance from AngelOne
- `GET /api/profile` - Account profile from AngelOne
- `GET /api/engine/status` - Engine status (running, instruments[], connected, streaming, capital)
- `POST /api/engine/start` - Start engine (body: {instruments: string[], capital?: number})
- `POST /api/engine/stop` - Stop engine
- `GET /api/capital` - Get current and default capital
- `POST /api/capital` - Set current capital (body: {capital: number})
- `POST /api/capital/default` - Set default capital (body: {defaultCapital: number})
- `GET /api/option-chain/:instrument` - Live option chain data
- `GET /api/market-analysis/:instrument` - Market trend analysis
- `GET /api/market-regime/:instrument` - Market regime detection
- `GET /api/oi-analysis/:instrument` - OI analysis with market structure, OI matrix, fake breakout detection
- `GET /api/logs` - System logs
- `WS /ws` - WebSocket for real-time updates

## Instruments
- **NSE**: NIFTY (lot=65, strike=50), BANKNIFTY (lot=30, strike=100)
- **BSE**: SENSEX (lot=20, strike=100)
- **MCX**: CRUDEOIL (lot=10, strike=50), NATURALGAS (lot=1250, strike=5)

## Core Features

- **Multi-Strategy Engine**: 9 specialized engines + AI orchestrator
- **Multi-Instrument**: NIFTY, BANKNIFTY, SENSEX, CRUDEOIL, NATURALGAS
- **Risk Management**: Position sizing, multi-target exits, kill switches
- **Regime Detection**: AI-driven market classification
- **Real-Time Updates**: WebSocket for live signal & price updates
- **OI Analysis**: Institutional-level option chain analysis
- **Signal History**: 30-day transaction history with P&L
- **Telegram Alerts**: Entry/exit/target notifications
- **Capital Management**: Configurable position sizing

## Configuration

### Capital Management
- Dropdown: 10K, 25K, 50K, 75K, 1L, 1.5L, 2L
- Default capital: Stored in localStorage, applied on startup
- Risk-based position sizing: qty = (capital × risk%) / (entry - sl)

### P&L Calculation
- Formula: (currentPrice - entryPrice) × lotSize
- Lot Sizes: NIFTY=65, BANKNIFTY=30, SENSEX=20, CRUDEOIL=10, NATURALGAS=1250
- Display: Indian Rupees (₹)

### Environment Setup
```env
ANGELONE_API_KEY=your_key
ANGELONE_CLIENT_CODE=your_code
ANGELONE_PASSWORD=your_password
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat_id
DATABASE_URL=postgresql://...
```

### Auto-Start
Engine automatically starts with NIFTY on server boot

---

## For Current Documentation

→ **Strategies**: [server/strategies/README.md](server/strategies/README.md)  
→ **Architecture**: [ARCHITECTURE_DIAGRAM.md](ARCHITECTURE_DIAGRAM.md)  
→ **Deployment**: [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)  
→ **Integration**: [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md)  
→ **Quick Start**: [INDEX.md](INDEX.md)
