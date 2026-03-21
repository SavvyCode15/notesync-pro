import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { Client } from "@notionhq/client";
import express from "express";
import jwt from "jsonwebtoken";
import { dbGet, dbAll, dbRun } from "./db";
import {
  authMiddleware,
  registerHandler,
  loginHandler,
  getMeHandler,
  getNotionKeyForUser,
  type AuthRequest,
} from "./auth";

// ============================================================
// Config
// ============================================================
const FREE_SCANS_PER_DAY = 5;
const SERVER_GROQ_KEY = process.env.GROQ_API_KEY ?? null;
const NOTION_CLIENT_ID = process.env.NOTION_CLIENT_ID ?? null;
const NOTION_CLIENT_SECRET = process.env.NOTION_CLIENT_SECRET ?? null;
const JWT_SECRET = process.env.JWT_SECRET || "notesync-dev-secret-change-in-production";

// ============================================================
// Groq Vision OCR
// ============================================================

async function callGroqVision(apiKey: string, base64Image: string): Promise<string> {
  const prompt = `You are an expert at reading handwritten notes and converting them into well-structured digital text.

Rules:
- Extract ALL text from the handwritten notes accurately
- Preserve the structure: headers, bullet points, numbered lists, code snippets
- Use Markdown formatting:
  - # for main headers, ## for sub-headers, ### for sub-sub-headers
  - - for bullet points, 1. for numbered lists
  - \`\`\`language for code blocks
  - > for quotes/important notes
  - **bold** for emphasized text
  - Tables using | syntax if detected
- Mark unclear text with [?]
- Do NOT add content not in the notes

Please convert these handwritten notes into well-structured Markdown.`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
        ],
      }],
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    const err = new Error(`Groq API error ${res.status}: ${errText}`) as any;
    err.status = res.status;
    throw err;
  }

  const data = await res.json() as any;
  return data?.choices?.[0]?.message?.content ?? "";
}

/**
 * Generates a short 4-6 word title for a note using Groq.
 * Uses the faster llama-3.1-8b model to keep latency low.
 */
async function generateNoteTitle(apiKey: string, extractedText: string): Promise<string> {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{
          role: "user",
          content: `Create a short, descriptive title (4-6 words maximum) for these notes. Reply with ONLY the title, no quotes, no punctuation at the end.\n\nNotes:\n${extractedText.slice(0, 500)}`,
        }],
        max_tokens: 20,
      }),
    });
    if (!res.ok) return "Untitled Note";
    const data = await res.json() as any;
    const title = data?.choices?.[0]?.message?.content?.trim() ?? "Untitled Note";
    return title.slice(0, 60); // cap at 60 chars
  } catch {
    return "Untitled Note";
  }
}

async function getNotionClientForUser(userId: string): Promise<Client | null> {
  const key = await getNotionKeyForUser(userId);
  if (!key) return null;
  return new Client({ auth: key });
}

/** Count how many scans this user has submitted today (UTC). */
async function getDailyScanCount(userId: string): Promise<number> {
  const row = await dbGet<{ c: number }>(
    "SELECT COUNT(*) as c FROM scans WHERE user_id = ? AND date(created_at, 'unixepoch') = date('now')",
    [userId]
  );
  return row?.c ?? 0;
}

