import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";

// Database file location — configurable via DATABASE_PATH env var
const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.cwd(), process.env.DATABASE_PATH)
  : path.resolve(process.cwd(), "data", "notesync.db");

// Ensure the data directory exists
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// Open (or create) the database file using the built-in Node.js SQLite module
// Available since Node.js v22.5.0 — no native compilation required
export const sqlite = new DatabaseSync(dbPath);

// Enable WAL mode for better concurrent read performance
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");

// Auto-create tables on first run (no drizzle-kit push needed)
sqlite.exec(`
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
    image_uri TEXT,
    extracted_text TEXT DEFAULT '',
    notion_page_id TEXT,
    notion_page_title TEXT,
    status TEXT NOT NULL DEFAULT 'processing',
    created_at INTEGER DEFAULT (unixepoch())
  );
`);

// Migrate existing databases: add groq_api_key if it doesn't exist yet
try {
  sqlite.exec("ALTER TABLE users ADD COLUMN groq_api_key TEXT;");
} catch {
  // Column already exists — ignore
}

console.log("✅ SQLite DB ready at: " + dbPath);

// ============================================================
// Typed query helpers (thin wrapper around node:sqlite)
// ============================================================

export function dbGet<T = any>(sql: string, params: any[] = []): T | undefined {
  return sqlite.prepare(sql).get(...params) as T | undefined;
}

export function dbAll<T = any>(sql: string, params: any[] = []): T[] {
  return sqlite.prepare(sql).all(...params) as T[];
}

export function dbRun(sql: string, params: any[] = []): { changes: number; lastInsertRowid: number | bigint } {
  return sqlite.prepare(sql).run(...params) as any;
}
