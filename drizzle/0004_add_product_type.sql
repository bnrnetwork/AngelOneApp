-- Add Product Type (INT/CF) to signals table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_type') THEN
    CREATE TYPE product_type AS ENUM ('INT', 'CF');
  END IF;
END$$;

ALTER TABLE signals
ADD COLUMN IF NOT EXISTS product_type product_type NOT NULL DEFAULT 'INT';

UPDATE signals SET product_type = 'INT' WHERE product_type IS NULL;

COMMENT ON COLUMN signals.product_type IS 'Product type for signal execution (INT or CF)';
