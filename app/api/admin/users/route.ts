import { NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// GET /api/admin/users  -> list users
export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, role, created_at
       FROM users
       ORDER BY created_at DESC`
    );

    return NextResponse.json({ ok: true, users: rows });
  } catch (err) {
    return NextResponse.json({ ok: false, error: "Failed to load users" }, { status: 500 });
  }
}

// POST /api/admin/users  -> add user
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const role = body?.role === "admin" ? "admin" : "user";

    if (!email || !password) {
      return NextResponse.json({ ok: false, error: "Email + password required" }, { status: 400 });
    }

    // uses pgcrypto: password_hash = crypt(password, gen_salt('bf'))
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, crypt($2, gen_salt('bf')), $3)
       RETURNING id, email, role, created_at`,
      [email, password, role]
    );

    return NextResponse.json({ ok: true, user: rows[0] });
  } catch (err: any) {
    // duplicate email
    if (String(err?.code) === "23505") {
      return NextResponse.json({ ok: false, error: "That email already exists" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: "Failed to add user" }, { status: 500 });
  }
}

// DELETE /api/admin/users?id=<uuid>  -> remove user
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

    // safety: don't delete admins (prevents lockout)
    const { rows } = await pool.query(`SELECT role FROM users WHERE id = $1`, [id]);
    if (!rows.length) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }
    if (rows[0].role === "admin") {
      return NextResponse.json({ ok: false, error: "Cannot delete admin user" }, { status: 400 });
    }

    await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Failed to delete user" }, { status: 500 });
  }
}