import MetaApi from "metaapi.cloud-sdk";

type Side = "BUY" | "SELL";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    token?: string;
    accountId?: string;
    symbol?: string;
    side?: Side;
    volume?: number;
    sl?: number | null;
    tp?: number | null;
    comment?: string;
    clientId?: string; // idempotency key
  };

  const { token, accountId, symbol, side, volume, sl, tp, comment, clientId } = body;

  if (!token || !accountId || !symbol || !side || !Number.isFinite(volume)) {
    return Response.json({ ok: false, error: "Missing/invalid fields" }, { status: 400 });
  }

  const api = new MetaApi(token);

  try {
    const account = await api.metatraderAccountApi.getAccount(accountId);
    const connection = await account.connect();
    await connection.waitSynchronized();

    // If SL/TP are null, just pass undefined
    const safeSL = Number.isFinite(sl as number) ? (sl as number) : undefined;
    const safeTP = Number.isFinite(tp as number) ? (tp as number) : undefined;

    const result =
      side === "BUY"
        ? await connection.createMarketBuyOrder(symbol, volume, safeSL, safeTP, comment ?? "metroai", clientId)
        : await connection.createMarketSellOrder(symbol, volume, safeSL, safeTP, comment ?? "metroai", clientId);

    return Response.json({ ok: true, result });
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message ?? "Order failed" }, { status: 500 });
  } finally {
    api.close();
  }
}