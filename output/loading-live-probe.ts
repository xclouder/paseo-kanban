import { DaemonClient } from '@getpaseo/client/internal/daemon-client';
const client = new DaemonClient({ clientId: 'paseo-kanban-readonly-probe', url: 'ws://127.0.0.1:16767/ws', reconnect: { enabled: false }, connectTimeoutMs: 10000 });
const deadline = setTimeout(() => { console.log(JSON.stringify({ timeout: true })); void client.close(); }, 20000);
try {
  await client.connect();
  const started = performance.now();
  const [board, providers] = await Promise.all([
    client.invokePluginRpc('paseo-kanban', 'board.read', {}).then((value: any) => ({ ms: Math.round(performance.now() - started), agents: value.agents.length, workspaces: value.workspaces.length })),
    client.invokePluginRpc('paseo-kanban', 'board.providers.read', {}).then((value: any) => ({ ms: Math.round(performance.now() - started), models: value.models.length, warning: Boolean(value.providerError) })),
  ]);
  console.log(JSON.stringify({ board, providers }));
} finally { clearTimeout(deadline); await client.close(); }

