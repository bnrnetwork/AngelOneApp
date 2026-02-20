-- Add closed_time column to signals table
ALTER TABLE signals ADD COLUMN closed_time timestamp;

-- Backfill closed_time for existing closed signals
UPDATE signals SET closed_time = updated_at WHERE status != 'active' AND closed_time IS NULL;
