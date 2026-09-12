const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

// Use the installed Paseo 0.8 compiler without installing or enabling this plugin.
const resources = process.env.PASEO_RESOURCES || 'C:/Program Files/Paseo/resources';
if (!process.env.PASEO_KANBAN_VERIFY_CHILD) {
  const executable = process.env.PASEO_ELECTRON || path.resolve(resources, '../Paseo.exe');
  const result = spawnSync(executable, [__filename], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PASEO_KANBAN_VERIFY_CHILD: '1' }, encoding: 'utf8', windowsHide: true });
  if (result.error) { console.error(result.error.message); process.exit(1); }
  process.stdout.write(result.stdout); process.stderr.write(result.stderr); process.exit(result.status ?? 1);
}
(async () => {
  const base = path.join(resources, 'app.asar/node_modules/@getpaseo/server/dist/server/server/plugins');
  const { compilePlugin } = await import(pathToFileURL(path.join(base, 'compiler.js')).href);
  const { readPluginManifest } = await import(pathToFileURL(path.join(base, 'manifest.js')).href);
  const manifest = await readPluginManifest(process.cwd());
  const result = await compilePlugin({ client: path.resolve('index.client.tsx'), server: path.resolve('index.server.ts') });
  if (!result.clientBundle || !result.serverBundle) throw new Error('Missing runtime bundle');
  console.log(JSON.stringify({ ok: true, pluginId: manifest.id, clientBytes: Buffer.byteLength(result.clientBundle), serverBytes: Buffer.byteLength(result.serverBundle) }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
