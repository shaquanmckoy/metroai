import MetaApi from "metaapi.cloud-sdk";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    token?: string;
    accountId?: string;
    positionId?: string;
  };

  const { token, accountId, positionId } = body;

  if (!token || !accountId || !positionId) {
    return Response.json({ ok: false, error: "Missing fields" }, { status: 400 });
  }

  const api = new MetaApi(token);

  try {
    const account = await api.metatraderAccountApi.getAccount(accountId);
    const connection = await account.connect();
    await connection.waitSynchronized();

    const result = await connection.closePosition(positionId);
    return Response.json({ ok: true, result });
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message ?? "Close failed" }, { status: 500 });
  } finally {
    api.close();
  }
}