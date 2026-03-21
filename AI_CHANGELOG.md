# AI Context Changelog & State Sync

> **Instructions for AI:**
> 1. Read the latest entries in this file to understand exactly where the previous AI left off.
> 2. Before ending your session or completing a major feature, **you must append a new entry** to this log.
> 3. Document any architectural decisions made, bugs fixed, and what the immediate next steps should be.

---

## [2026-03-21] Session: Turso DB Migration & AI Features

**Completed Work:**
- **Database Architecture Re-write:** Migrated from `node:sqlite` to `@libsql/client` (Turso). DB is fully async now. Local dev uses file URL, Prod will use `TURSO_DATABASE_URL`.
- **AI-Generated Note Titles:** Added `generateNoteTitle` using `llama-3.1-8b-instant`. Returns smart 4-6 word titles along with the OCR extracted text.
- **Scan Image to Notion:** Saved `imageBase64` into DB during scan. Added endpoint `GET /api/scans/:id/image`. When sending to Notion, an external image block linking to that endpoint is prepended to the page content.
- Updated `app/index.tsx` home screen to show AI note titles instead of "Processing...".

**Files Changed:**
- `server/db.ts`, `server/auth.ts`, `server/routes.ts`, `server/index.ts`
- `app/preview.tsx`, `app/index.tsx`
- `lib/storage.ts`, `lib/pending-scan.ts`

**Next Steps Handover:**
- The codebase is ready to be hosted on Render + Turso.
- Next step: Create a free Turso DB, attach `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` in Render, and deploy the server!

---

## [2026-03-21] Session: Environment Sync & Migration to SQLite

**Completed Work:**
- Fully migrated backend from Replit's PostgreSQL to standalone `node:sqlite`.
- Removed all dependencies on Drizzle ORM and Replit AI integrations.
- Created multi-tenant auth system where users input their personal Notion and Groq API keys locally.
- Fixed 4 critical bugs relating to Groq API key schema, ensuring it's properly pulled from SQLite `/api/scan`.
- App is fully functional locally via `npm run server:dev` and `npx expo start`.

**Architectural Updates:**
- Global `.env` is ONLY used for backend config (`JWT_SECRET`, `PORT`, `DATABASE_PATH`). 
- ALL 3rd-party integration keys (Groq, Notion) are in the `users` SQLite table.

**Blocked / Open Issues:**
- None. Everything is working.

**Next Steps Handover:**
- Ready for active feature development or deployment planning. If continuing on a new system, ensure you run `git pull`, `npm install`, and `npm run server:dev` first.
