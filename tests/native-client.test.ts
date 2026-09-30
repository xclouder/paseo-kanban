import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { build, type Plugin } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const extensions = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

function resolveLocal(from: string, specifier: string) {
  const candidate = resolve(dirname(from), specifier);
  return extensions.map(extension => `${candidate}${extension}`).find(existsSync);
}

function clientGraph(entry: string) {
  const pending = [entry];
  const visited = new Map<string, string>();
  while (pending.length) {
    const file = pending.pop()!;
    if (visited.has(file)) continue;
    const source = readFileSync(file, 'utf8');
    visited.set(file, source);
    for (const match of source.matchAll(/(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g)) {
      if (!match[1].startsWith('.')) continue;
      const dependency = resolveLocal(file, match[1]);
      assert.ok(dependency, `cannot resolve ${match[1]} imported by ${file}`);
      pending.push(dependency);
    }
  }
  return visited;
}

test('native plugin client graph has no react-dom runtime dependency', () => {
  const graph = clientGraph(resolve(root, 'index.client.tsx'));
  const offenders = [...graph.entries()].filter(([, source]) => /(?:from\s+|import\s*\()['"]react-dom(?:\/[^'"]*)?['"]/.test(source));
  assert.deepEqual(offenders.map(([file]) => file), []);

  const entry = graph.get(resolve(root, 'index.client.tsx'))!;
  assert.match(entry, /Platform\.OS === 'web'/, 'desktop shortcuts and the DOM Inbox must be gated from native clients');
});

function nativeModulePlugin(os: 'ios' | 'android'): Plugin {
  return {
    name: `native-runtime-${os}`,
    setup(builder) {
      builder.onResolve({ filter: /^react-native$/ }, () => ({ path: 'react-native', namespace: 'native-runtime' }));
      builder.onResolve({ filter: /^@getpaseo\/plugin\/client\/react-native$/ }, () => ({ path: 'paseo-react-native', namespace: 'native-runtime' }));
      builder.onResolve({ filter: /^@getpaseo\/plugin\/client\/ui$/ }, () => ({ path: 'paseo-ui', namespace: 'native-runtime' }));
      builder.onLoad({ filter: /^react-native$/, namespace: 'native-runtime' }, () => ({
        loader: 'js',
        contents: `
          export const Platform = { OS: ${JSON.stringify(os)} };
          export const ActivityIndicator = 'ActivityIndicator';
          export const Modal = 'Modal';
          export const Pressable = 'Pressable';
          export const ScrollView = 'ScrollView';
          export const Text = 'Text';
          export const TextInput = 'TextInput';
          export const View = 'View';
          export function useWindowDimensions() {
            return { width: 390, height: 844, scale: 3, fontScale: 1 };
          }
        `,
      }));
      builder.onLoad({ filter: /^paseo-react-native$/, namespace: 'native-runtime' }, () => ({
        loader: 'js',
        contents: `export function Icon() { return null; }`,
      }));
      builder.onLoad({ filter: /^paseo-ui$/, namespace: 'native-runtime' }, () => ({
        loader: 'js',
        contents: `
          export const SettingsAction = 'SettingsAction';
          export const SettingsInput = 'SettingsInput';
          export const SettingsSection = 'SettingsSection';
        `,
      }));
    },
  };
}

async function loadNativeClient(os: 'ios' | 'android') {
  const result = await build({
    entryPoints: [resolve(root, 'index.client.tsx')],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [nativeModulePlugin(os)],
  });
  assert.equal(result.outputFiles.length, 1);
  const artifact = result.outputFiles[0].text;
  assert.doesNotMatch(artifact, /react-dom/, `${os} artifact must not bundle react-dom`);
  const url = `data:text/javascript;base64,${Buffer.from(artifact).toString('base64')}#${os}`;
  return (await import(url)).default as (client: Record<string, unknown>) => () => void;
}

function nativeHost(failOn?: string) {
  const registrations: string[] = [];
  const add = (name: string) => () => {
    if (name === failOn) throw new Error(`failed to register ${name}`);
    registrations.push(name);
    return () => { registrations.splice(registrations.lastIndexOf(name), 1); };
  };
  return {
    registrations,
    client: {
      addSettingsScreen: add('settings'),
      addSurface: add('surface'),
      addSidebarItem: add('sidebar'),
      addWorkspacePanel: add('workspace-panel'),
      addCommandCenterItem: add('command'),
      openSurface() { throw new Error('native client must not open a surface while loading'); },
      rpc() { throw new Error('native client must not call RPC while loading'); },
    },
  };
}

test('iOS and Android client artifacts load and register without browser globals', async () => {
  assert.equal('window' in globalThis, false);
  assert.equal('document' in globalThis, false);

  for (const os of ['ios', 'android'] as const) {
    const contribute = await loadNativeClient(os);
    const { client, registrations } = nativeHost();
    const cleanup = contribute(client);
    assert.deepEqual(registrations, ['settings', 'surface', 'sidebar', 'workspace-panel', 'command', 'command']);
    cleanup();
    assert.deepEqual(registrations, []);

    if (os === 'ios') {
      const failedHost = nativeHost('workspace-panel');
      assert.throws(() => contribute(failedHost.client), /failed to register workspace-panel/);
      assert.deepEqual(failedHost.registrations, [], 'partial native registrations must be rolled back');
    }
  }
});
