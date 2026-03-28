import { createClient, type Client } from "@libsql/client";
import path from "path";
import fs from "fs";

// ============================================================
// Database connection
// In local dev: uses a local SQLite file (file: URL)
// In production (Render): uses Turso hosted database (https: URL)
// ============================================================

function getDbUrl(): string {
  // Production: Turso hosted SQLite
  if (process.env.TURSO_DATABASE_URL) {
    return process.env.TURSO_DATABASE_URL;
  }
  // Local dev: plain SQLite file via libsql
  const dbPath = process.env.DATABASE_PATH
    ? path.resolve(process.cwd(), process.env.DATABASE_PATH)
    : path.resolve(process.cwd(), "data", "notesync.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  return `file:${dbPath}`;
}

export let db: Client;

export async function initDb(): Promise<void> {
  db = createClient({
    url: getDbUrl(),
    authToken: process.env.TURSO_AUTH_TOKEN, // undefined for local file — that's fine
  });

  // Auto-create / migrate tables
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      name TEXT,
      notion_api_key TEXT,
      groq_api_key TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS scans (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT,
      image_uri TEXT,
      image_base64 TEXT,
      extracted_text TEXT DEFAULT '',
      notion_page_id TEXT,
      notion_page_title TEXT,
      diagrams_base64 TEXT,
      status TEXT NOT NULL DEFAULT 'processing',
      created_at INTEGER DEFAULT (unixepoch())
    );
  `);

  // Backwards-compatible migrations for existing databases
  const migrations = [
    "ALTER TABLE users ADD COLUMN groq_api_key TEXT",
    "ALTER TABLE scans ADD COLUMN title TEXT",
    "ALTER TABLE scans ADD COLUMN image_base64 TEXT",
    "ALTER TABLE scans ADD COLUMN diagrams_base64 TEXT",
  ];
  for (const sql of migrations) {
    try { await db.execute(sql); } catch { /* column already exists */ }
  }

  console.log(`✅ DB ready: ${getDbUrl().startsWith("file:") ? "local SQLite" : "Turso cloud"}`);
}

// ============================================================
// Typed query helpers
// ============================================================

export async function dbGet<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
  const result = await db.execute({ sql, args: params });
  return result.rows[0] as T | undefined;
}

export async function dbAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const result = await db.execute({ sql, args: params });
  return result.rows as T[];
}

export async function dbRun(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid: bigint | number }> {
  const result = await db.execute({ sql, args: params });
  return { changes: result.rowsAffected, lastInsertRowid: result.lastInsertRowid ?? 0 };
}
