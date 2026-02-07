import type { Express } from "express";
import { createServer, type Server } from "node:http";
import OpenAI from "openai";
import { Client } from "@notionhq/client";
import express from "express";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

function getNotionClient(): Client | null {
  const token = process.env.NOTION_API_KEY;
  if (!token) return null;
  return new Client({ auth: token });
}

export async function registerRoutes(app: Express): Promise<Server> {
  const largeBodyParser = express.json({ limit: "50mb" });

  app.post("/api/scan", largeBodyParser, async (req, res) => {
    try {
      const { image } = req.body;
      if (!image) {
        return res.status(400).json({ error: "Image is required" });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-5.2",
        messages: [
          {
            role: "system",
            content: `You are an expert at reading handwritten notes and converting them into well-structured digital text.

Rules:
- Extract ALL text from the handwritten notes accurately
- Preserve the structure: headers, bullet points, numbered lists, code snippets
- Use Markdown formatting:
  - # for main headers
  - ## for sub-headers
  - ### for sub-sub-headers
  - - for bullet points
  - 1. for numbered lists
  - \`\`\`language for code blocks (detect programming language if possible)
  - > for quotes or important notes
  - **bold** for emphasized text
  - Tables using | syntax if tables are detected
- If any text is unclear, make your best guess and mark it with [?]
- Preserve the logical flow and organization of the notes
- Do NOT add any content that isn't in the handwritten notes
- Focus on technical accuracy for programming/tech related content`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Please read and convert these handwritten notes into well-structured digital text using Markdown formatting. Preserve all structure, formatting, and technical content as accurately as possible.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${image}`,
                },
              },
            ],
          },
        ],
        max_completion_tokens: 4096,
      });

      const extractedText = response.choices[0]?.message?.content || "";
      res.json({ text: extractedText, success: true });
    } catch (error) {
      console.error("OCR error:", error);
      res.status(500).json({ error: "Failed to process image" });
    }
  });

  app.get("/api/notion/status", async (_req, res) => {
    const notion = getNotionClient();
    if (!notion) {
      return res.json({ connected: false });
    }
    try {
      const user = await notion.users.me({});
      res.json({ connected: true, user: user.name || "Connected" });
    } catch (error) {
      res.json({ connected: false, error: "Invalid token" });
    }
  });

  app.get("/api/notion/pages", async (req, res) => {
    const notion = getNotionClient();
    if (!notion) {
      return res.status(401).json({ error: "Notion not configured" });
    }
    try {
      const query = (req.query.q as string) || "";
      const response = await notion.search({
        query,
        filter: { property: "object", value: "page" },
        page_size: 50,
      });

      const pages = response.results.map((page: any) => {
        let pageTitle = "Untitled";
        for (const [_key, value] of Object.entries(page.properties || {})) {
          const prop = value as any;
          if (prop.type === "title" && prop.title?.length > 0) {
            pageTitle = prop.title[0].plain_text;
            break;
          }
        }
        if (pageTitle === "Untitled" && page.properties?.title?.title?.[0]?.plain_text) {
          pageTitle = page.properties.title.title[0].plain_text;
        }

        return {
          id: page.id,
          title: pageTitle,
          icon: page.icon?.emoji || null,
          lastEdited: page.last_edited_time,
          url: page.url,
        };
      });

      res.json({ pages });
    } catch (error) {
      console.error("Notion pages error:", error);
      res.status(500).json({ error: "Failed to fetch pages" });
    }
  });

  app.post("/api/notion/upload", async (req, res) => {
    try {
      const notion = getNotionClient();
      if (!notion) {
        return res.status(401).json({ error: "Notion not configured" });
      }

      const { pageId, content } = req.body;
      if (!pageId || !content) {
        return res.status(400).json({ error: "pageId and content are required" });
      }

      const blocks = markdownToNotionBlocks(content);

      const chunkSize = 100;
      for (let i = 0; i < blocks.length; i += chunkSize) {
        const chunk = blocks.slice(i, i + chunkSize);
        await notion.blocks.children.append({
          block_id: pageId,
          children: chunk,
        });
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

function markdownToNotionBlocks(markdown: string): any[] {
  const blocks: any[] = [];

  blocks.push({
    object: "block",
    type: "divider",
    divider: {},
  });

  blocks.push({
    object: "block",
    type: "heading_3",
    heading_3: {
      rich_text: [
        {
          type: "text",
          text: {
            content: `Scanned Notes - ${new Date().toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}`,
          },
        },
      ],
    },
  });

  const lines = markdown.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    if (line.trim().startsWith("```")) {
      const language = line.trim().slice(3).trim() || "plain text";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;

      const codeContent = codeLines.join("\n");
      if (codeContent.length > 0) {
        blocks.push({
          object: "block",
          type: "code",
          code: {
            rich_text: [{ type: "text", text: { content: codeContent.slice(0, 2000) } }],
            language: mapLanguage(language.toLowerCase()),
          },
        });
      }
      continue;
    }

    if (line.startsWith("### ")) {
      blocks.push({
        object: "block",
        type: "heading_3",
        heading_3: { rich_text: parseInlineFormatting(line.slice(4)) },
      });
    } else if (line.startsWith("## ")) {
      blocks.push({
        object: "block",
        type: "heading_2",
        heading_2: { rich_text: parseInlineFormatting(line.slice(3)) },
      });
    } else if (line.startsWith("# ")) {
      blocks.push({
        object: "block",
        type: "heading_1",
        heading_1: { rich_text: parseInlineFormatting(line.slice(2)) },
      });
    } else if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
      const content = line.trim().slice(2);
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: parseInlineFormatting(content) },
      });
    } else if (/^\d+\.\s/.test(line.trim())) {
      const content = line.trim().replace(/^\d+\.\s/, "");
      blocks.push({
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: { rich_text: parseInlineFormatting(content) },
      });
    } else if (line.trim().startsWith("> ")) {
      const content = line.trim().slice(2);
      blocks.push({
        object: "block",
        type: "quote",
        quote: { rich_text: [{ type: "text", text: { content } }] },
      });
    } else if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      const tableLines: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim().startsWith("|") &&
        lines[i].trim().endsWith("|")
      ) {
        if (!lines[i].trim().match(/^\|[\s\-:|]+\|$/)) {
          tableLines.push(lines[i]);
        }
        i++;
      }

      if (tableLines.length > 0) {
        const rows = tableLines.map((tl) =>
          tl
            .split("|")
            .filter((cell) => cell.trim() !== "")
            .map((cell) => cell.trim())
        );
        const tableWidth = Math.max(...rows.map((r) => r.length));

        blocks.push({
          object: "block",
          type: "table",
          table: {
            table_width: tableWidth,
            has_column_header: true,
            has_row_header: false,
            children: rows.map((row) => ({
              object: "block",
              type: "table_row",
              table_row: {
                cells: Array.from({ length: tableWidth }, (_, idx) => [
                  { type: "text", text: { content: row[idx] || "" } },
                ]),
              },
            })),
          },
        });
      }
      continue;
    } else {
      const content = line.trim();
      if (content.length > 0) {
        blocks.push({
          object: "block",
          type: "paragraph",
          paragraph: { rich_text: parseInlineFormatting(content) },
        });
      }
    }

    i++;
  }

  return blocks;
}

