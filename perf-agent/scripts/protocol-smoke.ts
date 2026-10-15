import { AppServer } from '../src/rpc.ts';
const rpc = new AppServer();
rpc.on('request', (m: any) =>
  rpc.send({ id: m.id, error: { code: -32601, message: 'Smoke test rejects server requests' } })
);
try {
  const init = await rpc.initialize();
  const account = await rpc.request('account/read', {});
  const models = await rpc.request('model/list', { limit: 10 });
  console.log(
    JSON.stringify(
      {
        initialized: !!init,
        authenticated: !!account.account,
        models: models.data?.map((m: any) => m.id),
      },
      null,
      2
    )
  );
} finally {
  await rpc.stop();
}
