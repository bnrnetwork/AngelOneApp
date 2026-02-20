-- Migration: Add production-grade strategy fields
-- This migration adds new fields to support advanced multi-strategy trading engine

ALTER TABLE signals
ADD COLUMN IF NOT EXISTS risk_reward_ratio REAL,
ADD COLUMN IF NOT EXISTS market_bias TEXT,
ADD COLUMN IF NOT EXISTS market_regime TEXT,
ADD COLUMN IF NOT EXISTS breakout_score REAL,
ADD COLUMN IF NOT EXISTS oi_confirmation TEXT,
ADD COLUMN IF NOT EXISTS vix_at_entry REAL,
ADD COLUMN IF NOT EXISTS bid_ask_spread REAL,
ADD COLUMN IF NOT EXISTS trailing_stop_active BOOLEAN DEFAULT FALSE;

-- Create index for faster strategy queries
CREATE INDEX IF NOT EXISTS idx_signals_strategy_regime 
ON signals(strategy, market_regime, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_signals_market_bias 
ON signals(market_bias, created_at DESC);

-- Create table for regime analysis history
CREATE TABLE IF NOT EXISTS regime_analysis (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
  instrument TEXT NOT NULL,
  regime TEXT NOT NULL, -- SIDEWAYS, TRENDING, BREAKOUT
  confidence INTEGER NOT NULL,
  vix REAL,
  atr_percent REAL,
  rsi INTEGER,
  volume_spike REAL,
  features TEXT -- JSON of all features
);

CREATE INDEX IF NOT EXISTS idx_regime_analysis_timestamp 
ON regime_analysis(instrument, timestamp DESC);

-- Create table for ORB validation history
CREATE TABLE IF NOT EXISTS orb_validations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
  instrument TEXT NOT NULL,
  is_valid BOOLEAN NOT NULL,
  is_doji BOOLEAN,
  doji_ratio REAL,
  gap_percent REAL,
  has_pullback BOOLEAN,
  atr_percent REAL,
  skip_reasons TEXT -- JSON array
);

CREATE INDEX IF NOT EXISTS idx_orb_validations_timestamp 
ON orb_validations(instrument, timestamp DESC);

-- Create table for breakout strength scores
CREATE TABLE IF NOT EXISTS breakout_scores (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
  signal_id VARCHAR REFERENCES signals(id),
  total_score INTEGER NOT NULL,
  volume_spike_score INTEGER,
  vwap_distance_score INTEGER,
  ema_alignment_score INTEGER,
  oi_confirmation_score INTEGER,
  atr_expansion_score INTEGER
);

-- Create table for OI confirmations
CREATE TABLE IF NOT EXISTS oi_confirmations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
  signal_id VARCHAR REFERENCES signals(id),
  call_oi INTEGER,
  put_oi INTEGER,
  put_call_ratio REAL,
  direction TEXT, -- LONG or SHORT
  confirmed BOOLEAN,
  confidence INTEGER
);

-- Create table for risk metrics tracking
CREATE TABLE IF NOT EXISTS risk_metrics (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
  signal_id VARCHAR REFERENCES signals(id),
  position_size INTEGER,
  risk_percent REAL,
  max_risk_amount REAL,
  rr_ratio REAL,
  target1 REAL,
  target2 REAL,
  target3 REAL
);