function parseInlineFormatting(text: string): any[] {
  const richText: any[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/);

  for (const part of parts) {
    if (part.startsWith("**") && part.endsWith("**")) {
      richText.push({
        type: "text",
        text: { content: part.slice(2, -2) },
        annotations: { bold: true },
      });
    } else if (part.startsWith("*") && part.endsWith("*") && !part.startsWith("**")) {
      richText.push({
        type: "text",
        text: { content: part.slice(1, -1) },
        annotations: { italic: true },
      });
    } else if (part.startsWith("`") && part.endsWith("`")) {
      richText.push({
        type: "text",
        text: { content: part.slice(1, -1) },
        annotations: { code: true },
      });
    } else if (part.length > 0) {
      richText.push({
        type: "text",
        text: { content: part },
      });
    }
  }

  return richText.length > 0 ? richText : [{ type: "text", text: { content: text } }];
}

function mapLanguage(lang: string): string {
  const languageMap: Record<string, string> = {
    js: "javascript",
    ts: "typescript",
    py: "python",
    rb: "ruby",
    sh: "bash",
    yml: "yaml",
    md: "markdown",
    "c++": "c++",
    "c#": "c#",
    golang: "go",
    rs: "rust",
    kt: "kotlin",
    "plain text": "plain text",
  };
  return languageMap[lang] || lang;
}
