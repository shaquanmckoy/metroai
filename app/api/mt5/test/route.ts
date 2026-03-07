import MetaApi from "metaapi.cloud-sdk";

export async function POST(req: Request) {
  const { token, accountId } = (await req.json()) as { token?: string; accountId?: string };

  if (!token || !accountId) {
    return Response.json({ ok: false, error: "Missing token or accountId" }, { status: 400 });
  }

  const api = new MetaApi(token);

  try {
    const account = await api.metatraderAccountApi.getAccount(accountId);
    const connection = await account.connect();
    await connection.waitSynchronized();

    const terminalState = await connection.getTerminalState();
    return Response.json({
      ok: true,
      message: "Connected & synchronized",
      brokerTime: terminalState?.brokerTime,
      accountCurrency: terminalState?.accountCurrency,
    });
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message ?? "Test failed" }, { status: 500 });
  } finally {
    api.close();
  }
}