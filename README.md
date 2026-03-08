# NoteSync Pro

**Scan handwritten notes → AI converts to Markdown → Upload directly to Notion.**

A multi-user mobile app built with React Native (Expo) and an Express backend with SQLite. Each user has their own account, Notion connection, and Groq API key for OCR.

---

## What it does

1. **Capture** — Take a photo of any handwritten notes in the app
2. **Extract** — Groq's vision AI (LLaMA) reads the handwriting and converts it to structured Markdown
3. **Edit** — Review and tweak the extracted text before uploading
4. **Upload** — Pick any Notion page from your workspace and append the notes directly

---

## Stack

| Layer | Tech |
|-------|------|
| Mobile | React Native + Expo (tested on iOS via Expo Go) |
| Navigation | Expo Router (file-based) |
| Backend | Express.js + Node.js |
| Database | SQLite via Node.js built-in `node:sqlite` (no setup needed) |
| Auth | JWT + bcrypt (email/password, 30-day sessions) |
| OCR | Groq API — LLaMA 3.2 Vision (free tier: 14,400 req/day) |
| Notes | Notion API (Internal Integration) |

---

## Running locally

### Prerequisites
- Node.js v22.5+ (uses built-in `node:sqlite`)
- Expo Go app on your phone

### 1. Clone and install
```bash
git clone <repo-url>
cd Note-Sync-Pro
npm install
```

### 2. Configure environment variables

**`.env`** (server):
```env
JWT_SECRET=your-long-random-secret
DATABASE_PATH=./data/notesync.db
PORT=3000
```
Generate a secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

**`.env.local`** (Expo client):
```env
EXPO_PUBLIC_API_URL=http://192.168.x.x:3000
```
Replace with your Mac's local WiFi IP (`ipconfig getifaddr en0`).

### 3. Run

Open two terminals:
```bash
# Terminal 1 — backend
npm run server:dev

# Terminal 2 — Expo
npx expo start
```

Scan the QR code with **Expo Go** on your phone.

---

## First-time setup (in the app)

1. **Create an account** — Register with email + password
2. **Add your Groq key** — Settings → Add Groq Key → paste from [console.groq.com](https://console.groq.com) (free)
3. **Connect Notion** — Settings → Connect Notion → paste your Internal Integration token from [notion.so/my-integrations](https://notion.so/my-integrations)
4. **Share Notion pages** — In Notion, open a page → `···` → Connections → add your integration

---

## Project structure

```
├── app/                  # Expo Router screens
│   ├── _layout.tsx       # Root layout + auth guard
│   ├── auth.tsx          # Login / Register screen
│   ├── index.tsx         # Main scan screen
│   ├── preview.tsx       # Edit extracted text + upload
│   ├── select-page.tsx   # Notion page picker
│   └── settings.tsx      # Account, Notion + Groq key management
├── lib/
│   ├── auth-context.tsx  # React auth state (JWT, login/logout)
│   ├── query-client.ts   # API client with auth headers
│   └── storage.ts        # Local scan cache (AsyncStorage)
├── server/
│   ├── index.ts          # Express app setup + CORS
│   ├── routes.ts         # All API routes
│   ├── auth.ts           # JWT middleware + register/login handlers
│   └── db.ts             # SQLite setup (auto-creates tables)
└── shared/
    └── schema.ts         # TypeScript types + Zod validation schemas
```

---

## API Keys needed (all free)

| Key | Where to get | Where to add |
|-----|-------------|--------------|
| Groq API key | [console.groq.com](https://console.groq.com) | App Settings |
| Notion Integration token | [notion.so/my-integrations](https://notion.so/my-integrations) | App Settings |
| JWT Secret | Generate locally | `.env` file |

No paid services required.
