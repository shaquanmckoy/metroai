import { NextResponse } from "next/server";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    const email = body?.email;
    const password = body?.password;

    if (!email || !password) {
      return NextResponse.json({ ok: false, error: "Missing email or password" }, { status: 400 });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPass = String(password);

    const result = await pool.query(
      "SELECT id, email, password_hash, role FROM users WHERE email = $1",
      [cleanEmail]
    );

    const user = result.rows[0];
    if (!user) {
      return NextResponse.json({ ok: false, error: "Invalid login" }, { status: 401 });
    }

    const ok = await bcrypt.compare(cleanPass, user.password_hash);
    if (!ok) {
      return NextResponse.json({ ok: false, error: "Invalid login" }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}