import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { dbGet, dbRun } from "./db";

const JWT_SECRET = process.env.JWT_SECRET || "notesync-dev-secret-change-in-production";
const SALT_ROUNDS = 10;

if (!process.env.JWT_SECRET) {
  console.warn("⚠️  JWT_SECRET not set — using insecure default. Set it in .env for production.");
}

export interface AuthRequest extends Request {
  userId?: string;
}

interface UserRow {
  id: string;
  email: string;
  password: string;
  name: string | null;
  notion_api_key: string | null;
  groq_api_key: string | null;
  created_at: number;
}

/**
 * Verifies the Bearer JWT and attaches userId to the request.
 */
export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export async function registerHandler(req: Request, res: Response) {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

    const existing = await dbGet<UserRow>("SELECT id FROM users WHERE email = ?", [email.toLowerCase()]);
    if (existing) return res.status(409).json({ error: "An account with this email already exists" });

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    const id = crypto.randomUUID();
    await dbRun("INSERT INTO users (id, email, password, name) VALUES (?, ?, ?, ?)", [id, email.toLowerCase(), hashed, name || null]);

    const token = jwt.sign({ userId: id }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ token, user: { id, email: email.toLowerCase(), name: name || null, notionConnected: false, groqConnected: false } });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Failed to create account" });
  }
}

export async function loginHandler(req: Request, res: Response) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

    const user = await dbGet<UserRow>("SELECT * FROM users WHERE email = ?", [email.toLowerCase()]);
    if (!user) return res.status(401).json({ error: "Invalid email or password" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: "Invalid email or password" });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, notionConnected: !!user.notion_api_key, groqConnected: !!user.groq_api_key },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Failed to login" });
  }
}

export async function getMeHandler(req: AuthRequest, res: Response) {
  try {
    const user = await dbGet<UserRow>("SELECT * FROM users WHERE id = ?", [req.userId!]);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ id: user.id, email: user.email, name: user.name, notionConnected: !!user.notion_api_key, groqConnected: !!user.groq_api_key });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
}

export async function getNotionKeyForUser(userId: string): Promise<string | null> {
  const user = await dbGet<{ notion_api_key: string | null }>("SELECT notion_api_key FROM users WHERE id = ?", [userId]);
  return user?.notion_api_key ?? null;
}
