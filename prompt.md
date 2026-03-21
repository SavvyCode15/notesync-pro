<!-- 
======================================================================
# NOTESYNC PRO - AI AGENT CONTEXT PROMPT
======================================================================
This file serves as the definitive source of truth for the NoteSync Pro 
project. If you are an AI assistant or coding agent joining this project, 
read this entire file first to understand the architecture, design choices, 
and current state before making any modifications.
====================================================================== 
-->

# NoteSync Pro Context

## 1. Project Overview
**What we are building:**
NoteSync Pro is a full-stack application (Mobile Frontend + Node.js Backend) designed to digitize handwritten notes. Users can capture photos of their notes, convert them to nicely structured Markdown text using AI (Groq's LLaMA 3.2 Vision), and upload the result directly into their personal Notion workspace.

**Key Design Philosophy:**
- **Self-Contained & Replit-Free:** The project was migrated away from Replit-specific infrastructure. No external database services are required (we use built-in `node:sqlite`). It should be extremely easy to run locally on a Mac or deploy to a standard Node.js host (like Render or Railway).
- **Multi-Tenant / Personal API Keys:** Instead of relying on a centralized `.env` file for third-party API keys (Notion, Groq), each user configures their personal API keys in the app's Settings screen. These are stored per-user in the SQLite database.

## 2. Tech Stack & Architecture

### Mobile App (Frontend)
- **Framework:** React Native + Expo (tested via Expo Go `npx expo start`)
- **Routing:** Expo Router (File-based routing in the `app/` folder)
- **Styling:** React Native StyleSheet + Expo Google Fonts (Inter)
- **State Management:** React state + `@tanstack/react-query`
- **Storage:** `@react-native-async-storage/async-storage` for local caching and JWT token storage

### API Server (Backend)
- **Framework:** Express.js + Node.js (v22.5+)
- **Database:** Built-in `node:sqlite` module (No PostgreSQL setup required). DB file goes to `data/notesync.db`.
- **Validation/Schema:** TypeScript interfaces + Zod (removed Drizzle ORM dependencies to keep it lean)
- **Authentication:** Custom JWT-based stateless auth (`jsonwebtoken`) + Password hashing (`bcryptjs`)
- **Server Runner:** `tsx` for local dev watch, `esbuild` for production bundling.

## 3. Core Capabilities & Flows

### Authentication Flow
1. **Frontend:** `app/auth.tsx` provides email/password registration and login.
2. **Backend:** `/api/auth/register` and `/api/auth/login` (in `server/auth.ts`) generate a 30-day JWT.
3. **Storage:** Token is stored in AsyncStorage and appended to all `fetch` queries via `lib/query-client.ts`.

### Connection Flow (Groq & Notion)
1. **Frontend:** `app/settings.tsx` manages API connections. Users paste their personal Notion Integration Secret and Groq API Key here.
2. **Backend:** `/api/user/notion-key` and `/api/user/groq-key` (PUT/DELETE) save the keys in plain text to the `users` table in SQLite.
3. **Database schema:** `users` table holds `email`, `password`, `notion_api_key`, and `groq_api_key`.

### Scanning & OCR Flow
1. **Frontend:** `app/index.tsx` lets users capture an image via `expo-image-picker`. The base64 string is held in memory (`lib/pending-scan.ts`).
2. **Frontend:** User is routed to `app/preview.tsx`. This screen calls `POST /api/scan` with the base64 image.
3. **Backend:** `server/routes.ts` grabs the calling user's personal `groq_api_key` from the database. It calls Groq's `llama-4-scout-17b-16e-instruct` vision model to extract markdown.
4. **Error Handling:** If the user has no key saved, the backend returns `403`, and the frontend prompts them to visit Settings.

### Notion Upload Flow
1. **Frontend:** In `app/preview.tsx`, tapping "Upload to Notion" caches the text and routes to `app/select-page.tsx`.
2. **Backend:** `/api/notion/pages` searches the connected Notion workspace using the user's saved `notion_api_key`.
3. **Backend:** `/api/notion/upload` appends a text block to the selected Notion page ID.
4. **Backend/Database:** A record is saved to the `scans` table (in SQLite) to maintain a local history on `app/index.tsx`.

## 4. Environment Variables Configuration
Only 4 environment variables are used across the whole app. **DO NOT introduce new environment variables for 3rd party APIs like OpenAI/Groq/Notion**—those belong in the user's DB record.

**Backend (`.env`):**
- `JWT_SECRET`: Random string for signing sessions
- `DATABASE_PATH`: Default to `./data/notesync.db`
- `PORT`: Default to `3000`

**Frontend (`.env.local`):**
- `EXPO_PUBLIC_API_URL`: The local WiFi IP of the Mac running the backend (e.g., `http://192.168.1.5:3000`) so the phone can reach the backend.

## 5. Current State & Recent Fixes
- **Status:** The project is functionally complete, fully untethered from Replit, completely self-hosted with SQLite, and fully supports multi-user setups with personal API keys.
- **Recent Patches:** 
  - Fixed a major issue where `node:sqlite` crashed with Disk I/O errors because multiple Node instances tried to access the WAL DB file simultaneously.
  - Finished a migration adding `groq_api_key` to the DB schema (handled via `ALTER TABLE` in `db.ts` on startup).
  - Fixed an issue in `app/_layout.tsx` where declarative navigation (`<Redirect>`) broke auth state transitions; replaced with imperative `router.replace()` in a `useEffect`.

## 6. How to Continue Development (Instructions for AI)
If you are an AI reading this file to continue work:
1. **READ THE CHANGELOG:** Immediately read `AI_CHANGELOG.md` to understand the current exact sprint, open bugs, and what the last AI was working on before you took over.
2. **DO NOT try to add PostgreSQL, Prisma, or Drizzle ORM.** We deliberately migrated away from them to native `node:sqlite` for simplicity.
3. **DO NOT try to hardcode API Keys.** Groq and Notion keys must be fetched from the `users` database table corresponding to the active `req.userId`.
4. **File Locations:**
   - Put all new API endpoints inside `server/routes.ts`.
   - Put database queries inside `server/db.ts` using the simple `dbGet()`, `dbRun()`, `dbAll()` wrapper functions.
   - UI changes go in the `app/` folder (Expo Router).
   - Global state/API fetchers go in `lib/`.
5. **Testing local changes:** You must kill any running `npm run server:dev` on port 3000 and restart it to see backend changes, as it runs via `tsx` but without the `--watch` flag currently.
6. **Always update `prompt.md`** if you make a fundamental architectural change or add a new core flow.
7. **Always update `AI_CHANGELOG.md`** at the end of your session before handing back control, summarizing exactly what you did, what files were touched, and what the next step is.

<!-- 
======================================================================
End of Context Prompt. Have fun building! 🚀
======================================================================
-->
