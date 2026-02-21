/*
  # Fix Security Issues

  ## Changes Made

  1. **Remove Unused Indexes**
     - Drop `idx_signals_status` (not being used by queries)
     - Drop `idx_signals_strategy` (not being used by queries)
     - Drop `idx_signals_created_at` (not being used by queries)
     - Drop `idx_logs_created_at` (not being used by queries)
     - Drop `idx_logs_level` (not being used by queries)

  2. **Fix RLS Policies with Proper Access Control**
     - Replace overly permissive policies with service role access
     - This application is server-side only (no client-side database access)
     - All database operations go through the server API
     - Remove policies that use `USING (true)` or `WITH CHECK (true)`
     
  3. **Create Service Role Policies**
     - Add policies that allow the service role full access
     - Block direct client access (enforce server-side only architecture)

  ## Security Model
  
  This is a **server-side application** where:
  - All database operations are performed by the backend server
  - The server uses the service role key (full access)
  - Client applications only interact with REST APIs
  - No direct database access from clients
  
  Therefore, RLS policies should:
  - Allow service_role full access to all tables
  - Restrict authenticated/anon users (they shouldn't access DB directly)
*/

-- =====================================================
-- 1. DROP UNUSED INDEXES
-- =====================================================

DROP INDEX IF EXISTS idx_signals_status;
DROP INDEX IF EXISTS idx_signals_strategy;
DROP INDEX IF EXISTS idx_signals_created_at;
DROP INDEX IF EXISTS idx_logs_created_at;
DROP INDEX IF EXISTS idx_logs_level;

-- =====================================================
-- 2. DROP INSECURE POLICIES
-- =====================================================

-- Drop all existing policies
DROP POLICY IF EXISTS "Allow public read access to users" ON users;
DROP POLICY IF EXISTS "Allow authenticated insert to users" ON users;
DROP POLICY IF EXISTS "Allow public read access to signals" ON signals;
DROP POLICY IF EXISTS "Allow authenticated insert to signals" ON signals;
DROP POLICY IF EXISTS "Allow authenticated update to signals" ON signals;
DROP POLICY IF EXISTS "Allow authenticated delete from signals" ON signals;
DROP POLICY IF EXISTS "Allow public read access to logs" ON logs;
DROP POLICY IF EXISTS "Allow authenticated insert to logs" ON logs;

-- =====================================================
-- 3. CREATE SECURE SERVICE ROLE POLICIES
-- =====================================================

-- Users table: Only service role can access
CREATE POLICY "Service role full access to users"
  ON users
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Signals table: Only service role can access
CREATE POLICY "Service role full access to signals"
  ON signals
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Logs table: Only service role can access
CREATE POLICY "Service role full access to logs"
  ON logs
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- 4. CREATE RESTRICTED POLICIES FOR OTHER ROLES
-- =====================================================

-- Block authenticated/anon users from direct DB access
-- (They should only use the API endpoints)

CREATE POLICY "Block direct authenticated access to users"
  ON users
  TO authenticated
  USING (false);

CREATE POLICY "Block direct authenticated access to signals"
  ON signals
  TO authenticated
  USING (false);

CREATE POLICY "Block direct authenticated access to logs"
  ON logs
  TO authenticated
  USING (false);

CREATE POLICY "Block direct anon access to users"
  ON users
  TO anon
  USING (false);

CREATE POLICY "Block direct anon access to signals"
  ON signals
  TO anon
  USING (false);

CREATE POLICY "Block direct anon access to logs"
  ON logs
  TO anon
  USING (false);