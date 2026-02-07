# NoteSync - Replit Agent Guide

## Overview

NoteSync is a mobile application that scans handwritten notes using a phone camera, converts them to digital text using AI (OpenAI GPT vision), and uploads the structured content to Notion pages. It solves the problem of keeping handwritten study notes integrated with a digital knowledge base.

The app has two main parts:
- **Mobile frontend**: Built with Expo/React Native, handles camera capture, image preview, text editing, and Notion page selection
- **Backend server**: Express.js API that handles OCR via OpenAI's vision API, Notion integration, and serves the app

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Expo/React Native)

- **Framework**: Expo SDK 54 with expo-router for file-based routing
- **Routing**: File-based routing in `app/` directory with 4 screens:
  - `index.tsx` - Home screen showing scan history
  - `preview.tsx` - Image preview and extracted text editing
  - `select-page.tsx` - Modal for choosing a Notion page to upload to
  - `settings.tsx` - Notion connection status and setup instructions
- **State Management**: React Query (`@tanstack/react-query`) for server state, React `useState` for local UI state
- **Local Storage**: AsyncStorage (`@react-native-async-storage/async-storage`) for persisting scan records on-device (see `lib/storage.ts`)
- **Styling**: StyleSheet-based with a dark theme defined in `constants/colors.ts` (dark background with gold accent colors)
- **Fonts**: Inter font family (400, 500, 600, 700 weights) via `@expo-google-fonts/inter`
- **Animations**: `react-native-reanimated` for fade-in and pulse animations
- **In-memory data passing**: `lib/pending-scan.ts` uses module-level variables to pass scan data between screens (not persisted)

### Backend (Express.js)

- **Location**: `server/` directory
- **Entry point**: `server/index.ts` - sets up Express with CORS handling for Replit domains
- **Routes**: `server/routes.ts` - defines the API endpoints:
  - `POST /api/scan` - Accepts base64 image, sends to OpenAI GPT vision model for OCR/handwriting recognition, returns extracted markdown text
  - `GET /api/notion/pages` - Lists available Notion pages
  - `GET /api/notion/status` - Checks if Notion API key is configured
  - `POST /api/notion/upload` - Uploads extracted text as blocks to a Notion page
- **Body parsing**: 50MB limit for image uploads
- **AI Integration**: OpenAI client configured via `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL` environment variables (Replit AI Integrations)
- **Notion Integration**: `@notionhq/client` using `NOTION_API_KEY` environment variable

### Database

- **Schema**: Defined in `shared/schema.ts` using Drizzle ORM with PostgreSQL dialect
- **Current tables**: `users` table (basic username/password), `conversations` and `messages` tables (in `shared/models/chat.ts`) - these appear to be from Replit integration templates and are not central to the note-scanning feature
- **Storage layer**: `server/storage.ts` currently uses in-memory storage (`MemStorage`) rather than the database for user data
- **Config**: `drizzle.config.ts` expects `DATABASE_URL` environment variable
- **Push command**: `npm run db:push` to push schema to database

### Replit Integration Modules

The `server/replit_integrations/` directory contains pre-built integration modules (audio, chat, image, batch). These are mostly template/utility code provided by Replit and are not core to the app's note-scanning functionality. The chat storage module (`server/replit_integrations/chat/storage.ts`) does use the database via Drizzle.

### Build & Deployment

- **Dev mode**: Two processes needed - `npm run expo:dev` for the Expo dev server and `npm run server:dev` for the Express API
- **Production build**: `npm run expo:static:build` builds the Expo web app, `npm run server:build` bundles the server with esbuild, `npm run server:prod` runs production
- **API URL resolution**: The frontend discovers the API server URL via `EXPO_PUBLIC_DOMAIN` environment variable (set automatically on Replit)

## External Dependencies

### Required Environment Variables
- `DATABASE_URL` - PostgreSQL connection string (required for Drizzle/db operations)
- `AI_INTEGRATIONS_OPENAI_API_KEY` - OpenAI API key for vision/OCR (via Replit AI Integrations)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` - OpenAI base URL (via Replit AI Integrations)
- `NOTION_API_KEY` - Notion integration token for reading/writing pages
- `EXPO_PUBLIC_DOMAIN` - Auto-set by Replit, used for API URL discovery
- `REPLIT_DEV_DOMAIN` - Auto-set by Replit, used for CORS and dev server

### Third-Party Services
- **OpenAI API** (GPT vision model) - Core AI for handwriting recognition/OCR
- **Notion API** (`@notionhq/client`) - Reading page lists and uploading converted notes as page content
- **PostgreSQL** - Database via Drizzle ORM (needs provisioning on Replit)

### Key Libraries
- `expo` ~54.0 - Mobile app framework
- `expo-router` ~6.0 - File-based routing
- `expo-image-picker` - Camera/gallery image capture
- `express` ^5.0 - Backend API server
- `openai` ^6.18 - OpenAI SDK
- `drizzle-orm` / `drizzle-kit` - Database ORM and migrations
- `@tanstack/react-query` - Server state management
- `react-native-reanimated` - Animations
- `patch-package` - Post-install patches (runs on `npm install`)