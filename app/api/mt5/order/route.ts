export async function POST() {
  return Response.json(
    { ok: false, error: "MT5 order route temporarily disabled" },
    { status: 503 }
  );
}