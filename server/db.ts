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

console.log("DB URL:", databaseUrl ? databaseUrl.replace(/:[^:@]+@/, ':****@') : 'Not configured');

const pool = new Pool({
  connectionString: databaseUrl,
});

export const db = drizzle(pool, { schema });
