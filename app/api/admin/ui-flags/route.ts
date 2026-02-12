import { NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// 🔑 NEW KEY (different from strategy_flags)
const KEY = "ui_flags";

// ✅ buttons / panels you want to hide/show for USERS
const DEFAULT_UI_FLAGS = {
  metro_place_trade: true,
  metro_edshell: true,
  metro_3x: true,
  metro_5x: true,
  metro_1x_auto: true,
  metro_fast_auto: true,

  spider_analyzer: true,
  spider_manual_over_under: true,
  spider_random_auto: true,
};

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT value FROM app_settings WHERE key = $1 LIMIT 1`,
      [KEY]
    );

    if (!rows.length) return NextResponse.json({ ok: true, flags: DEFAULT_UI_FLAGS });

    const value = rows[0].value ?? {};
    const flags = {
      metro_place_trade:
        typeof value.metro_place_trade === "boolean" ? value.metro_place_trade : true,
      metro_edshell: typeof value.metro_edshell === "boolean" ? value.metro_edshell : true,
      metro_3x: typeof value.metro_3x === "boolean" ? value.metro_3x : true,
      metro_5x: typeof value.metro_5x === "boolean" ? value.metro_5x : true,
      metro_1x_auto: typeof value.metro_1x_auto === "boolean" ? value.metro_1x_auto : true,
      metro_fast_auto:
        typeof value.metro_fast_auto === "boolean" ? value.metro_fast_auto : true,

      spider_analyzer:
        typeof value.spider_analyzer === "boolean" ? value.spider_analyzer : true,
      spider_manual_over_under:
        typeof value.spider_manual_over_under === "boolean"
          ? value.spider_manual_over_under
          : true,
      spider_random_auto:
        typeof value.spider_random_auto === "boolean" ? value.spider_random_auto : true,
    };

    return NextResponse.json({ ok: true, flags });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Failed to load UI flags" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // accept {flags:{...}} OR direct object
    const src = body?.flags ?? body;

    const flags = {
      metro_place_trade: !!src?.metro_place_trade,
      metro_edshell: !!src?.metro_edshell,
      metro_3x: !!src?.metro_3x,
      metro_5x: !!src?.metro_5x,
      metro_1x_auto: !!src?.metro_1x_auto,
      metro_fast_auto: !!src?.metro_fast_auto,

      spider_analyzer: !!src?.spider_analyzer,
      spider_manual_over_under: !!src?.spider_manual_over_under,
      spider_random_auto: !!src?.spider_random_auto,
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
      { ok: false, error: "Failed to save UI flags" },
      { status: 500 }
    );
  }
}