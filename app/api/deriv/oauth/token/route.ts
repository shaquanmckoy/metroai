import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const DERIV_TOKEN_URL = "https://auth.deriv.com/oauth2/token";
const DERIV_CALLBACK_PATH = "/dashboard";

function getDerivError(data: unknown) {
  if (!data || typeof data !== "object") return "Deriv token exchange failed.";

  const payload = data as Record<string, unknown>;
  const description = payload.error_description;
  const error = payload.error;

  if (typeof description === "string" && description.trim()) return description;
  if (typeof error === "string" && error.trim()) return error;
  return "Deriv token exchange failed.";
}

export async function POST(request: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_DERIV_APP_ID?.trim();

  if (!clientId) {
    return NextResponse.json(
      { ok: false, error: "Deriv OAuth is not configured on this deployment." },
      { status: 500 }
    );
  }

  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && new URL(requestOrigin).origin !== request.nextUrl.origin) {
    return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const codeVerifier =
    typeof body?.codeVerifier === "string" ? body.codeVerifier.trim() : "";

  if (!code || !codeVerifier || codeVerifier.length < 43 || codeVerifier.length > 128) {
    return NextResponse.json(
      { ok: false, error: "The Deriv login callback is incomplete or invalid." },
      { status: 400 }
    );
  }

  const redirectUri = new URL(DERIV_CALLBACK_PATH, request.nextUrl.origin).toString();
  const tokenResponse = await fetch(DERIV_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    }),
    cache: "no-store",
  }).catch(() => null);

  if (!tokenResponse) {
    return NextResponse.json(
      { ok: false, error: "Could not reach Deriv to finish login." },
      { status: 502 }
    );
  }

  const tokenData = await tokenResponse.json().catch(() => null);
  const accessToken =
    tokenData && typeof tokenData.access_token === "string"
      ? tokenData.access_token.trim()
      : "";

  if (!tokenResponse.ok || !accessToken) {
    return NextResponse.json(
      { ok: false, error: getDerivError(tokenData) },
      { status: tokenResponse.status >= 400 && tokenResponse.status < 500 ? 400 : 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    accessToken,
    expiresIn:
      typeof tokenData.expires_in === "number" ? tokenData.expires_in : undefined,
    tokenType:
      typeof tokenData.token_type === "string" ? tokenData.token_type : "Bearer",
  });
}
