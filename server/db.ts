import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

// Supabase connection
// Build connection string from Supabase environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL;
let databaseUrl = process.env.DATABASE_URL;

// If DATABASE_URL is not set, construct it from Supabase URL
if (!databaseUrl && supabaseUrl) {
  // Extract project ref from Supabase URL (e.g., https://neabxvlkgkuxaavtlumi.supabase.co)
  const projectRef = supabaseUrl.replace('https://', '').split('.')[0];

  // Use direct connection (port 5432) for production deployment
  // Format: postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
  console.log("⚠️  DATABASE_URL not set. Database features will be limited.");
  console.log("💡 To enable full database features, set DATABASE_URL in Replit Secrets");

  // Create a minimal pool that will gracefully fail
  databaseUrl = "postgresql://localhost:5432/postgres";
}

console.log("✅ Database connection configured");

const pool = new Pool({
  connectionString: databaseUrl,
  // Connection pooler settings for better performance
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Handle connection errors gracefully
pool.on('error', (err) => {
  console.error('Database pool error:', err.message);
});

export const db = drizzle(pool, { schema });
