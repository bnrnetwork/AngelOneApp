import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

// Construct Supabase database URL from project URL
const supabaseUrl = process.env.VITE_SUPABASE_URL;
let databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && supabaseUrl) {
  // Extract project ref from Supabase URL
  const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
  if (match) {
    const projectRef = match[1];
    // Use transaction pooler (port 6543) for better connection management
    databaseUrl = `postgresql://postgres.${projectRef}:[YOUR-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres`;
    console.log("⚠️  Using Supabase connection. Please set DATABASE_URL with your actual password.");
  }
}

// Check if database URL is properly configured
const hasValidDbUrl = databaseUrl && !databaseUrl.includes('[YOUR-PASSWORD]');

if (!hasValidDbUrl) {
  console.warn("⚠️  DATABASE_URL not configured. Database features will be disabled.");
  console.warn("⚠️  Set DATABASE_URL environment variable to enable database persistence.");
}

console.log("DB URL:", databaseUrl ? databaseUrl.replace(/:[^:@]+@/, ':****@') : 'Not configured');

// Create pool only if we have a valid database URL
const pool = hasValidDbUrl ? new Pool({
  connectionString: databaseUrl,
}) : null;

export const db = pool ? drizzle(pool, { schema }) : null;
