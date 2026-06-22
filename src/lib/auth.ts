import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { db } from "./db";

const SESSION_COOKIE = "pps_session";
const SESSION_SECRET = process.env.SESSION_SECRET || "pps-tracker-dev-secret-change-in-production";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

// Simple HMAC-signed token (no external deps)
// Format: base64(payload).hmac
async function sign(payload: object): Promise<string> {
  const crypto = await import("crypto");
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const hmac = crypto.createHmac("sha256", SESSION_SECRET).update(data).digest("base64url");
  return `${data}.${hmac}`;
}

async function verify(token: string): Promise<Record<string, unknown> | null> {
  try {
    const [data, hmac] = token.split(".");
    if (!data || !hmac) return null;
    const crypto = await import("crypto");
    const expected = crypto.createHmac("sha256", SESSION_SECRET).update(data).digest("base64url");
    if (hmac !== expected) return null;
    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    // Check expiry
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(user: { id: string; username: string; name: string; role: string }) {
  const token = await sign({
    sub: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    exp: Date.now() + SESSION_MAX_AGE * 1000,
  });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Use "none" so the cookie is sent on cross-origin preview/embed requests.
    // Requires secure=true in production; in dev we keep secure=false so HTTP works.
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verify(token);
  if (!payload) return null;
  // Fetch fresh user from DB to verify still active
  const user = await db.user.findUnique({
    where: { id: payload.sub as string },
    select: { id: true, username: true, name: true, role: true, active: true },
  });
  if (!user || !user.active) return null;
  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") {
    throw new Error("Forbidden");
  }
  return user;
}
