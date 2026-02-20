-- Add Regime AI Confidence tracking to signals table
ALTER TABLE signals ADD COLUMN IF NOT EXISTS regime_confidence REAL DEFAULT 50;

-- Add index for regime analysis queries
CREATE INDEX IF NOT EXISTS idx_signals_regime_confidence ON signals(regime_confidence DESC);

-- Comment on new column
COMMENT ON COLUMN signals.regime_confidence IS 'Regime AI classifier confidence level (0-100)';
