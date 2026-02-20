import "dotenv/config";
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const client = await pool.connect();

  try {
    const migrationsDir = path.join(__dirname, "../drizzle");
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();

    let skipped = 0;
    let executed = 0;

    for (const file of files) {
      const migrationPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(migrationPath, "utf-8");

      try {
        console.log(`Running migration: ${file}...`);
        await client.query(sql);
        console.log(`✓ ${file} completed successfully`);
        executed++;
      } catch (err: any) {
        // Skip if schema/structure already exists (idempotent migrations)
        if (err.code === '42701' || err.code === '42P07' || err.message?.includes('already exists')) {
          console.log(`⊘ ${file} skipped (already applied)`);
          skipped++;
        } else {
          throw err;
        }
      }
    }

    console.log(`\n✅ Migration complete: ${executed} executed, ${skipped} skipped`);
  } catch (err) {
    console.error("✗ Migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
