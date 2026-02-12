import { NextResponse } from "next/server";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function detectDevice(userAgent: string) {
  const ua = (userAgent || "").toLowerCase();

  const isMobile = /iphone|android|ipad/.test(ua);
  const isWindows = ua.includes("windows");
  const isMac = ua.includes("mac");
  const isLinux = ua.includes("linux");

  const isChrome = ua.includes("chrome") && !ua.includes("edg") && !ua.includes("opr");
  const isSafari = ua.includes("safari") && !ua.includes("chrome") && !ua.includes("edg") && !ua.includes("opr");
  const isFirefox = ua.includes("firefox");
  const isEdge = ua.includes("edg");
  const isOpera = ua.includes("opr") || ua.includes("opera");

  const device = isMobile ? "Mobile" : "Desktop";
  const os = isWindows ? "Windows" : isMac ? "Mac" : isLinux ? "Linux" : "Unknown OS";

  const browser = isEdge
    ? "Edge"
    : isOpera
    ? "Opera"
    : isChrome
    ? "Chrome"
    : isSafari
    ? "Safari"
    : isFirefox
    ? "Firefox"
    : "Unknown Browser";

  return `${device} • ${os} • ${browser}`;
}

function getClientIp(req: Request) {
  // Vercel usually sends x-forwarded-for like "ip, proxy1, proxy2"
  const xff = req.headers.get("x-forwarded-for") || "";
  const first = xff.split(",")[0]?.trim();
  if (first) return first;

  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();

  return "unknown";
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");

    if (!email || !password) {
      return NextResponse.json({ ok: false, error: "Missing email or password" }, { status: 400 });
    }

    const result = await pool.query(
      "SELECT id, email, password_hash, role FROM users WHERE email = $1",
      [email]
    );

    const user = result.rows[0];
    if (!user) {
      return NextResponse.json({ ok: false, error: "Invalid login" }, { status: 401 });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return NextResponse.json({ ok: false, error: "Invalid login" }, { status: 401 });
    }

    // ✅ Capture login info
    const userAgent = req.headers.get("user-agent") || "";
    const ip = getClientIp(req);
    const deviceInfo = detectDevice(userAgent);

    // ✅ Update login tracking (count + last login info)
    await pool.query(
      `
      UPDATE users
      SET 
        login_count = COALESCE(login_count, 0) + 1,
        last_login_at = NOW(),
        last_login_device = $1,
        last_login_ip = $2,
        last_login_ua = $3
      WHERE id = $4
      `,
      [deviceInfo, ip, userAgent, user.id]
    );

    return NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}