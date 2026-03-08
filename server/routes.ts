import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { Client } from "@notionhq/client";
import express from "express";
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
// Groq Vision OCR (free tier: 14,400 req/day)
// ============================================================

async function callGroqVision(base64Image: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Missing GROQ_API_KEY in .env — get a free key at console.groq.com");

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

function getNotionClientForUser(userId: string): Client | null {
  const key = getNotionKeyForUser(userId);
  if (!key) return null;
  return new Client({ auth: key });
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
      dbRun("UPDATE users SET notion_api_key = ? WHERE id = ?", [notionApiKey.trim(), req.userId!]);
      res.json({ success: true });
    } catch (err) {
      console.error("Update notion key error:", err);
      res.status(500).json({ error: "Failed to update Notion key" });
    }
  });

  app.delete("/api/user/notion-key", authMiddleware, async (req: AuthRequest, res) => {
    try {
      dbRun("UPDATE users SET notion_api_key = NULL WHERE id = ?", [req.userId!]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to disconnect Notion" });
    }
  });

  // ── Scan history ───────────────────────────────────────────
  app.get("/api/scans", authMiddleware, (req: AuthRequest, res) => {
    try {
      const userScans = dbAll("SELECT * FROM scans WHERE user_id = ? ORDER BY created_at DESC", [req.userId!]);
      res.json({ scans: userScans });
    } catch (err) {
      console.error("Get scans error:", err);
      res.status(500).json({ error: "Failed to fetch scans" });
    }
  });

  app.post("/api/scans", authMiddleware, express.json(), (req: AuthRequest, res) => {
    try {
      const { id, imageUri, extractedText, status } = req.body;
      if (!id) return res.status(400).json({ error: "id is required" });
      dbRun(
        "INSERT INTO scans (id, user_id, image_uri, extracted_text, status) VALUES (?, ?, ?, ?, ?)",
        [id, req.userId!, imageUri || null, extractedText || "", status || "processing"]
      );
      const scan = dbGet("SELECT * FROM scans WHERE id = ?", [id]);
      res.json({ scan });
    } catch (err) {
      console.error("Create scan error:", err);
      res.status(500).json({ error: "Failed to create scan" });
    }
  });

  app.put("/api/scans/:id", authMiddleware, express.json(), (req: AuthRequest, res) => {
    try {
      const id = String(req.params.id);
      const updates = req.body;
      const setClauses = Object.keys(updates).map(k => {
        const col = k.replace(/([A-Z])/g, "_$1").toLowerCase();
        return `${col} = ?`;
      }).join(", ");
      const values = [...Object.values(updates), id];
      dbRun(`UPDATE scans SET ${setClauses} WHERE id = ?`, values as any[]);
      const scan = dbGet("SELECT * FROM scans WHERE id = ?", [id]);
      res.json({ scan });
    } catch (err) {
      console.error("Update scan error:", err);
      res.status(500).json({ error: "Failed to update scan" });
    }
  });

  app.delete("/api/scans/:id", authMiddleware, (req: AuthRequest, res) => {
    try {
      dbRun("DELETE FROM scans WHERE id = ?", [String(req.params.id)]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete scan" });
    }
  });

  // ── OCR ────────────────────────────────────────────────────
  app.post("/api/scan", authMiddleware, largeBodyParser, async (req: AuthRequest, res) => {
    try {
      const { image } = req.body;
      if (!image) return res.status(400).json({ error: "image is required" });

      let extractedText: string;
      try {
        extractedText = await callGroqVision(image);
      } catch (err: any) {
        if (err.status === 429) {
          return res.status(429).json({ error: "OCR rate limit reached. Please wait a minute and try again." });
        }
        throw err;
      }

      res.json({ text: extractedText, success: true });
    } catch (error) {
      console.error("OCR error:", error);
      res.status(500).json({ error: "Failed to process image" });
    }
  });

  // ── Notion API ─────────────────────────────────────────────
  app.get("/api/notion/status", authMiddleware, async (req: AuthRequest, res) => {
    const notion = getNotionClientForUser(req.userId!);
    if (!notion) return res.json({ connected: false });
    try {
      const user = await notion.users.me({});
      res.json({ connected: true, user: user.name || "Connected" });
    } catch {
      res.json({ connected: false, error: "Invalid token" });
    }
  });

  app.get("/api/notion/pages", authMiddleware, async (req: AuthRequest, res) => {
    const notion = getNotionClientForUser(req.userId!);
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
    const notion = getNotionClientForUser(req.userId!);
    if (!notion) return res.status(401).json({ error: "Notion not configured" });
    try {
      const { pageId, content } = req.body;
      if (!pageId || !content) return res.status(400).json({ error: "pageId and content are required" });
      const blocks = markdownToNotionBlocks(content);
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