export async function registerRoutes(app: Express): Promise<Server> {
  const largeBodyParser = express.json({ limit: "50mb" });

  // ── Auth ──────────────────────────────────────────────────
  app.post("/api/auth/register", express.json(), registerHandler);
  app.post("/api/auth/login", express.json(), loginHandler);
  app.get("/api/auth/me", authMiddleware, getMeHandler);

  // ── User Notion Key ────────────────────────────────────────
  app.put("/api/user/notion-key", authMiddleware, express.json(), async (req: AuthRequest, res) => {
    try {
      const { notionApiKey } = req.body;
      if (!notionApiKey) return res.status(400).json({ error: "notionApiKey is required" });
      await dbRun("UPDATE users SET notion_api_key = ? WHERE id = ?", [notionApiKey.trim(), req.userId!]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to update Notion key" });
    }
  });

  app.delete("/api/user/notion-key", authMiddleware, async (req: AuthRequest, res) => {
    try {
      await dbRun("UPDATE users SET notion_api_key = NULL WHERE id = ?", [req.userId!]);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to disconnect Notion" });
    }
  });

  // ── User Groq Key ─────────────────────────────────────────
  app.put("/api/user/groq-key", authMiddleware, express.json(), async (req: AuthRequest, res) => {
    try {
      const { groqApiKey } = req.body;
      if (!groqApiKey) return res.status(400).json({ error: "groqApiKey is required" });
      await dbRun("UPDATE users SET groq_api_key = ? WHERE id = ?", [groqApiKey.trim(), req.userId!]);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to update Groq key" });
    }
  });

  app.delete("/api/user/groq-key", authMiddleware, async (req: AuthRequest, res) => {
    try {
      await dbRun("UPDATE users SET groq_api_key = NULL WHERE id = ?", [req.userId!]);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to remove Groq key" });
    }
  });

  // ── Scan usage (daily free tier) ─────────────────────────
  app.get("/api/user/scan-usage", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const used = await getDailyScanCount(req.userId!);
      res.json({ used, limit: FREE_SCANS_PER_DAY, remaining: Math.max(0, FREE_SCANS_PER_DAY - used) });
    } catch {
      res.status(500).json({ error: "Failed to fetch scan usage" });
    }
  });

  // ── Scan CRUD ─────────────────────────────────────────────
  app.get("/api/scans", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const userScans = await dbAll(
        "SELECT id, user_id, title, image_uri, extracted_text, notion_page_id, notion_page_title, status, created_at FROM scans WHERE user_id = ? ORDER BY created_at DESC",
        [req.userId!]
      );
      res.json({ scans: userScans });
    } catch (err) {
      console.error("Get scans error:", err);
      res.status(500).json({ error: "Failed to fetch scans" });
    }
  });

  app.post("/api/scans", authMiddleware, largeBodyParser, async (req: AuthRequest, res) => {
    try {
      const { id, imageUri, imageBase64, extractedText, title, status } = req.body;
      if (!id) return res.status(400).json({ error: "id is required" });
      await dbRun(
        "INSERT INTO scans (id, user_id, title, image_uri, image_base64, extracted_text, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [id, req.userId!, title || null, imageUri || null, imageBase64 || null, extractedText || "", status || "processing"]
      );
      const scan = await dbGet("SELECT id, user_id, title, image_uri, extracted_text, status, created_at FROM scans WHERE id = ?", [id]);
      res.json({ scan });
    } catch (err) {
      console.error("Create scan error:", err);
      res.status(500).json({ error: "Failed to create scan" });
    }
  });

  app.put("/api/scans/:id", authMiddleware, express.json(), async (req: AuthRequest, res) => {
    try {
      const id = String(req.params.id);
      const { extractedText, title, notionPageId, notionPageTitle, status } = req.body;
      await dbRun(
        "UPDATE scans SET extracted_text = COALESCE(?, extracted_text), title = COALESCE(?, title), notion_page_id = COALESCE(?, notion_page_id), notion_page_title = COALESCE(?, notion_page_title), status = COALESCE(?, status) WHERE id = ? AND user_id = ?",
        [extractedText ?? null, title ?? null, notionPageId ?? null, notionPageTitle ?? null, status ?? null, id, req.userId!]
      );
      const scan = await dbGet("SELECT * FROM scans WHERE id = ?", [id]);
      res.json({ scan });
    } catch (err) {
      console.error("Update scan error:", err);
      res.status(500).json({ error: "Failed to update scan" });
    }
  });

  app.delete("/api/scans/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      await dbRun("DELETE FROM scans WHERE id = ? AND user_id = ?", [String(req.params.id), req.userId!]);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to delete scan" });
    }
  });

  // ── Serve scan image (used for Notion image blocks) ───────
  app.get("/api/scans/:id/image", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const row = await dbGet<{ image_base64: string | null }>(
        "SELECT image_base64 FROM scans WHERE id = ? AND user_id = ?",
        [String(req.params.id), req.userId!]
      );
      if (!row?.image_base64) return res.status(404).json({ error: "Image not found" });
      const buffer = Buffer.from(row.image_base64, "base64");
      res.set("Content-Type", "image/jpeg");
      res.set("Cache-Control", "public, max-age=86400");
      res.send(buffer);
    } catch {
      res.status(500).json({ error: "Failed to serve image" });
    }
  });

  // ── OCR ────────────────────────────────────────────────────
  app.post("/api/scan", authMiddleware, largeBodyParser, async (req: AuthRequest, res) => {
    try {
      const { image } = req.body;
      if (!image) return res.status(400).json({ error: "image is required" });

      // Determine which Groq key to use
      const userRow = await dbGet<{ groq_api_key: string | null }>("SELECT groq_api_key FROM users WHERE id = ?", [req.userId!]);
      let groqApiKey: string | null = userRow?.groq_api_key ?? null;

      if (!groqApiKey) {
        const dailyUsed = await getDailyScanCount(req.userId!);
        if (dailyUsed >= FREE_SCANS_PER_DAY) {
          return res.status(403).json({
            error: "SCAN_LIMIT_REACHED",
            message: `You've used all ${FREE_SCANS_PER_DAY} free scans for today. Add your own Groq API key in Settings for unlimited access.`,
            used: dailyUsed,
            limit: FREE_SCANS_PER_DAY,
          });
        }
        if (!SERVER_GROQ_KEY) {
          return res.status(403).json({ error: "No Groq API key available. Please add your own key in Settings." });
        }
        groqApiKey = SERVER_GROQ_KEY;
      }

      let extractedText: string;
      try {
        extractedText = await callGroqVision(groqApiKey, image);
      } catch (err: any) {
        if (err.status === 429) {
          return res.status(429).json({ error: "OCR rate limit reached. Please wait a minute and try again." });
        }
        throw err;
      }

      // Generate AI title (fast, uses 8b model — runs in parallel)
      const title = await generateNoteTitle(groqApiKey, extractedText);

      res.json({ text: extractedText, title, success: true });
    } catch (error) {
      console.error("OCR error:", error);
      res.status(500).json({ error: "Failed to process image" });
    }
  });

  // ── Notion OAuth ───────────────────────────────────────────
  app.get("/api/notion/auth", async (req, res) => {
    const token = req.query.token as string | undefined;
    if (!token) return res.status(401).send("Missing token");
    let userId: string;
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
      userId = payload.userId;
    } catch {
      return res.status(401).send("Invalid or expired token");
    }
    if (!NOTION_CLIENT_ID) {
      return res.status(503).json({ error: "Notion OAuth is not configured. Set NOTION_CLIENT_ID and NOTION_CLIENT_SECRET in .env" });
    }
    const protocol = req.headers["x-forwarded-proto"] || req.protocol;
    const host = req.headers["x-forwarded-host"] || req.get("host");
    const apiUrl = `${protocol}://${host}`;
    const redirectUri = `${apiUrl}/api/notion/callback`;
    const state = jwt.sign({ userId }, JWT_SECRET, { expiresIn: "10m" });
    const params = new URLSearchParams({ client_id: NOTION_CLIENT_ID, response_type: "code", owner: "user", redirect_uri: redirectUri, state });
    res.redirect(`https://api.notion.com/v1/oauth/authorize?${params.toString()}`);
  });

  app.get("/api/notion/callback", async (req, res) => {
    const { code, state, error } = req.query as Record<string, string>;
    if (error) return res.redirect("notesync://notion-error?reason=access_denied");
    if (!code || !state) return res.redirect("notesync://notion-error?reason=missing_params");
    let userId: string;
    try {
      const payload = jwt.verify(state, JWT_SECRET) as { userId: string };
      userId = payload.userId;
    } catch {
      return res.redirect("notesync://notion-error?reason=invalid_state");
    }
    if (!NOTION_CLIENT_ID || !NOTION_CLIENT_SECRET) return res.redirect("notesync://notion-error?reason=server_config");
    try {
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.get("host");
      const apiUrl = `${protocol}://${host}`;
      const redirectUri = `${apiUrl}/api/notion/callback`;
      const credentials = Buffer.from(`${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`).toString("base64");
      const tokenRes = await fetch("https://api.notion.com/v1/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Basic ${credentials}`, "Notion-Version": "2022-06-28" },
        body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
      });
      if (!tokenRes.ok) return res.redirect("notesync://notion-error?reason=token_exchange");
      const tokenData = await tokenRes.json() as { access_token: string };
      await dbRun("UPDATE users SET notion_api_key = ? WHERE id = ?", [tokenData.access_token, userId]);
      res.redirect("notesync://notion-connected");
    } catch (err) {
      console.error("Notion OAuth callback error:", err);
      res.redirect("notesync://notion-error?reason=server_error");
    }
  });

  // ── Notion Workspace API ───────────────────────────────────
  app.get("/api/notion/status", authMiddleware, async (req: AuthRequest, res) => {
    const notion = await getNotionClientForUser(req.userId!);
    if (!notion) return res.json({ connected: false });
    try {
      const user = await notion.users.me({});
      res.json({ connected: true, user: user.name || "Connected" });
    } catch {
      res.json({ connected: false, error: "Invalid token" });
    }
  });

  app.get("/api/notion/pages", authMiddleware, async (req: AuthRequest, res) => {
    const notion = await getNotionClientForUser(req.userId!);
    if (!notion) return res.status(401).json({ error: "Notion not configured" });
    try {
      const query = (req.query.q as string) || "";
      const response = await notion.search({ query, filter: { property: "object", value: "page" }, page_size: 50 });
      const pages = response.results.map((page: any) => {
        let pageTitle = "Untitled";
        for (const [, value] of Object.entries(page.properties || {})) {
          const prop = value as any;
          if (prop.type === "title" && prop.title?.length > 0) { pageTitle = prop.title[0].plain_text; break; }
        }
        if (pageTitle === "Untitled" && page.properties?.title?.title?.[0]?.plain_text) pageTitle = page.properties.title.title[0].plain_text;
        return { id: page.id, title: pageTitle, icon: page.icon?.emoji || null, lastEdited: page.last_edited_time, url: page.url };
      });
      res.json({ pages });
    } catch (error) {
      console.error("Notion pages error:", error);
      res.status(500).json({ error: "Failed to fetch pages" });
    }
  });

  app.post("/api/notion/upload", authMiddleware, express.json(), async (req: AuthRequest, res) => {
    const notion = await getNotionClientForUser(req.userId!);
    if (!notion) return res.status(401).json({ error: "Notion not configured" });
    try {
      const { pageId, content, scanId } = req.body;
      if (!pageId || !content) return res.status(400).json({ error: "pageId and content are required" });

      const blocks: any[] = [];

      // If scanId provided, prepend the original scan image as a Notion image block
      if (scanId) {
        const protocol = req.headers["x-forwarded-proto"] || req.protocol;
        const host = req.headers["x-forwarded-host"] || req.get("host");
        const apiUrl = `${protocol}://${host}`;
        const scanRow = await dbGet<{ image_base64: string | null }>(
          "SELECT image_base64 FROM scans WHERE id = ? AND user_id = ?",
          [scanId, req.userId!]
        );
        if (scanRow?.image_base64) {
          // We serve the image from our own API, Notion fetches it as an external image
          const imageUrl = `${apiUrl}/api/scans/${scanId}/image`;
          blocks.push({
            object: "block",
            type: "image",
            image: { type: "external", external: { url: imageUrl } },
          });
        }
      }

      blocks.push(...markdownToNotionBlocks(content));

      for (let i = 0; i < blocks.length; i += 100) {
        await notion.blocks.children.append({ block_id: pageId, children: blocks.slice(i, i + 100) });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Notion upload error:", error);
      res.status(500).json({ error: "Failed to upload to Notion" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// ============================================================
// Markdown → Notion blocks
// ============================================================

function markdownToNotionBlocks(markdown: string): any[] {
  const blocks: any[] = [];
  blocks.push({ object: "block", type: "divider", divider: {} });
  blocks.push({ object: "block", type: "heading_3", heading_3: { rich_text: [{ type: "text", text: { content: `Scanned Notes — ${new Date().toLocaleString()}` } }] } });
  const lines = markdown.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") { i++; continue; }
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim() || "plain text";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) { codeLines.push(lines[i]); i++; }
      i++;
      if (codeLines.join("").trim()) blocks.push({ object: "block", type: "code", code: { rich_text: [{ type: "text", text: { content: codeLines.join("\n").slice(0, 2000) } }], language: mapLang(lang.toLowerCase()) } });
      continue;
    }
    if (line.startsWith("### ")) blocks.push({ object: "block", type: "heading_3", heading_3: { rich_text: parseInline(line.slice(4)) } });
    else if (line.startsWith("## ")) blocks.push({ object: "block", type: "heading_2", heading_2: { rich_text: parseInline(line.slice(3)) } });
    else if (line.startsWith("# ")) blocks.push({ object: "block", type: "heading_1", heading_1: { rich_text: parseInline(line.slice(2)) } });
    else if (line.trim().match(/^[-*] /)) blocks.push({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: parseInline(line.trim().slice(2)) } });
    else if (/^\d+\.\s/.test(line.trim())) blocks.push({ object: "block", type: "numbered_list_item", numbered_list_item: { rich_text: parseInline(line.trim().replace(/^\d+\.\s/, "")) } });
    else if (line.trim().startsWith("> ")) blocks.push({ object: "block", type: "quote", quote: { rich_text: [{ type: "text", text: { content: line.trim().slice(2) } }] } });
    else if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) { if (!lines[i].match(/^\|[\s\-:|]+\|$/)) tableLines.push(lines[i]); i++; }
      if (tableLines.length) { const rows = tableLines.map(tl => tl.split("|").filter(c => c.trim()).map(c => c.trim())); const w = Math.max(...rows.map(r => r.length)); blocks.push({ object: "block", type: "table", table: { table_width: w, has_column_header: true, has_row_header: false, children: rows.map(row => ({ object: "block", type: "table_row", table_row: { cells: Array.from({ length: w }, (_, idx) => [{ type: "text", text: { content: row[idx] || "" } }]) } })) } }); }
      continue;
    } else if (line.trim()) blocks.push({ object: "block", type: "paragraph", paragraph: { rich_text: parseInline(line.trim()) } });
    i++;
  }
  return blocks;
}

function parseInline(text: string): any[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/);
  const result = parts.flatMap(part => {
    if (part.startsWith("**") && part.endsWith("**")) return [{ type: "text", text: { content: part.slice(2, -2) }, annotations: { bold: true } }];
    if (part.startsWith("*") && part.endsWith("*") && !part.startsWith("**")) return [{ type: "text", text: { content: part.slice(1, -1) }, annotations: { italic: true } }];
    if (part.startsWith("`") && part.endsWith("`")) return [{ type: "text", text: { content: part.slice(1, -1) }, annotations: { code: true } }];
    return part ? [{ type: "text", text: { content: part } }] : [];
  });
  return result.length ? result : [{ type: "text", text: { content: text } }];
}

function mapLang(lang: string): string {
  return ({ js: "javascript", ts: "typescript", py: "python", rb: "ruby", sh: "bash", yml: "yaml", md: "markdown", "c++": "c++", "c#": "c#", golang: "go", rs: "rust", kt: "kotlin" } as any)[lang] || lang || "plain text";
}
