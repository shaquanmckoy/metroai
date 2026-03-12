import { NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const KEY = "strategy_flags";

const DEFAULT_FLAGS = {
  matches: true,
  overunder: true,
  risefall: true,
  mspider: true,
};

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT value FROM app_settings WHERE key = $1 LIMIT 1`,
      [KEY]
    );

    if (!rows.length) {
      return NextResponse.json({ ok: true, flags: DEFAULT_FLAGS });
    }

    const value = rows[0].value ?? {};

    const flags = {
      matches: typeof value.matches === "boolean" ? value.matches : true,
      overunder: typeof value.overunder === "boolean" ? value.overunder : true,
      risefall: typeof value.risefall === "boolean" ? value.risefall : true,
      mspider: typeof value.mspider === "boolean" ? value.mspider : true,
    };

    return NextResponse.json({ ok: true, flags });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Failed to load strategy flags" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // accept { flags: {...} } OR direct object
    const src = body?.flags ?? body;

    const flags = {
      matches: typeof src?.matches === "boolean" ? src.matches : true,
      overunder: typeof src?.overunder === "boolean" ? src.overunder : true,
      risefall: typeof src?.risefall === "boolean" ? src.risefall : true,
      mspider: typeof src?.mspider === "boolean" ? src.mspider : true,
    };

    await pool.query(
      `
      INSERT INTO app_settings(key, value)
      VALUES ($1, $2)
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `,
      [KEY, flags]
    );

    return NextResponse.json({ ok: true, flags });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Failed to save strategy flags" },
      { status: 500 }
    );
  }
}