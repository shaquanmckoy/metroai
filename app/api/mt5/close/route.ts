export async function POST() {
  return Response.json(
    {
      ok: false,
      error: "MT5 close route temporarily disabled",
    },
    { status: 503 }
  );
}