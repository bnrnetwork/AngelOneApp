/*
  # Initial Schema Setup for AngelOne Trading Application

  1. New Tables
    - `users`
      - `id` (uuid, primary key)
      - `username` (text, unique, not null)
      - `password` (text, not null)
    
    - `signals`
      - `id` (uuid, primary key)
      - `strategy` (enum, not null)
      - `instrument` (enum, not null)
      - `option_type` (enum, not null)
      - `product_type` (enum, not null, default 'INT')
      - `strike_price` (integer, not null)
      - `entry_price` (real, not null)
      - `current_price` (real)
      - `target1` (real, not null)
      - `target2` (real)
      - `target3` (real)
      - `stoploss` (real, not null)
      - `status` (enum, not null, default 'active')
      - `pnl` (real, default 0)
      - `confidence` (integer, default 50)
      - `confidence_reason` (text)
      - `telegram_sent` (boolean, default false)
      - `exit_price` (real)
      - `exit_reason` (text)
      - `created_at` (timestamp, default now())
      - `closed_time` (timestamp)
      - `updated_at` (timestamp, default now())
      - `risk_reward_ratio` (real)
      - `market_bias` (text)
      - `market_regime` (text)
      - `regime_confidence` (real)
      - `breakout_score` (real)
      - `oi_confirmation` (text)
      - `vix_at_entry` (real)
      - `bid_ask_spread` (real)
      - `trailing_stop_active` (boolean, default false)
    
    - `logs`
      - `id` (uuid, primary key)
      - `level` (text, default 'info')
      - `source` (text, not null)
      - `message` (text, not null)
      - `data` (text)
      - `created_at` (timestamp, default now())

  2. Enums
    - `signal_status`: active, target1_hit, target2_hit, target3_hit, sl_hit, expired, closed
    - `instrument_type`: NIFTY, BANKNIFTY, SENSEX, CRUDEOIL, NATURALGAS
    - `option_type`: CE, PE
    - `product_type`: INT, CF
    - `strategy_type`: Multiple trading strategies

  3. Security
    - Enable RLS on all tables
    - Add policies for authenticated access
*/

-- Create enums
CREATE TYPE signal_status AS ENUM ('active', 'target1_hit', 'target2_hit', 'target3_hit', 'sl_hit', 'expired', 'closed');
CREATE TYPE instrument_type AS ENUM ('NIFTY', 'BANKNIFTY', 'SENSEX', 'CRUDEOIL', 'NATURALGAS');
CREATE TYPE option_type AS ENUM ('CE', 'PE');
CREATE TYPE product_type AS ENUM ('INT', 'CF');
CREATE TYPE strategy_type AS ENUM ('ORB', 'SMTR', 'EMA', 'VWAP_PULLBACK', 'VWAP_RSI', 'RSI', 'RSI_RANGE', 'GAP_FADE', 'CPR', 'INSIDE_CANDLE', 'EMA_VWAP_RSI', 'MARKET_TOP', 'SCALP', 'PRO_ORB', 'VWAP_REVERSION', 'BREAKOUT_STRENGTH', 'REGIME_BASED', 'EMA_PULLBACK', 'AFTERNOON_VWAP_MOMENTUM');

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  password text NOT NULL
);

-- Create signals table
CREATE TABLE IF NOT EXISTS signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy strategy_type NOT NULL,
  instrument instrument_type NOT NULL,
  option_type option_type NOT NULL,
  product_type product_type NOT NULL DEFAULT 'INT',
  strike_price integer NOT NULL,
  entry_price real NOT NULL,
  current_price real,
  target1 real NOT NULL,
  target2 real,
  target3 real,
  stoploss real NOT NULL,
  status signal_status NOT NULL DEFAULT 'active',
  pnl real DEFAULT 0,
  confidence integer DEFAULT 50,
  confidence_reason text,
  telegram_sent boolean DEFAULT false,
  exit_price real,
  exit_reason text,
  created_at timestamptz DEFAULT now() NOT NULL,
  closed_time timestamptz,
  updated_at timestamptz DEFAULT now() NOT NULL,
  risk_reward_ratio real,
  market_bias text,
  market_regime text,
  regime_confidence real,
  breakout_score real,
  oi_confirmation text,
  vix_at_entry real,
  bid_ask_spread real,
  trailing_stop_active boolean DEFAULT false
);

-- Create logs table
CREATE TABLE IF NOT EXISTS logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL DEFAULT 'info',
  source text NOT NULL,
  message text NOT NULL,
  data text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;

-- Create policies for users table
CREATE POLICY "Allow public read access to users"
  ON users FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow authenticated insert to users"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create policies for signals table
CREATE POLICY "Allow public read access to signals"
  ON signals FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow authenticated insert to signals"
  ON signals FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update to signals"
  ON signals FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated delete from signals"
  ON signals FOR DELETE
  TO authenticated
  USING (true);

-- Create policies for logs table
CREATE POLICY "Allow public read access to logs"
  ON logs FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow authenticated insert to logs"
  ON logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
CREATE INDEX IF NOT EXISTS idx_signals_strategy ON signals(strategy);
CREATE INDEX IF NOT EXISTS idx_signals_created_at ON signals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
