import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

// Supabase connection via MCP
// The DATABASE_URL is automatically configured by Supabase MCP
const databaseUrl = process.env.DATABASE_URL;

console.log("✅ Using Supabase database via MCP");

const pool = new Pool({
  connectionString: databaseUrl,
  // Connection pooler settings for better performance
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export const db = drizzle(pool, { schema });
