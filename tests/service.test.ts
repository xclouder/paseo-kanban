import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { createPaseoApi, type PaseoApi } from '@getpaseo/client';
import { Store } from '../server/store';
import { BoardService, collectPages } from '../server/service';
import { fixture } from '../preview/fixture';
import { buildCards, emptyStore, metadataSchema, taskSchema } from '../shared/model';

async function setup(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'paseo-kanban-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new Store(join(directory, 'board.json'));
  return { directory, store, service: new BoardService(store) };
}
function mockApi() {
  const snapshot = fixture();
  const agents = snapshot.agents.map(a => ({ ...a, activeTurn: a.activeTurn ? { turnId: 'active-turn', startedAt: a.updatedAt } : null as { turnId: string; startedAt: string | null } | null, title: a.title, archivedAt: null, pendingPermissions: a.pendingPermission ? [{ id: 'permission' }] : [], capabilities: {}, model: 'model', availableModes: [], currentModeId: null, persistence: null }));
  let creates = 0, failure = false, loseResponse = false;
  const configs: { provider: string; modeId?: string; thinkingOptionId?: string }[] = [];
  const createOptions: Record<string, unknown>[] = [];
  const openedPaths: string[] = [];
  const api = {
    agents: {
      list: async (opts?: { filter?: { labels?: Record<string, string> } }) => ({ entries: agents.filter(a => !opts?.filter?.labels || Object.entries(opts.filter.labels).every(([k,v]) => a.labels[k] === v)).map(agent => ({ agent })), pageInfo: { hasMore: false, nextCursor: null } }),
      ref: (id: string) => ({ refresh: async () => { const agent = agents.find(a => a.id === id); return agent ? { agent } : null; } }),
    },
    workspaces: {
      list: async () => ({ entries: snapshot.workspaces.map(w => ({ ...w, projectDisplayName: w.project, projectRootPath: w.directory, workspaceDirectory: w.directory })), pageInfo: { hasMore: false, nextCursor: null } }),
      open: async ({ cwd }: { cwd: string }) => {
        openedPaths.push(cwd);
        const name = basename(cwd);
        const workspace = { id: `workspace-created-${openedPaths.length}`, name, title: null, projectDisplayName: name, projectId: `project-created-${openedPaths.length}`, projectRootPath: cwd, workspaceDirectory: cwd };
        return { id: workspace.id, current: () => workspace, refresh: async () => workspace };
      },
      ref: (id: string) => ({ refresh: async () => { const w = snapshot.workspaces.find(w => w.id === id); return w ? { ...w, workspaceDirectory: w.directory, projectRootPath: w.directory } : null; }, agents: { create: async (options: { config: { provider: string; modeId?: string; thinkingOptionId?: string }; labels: Record<string,string>; title: string }) => {
        creates++; assert.match(options.config.provider, /^[^/]+\/.+$/);
        createOptions.push(options as unknown as Record<string, unknown>);
        configs.push(options.config);
        if (failure) throw new Error('connection lost');
        const agent = { ...agents[0], id: `created-${creates}`, title: options.title, labels: options.labels, workspaceId: id };
        agents.push(agent); if (loseResponse) throw new Error('response lost'); return { id: agent.id };
      } } }),
    },
    providers: { snapshot: async () => ({ requestId: 'snapshot', snapshotHash: 'snapshot', fetchedAt: new Date().toISOString(), entries: [{ provider: 'codex', status: 'ready', enabled: true, models: [{ id: 'model', label: 'Model', thinkingOptions: [{ id: 'low', label: 'Low' }, { id: 'medium', label: 'Medium', isDefault: true }, { id: 'high', label: 'High' }], defaultThinkingOptionId: 'medium' }], modes: snapshot.modes.filter(mode => mode.provider === 'codex') }] }), listAvailable: async () => ({ providers: [{ provider: 'codex', available: true }] }), listModels: async () => ({ models: [{ id: 'model', label: 'Model', thinkingOptions: [{ id: 'low', label: 'Low' }, { id: 'medium', label: 'Medium', isDefault: true }, { id: 'high', label: 'High' }], defaultThinkingOptionId: 'medium' }] }), listModes: async () => ({ modes: snapshot.modes.filter(mode => mode.provider === 'codex') }) },
  } as unknown as PaseoApi;
  return { api, agents, configs, createOptions, openedPaths, get creates() { return creates; }, fail: () => { failure = true; }, lose: () => { loseResponse = true; } };
}
const input = { clientRequestId: '66666666-6666-4666-8666-666666666666', title: 'Ship feature', description: 'Acceptance criteria', workspaceId: 'workspace-web', provider: 'codex/model', priority: 'high' as const, tags: ['test'] };

test('an active turn stays running after the client reconnects with an idle status', async t => {
  const { service } = await setup(t); const mock = mockApi();
  mock.agents[0].status = 'idle';
  mock.agents[0].activeTurn = { turnId: 'turn-after-restart', startedAt: new Date().toISOString() };
  const snapshot = await service.read(mock.api);
  assert.equal(snapshot.agents[0].activeTurn, true);
  assert.equal(buildCards(snapshot).find(card => card.agent?.id === mock.agents[0].id)?.stage, 'running');
});

test('project organization merges concurrent edits and survives store reload without changing tasks', async t => {
  const { service, store } = await setup(t); const { api } = mockApi();
  const task = await service.create(input, api);
  await Promise.all([
    service.organizeProjects({ type: 'createGroup', id: 'work', name: '工作' }, api),
    service.organizeProjects({ type: 'createGroup', id: 'personal', name: '个人' }, api),
  ]);
  await service.organizeProjects({ type: 'moveProject', id: 'project-kanban', groupId: 'work' }, api);
  await service.organizeProjects({ type: 'collapseGroup', id: 'work', collapsed: true }, api);
  const stored = await new Store(store.file).read();
  assert.equal(stored.projectLayout.groups.length, 2);
  assert.equal(stored.projectLayout.groups[0].collapsed, true);
  assert.equal(stored.projectLayout.membership['project-kanban'], 'work');
  await service.organizeProjects({ type: 'deleteGroup', id: 'work' }, api);
  const after = await store.read();
  assert.equal(after.projectLayout.membership['project-kanban'], undefined);
  assert.deepEqual(after.tasks[task.id], task);
  await assert.rejects(() => service.organizeProjects({ type: 'moveProject', id: 'missing', groupId: null }, api), /项目已不可用/);
});

test('creates a project directory and opens its first Paseo workspace', async t => {
  const { directory, service, store } = await setup(t); const mock = mockApi();
  const baseDirectory = join(directory, 'projects');
  await service.saveSettings({ projectBaseDirectory: baseDirectory });
  assert.equal((await new Store(store.file).read()).settings.projectBaseDirectory, baseDirectory);
  const workspace = await service.createProjectWorkspace({ projectName: '新产品' }, mock.api);
  assert.equal(workspace.project, '新产品');
  assert.equal(workspace.name, '新产品');
  assert.equal(workspace.directory, join(baseDirectory, '新产品'));
  assert.deepEqual(mock.openedPaths, [join(baseDirectory, '新产品')]);
  await access(workspace.directory);
});

test('new projects reject unsafe names, relative roots, and existing directories', async t => {
  const { directory, service } = await setup(t); const mock = mockApi();
  const baseDirectory = join(directory, 'projects');
  await assert.rejects(() => service.createProjectWorkspace({ projectName: 'safe' }, mock.api), /配置项目基础目录/);
  await assert.rejects(() => service.saveSettings({ projectBaseDirectory: 'relative-projects' }), /绝对路径/);
  await service.saveSettings({ projectBaseDirectory: baseDirectory });
  await assert.rejects(() => service.createProjectWorkspace({ projectName: '../escape' }, mock.api), /不能用于目录/);
  await service.createProjectWorkspace({ projectName: 'duplicate' }, mock.api);
  await assert.rejects(() => service.createProjectWorkspace({ projectName: 'duplicate' }, mock.api), /目录已存在/);
  assert.equal(mock.openedPaths.length, 1);
});

test('a failed Paseo workspace open only rolls back the new empty project directory', async t => {
  const { directory, service } = await setup(t); const mock = mockApi();
  const baseDirectory = join(directory, 'projects');
  await service.saveSettings({ projectBaseDirectory: baseDirectory });
  mock.api.workspaces.open = async () => { throw new Error('daemon unavailable'); };
  await assert.rejects(() => service.createProjectWorkspace({ projectName: 'rollback-me' }, mock.api), /daemon unavailable/);
  await assert.rejects(() => access(join(baseDirectory, 'rollback-me')));
});

test('pagination loads beyond first hundred and rejects cursor loops', async () => {
  const entries = await collectPages(async cursor => ({ entries: cursor ? Array.from({ length: 80 }, (_,i) => i + 100) : Array.from({ length: 100 }, (_,i) => i), pageInfo: { hasMore: !cursor, nextCursor: cursor ? null : 'second' } }));
  assert.equal(entries.length, 180); assert.equal(entries[179], 179);
  await assert.rejects(() => collectPages(async () => ({ entries: [], pageInfo: { hasMore: true, nextCursor: 'same' } })), /分页异常/);
});
test('store serializes concurrent writers and survives reload', async t => {
  const { store } = await setup(t);
  await Promise.all(Array.from({ length: 30 }, (_, i) => store.update(data => { data.sessions[`session-${i}`] = metadataSchema.parse({ description: `note-${i}` }); })));
  assert.equal(Object.keys((await new Store(store.file).read()).sessions).length, 30);
});
test('damaged store is not overwritten by writes', async t => {
  const { store } = await setup(t); await writeFile(store.file, '{broken');
  await assert.rejects(() => store.update(data => { data.sessions.a = metadataSchema.parse({}); }), /原文件未被覆盖/);
  assert.equal(await readFile(store.file, 'utf8'), '{broken');
});
test('a failed operation releases the writer lock', async t => {
  const { store } = await setup(t);
  await assert.rejects(() => store.update(() => { throw new Error('failed'); }));
  await store.update(data => { data.sessions.ok = metadataSchema.parse({}); });
  assert((await store.read()).sessions.ok);
});
test('read imports sessions and exposes concrete provider model options', async t => {
  const { service } = await setup(t); const { api } = mockApi(); const snapshot = await service.read(api);
  assert.equal(snapshot.agents.length, 8); assert.equal(snapshot.models[0].id, 'codex/model');
  assert.equal(snapshot.models[0].thinkingOptions.find(option => option.id === 'high')?.label, 'High');
  assert(snapshot.modes.some(mode => mode.provider === 'codex' && mode.id === 'full-access'));
});
test('provider snapshot timeout does not block reads and retries after a cooldown', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'paseo-kanban-provider-timeout-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const service = new BoardService(new Store(join(directory, 'board.json')), 25, 60000);
  const mock = mockApi();
  await service.create(input, mock.api);
  let calls = 0;
  let recovered = false;
  const snapshot = mock.api.providers.snapshot;
  mock.api.providers.snapshot = async () => {
    calls++;
    if (!recovered) return await new Promise<never>(() => undefined);
    return snapshot();
  };
  const started = Date.now();
  const [first, concurrent] = await Promise.all([service.read(mock.api), service.read(mock.api)]);
  const second = await service.read(mock.api);
  assert(Date.now() - started < 500);
  assert.equal(first.agents.length, 8);
  assert.equal(first.workspaces.length, 3);
  assert.equal(Object.keys(first.store.tasks).length, 1);
  assert.match(first.providerError ?? '', /超时/);
  assert.match(concurrent.providerError ?? '', /超时/);
  assert.equal(second.agents.length, 8);
  assert.equal(calls, 1);
  recovered = true;
  (service as unknown as { providerRetryAfter: number }).providerRetryAfter = 0;
  const restored = await service.read(mock.api);
  assert.equal(calls, 2);
  assert.equal(restored.models[0].id, 'codex/model');
  assert.equal(restored.providerError, undefined);
});
test('partial provider snapshots keep ready models during the retry cooldown', async t => {
  const { store } = await setup(t);
  const service = new BoardService(store, 25, 1000);
  const mock = mockApi();
  const ready = await mock.api.providers.snapshot();
  let calls = 0;
  mock.api.providers.snapshot = async () => {
    calls++;
    return { ...ready, entries: [...ready.entries, { provider: 'claude', status: 'loading', enabled: true }] };
  };
  const first = await service.read(mock.api);
  const second = await service.read(mock.api);
  assert.equal(first.models[0].id, 'codex/model');
  assert.match(first.providerError ?? '', /加载或暂不可用/);
  assert.equal(second.models[0].id, 'codex/model');
  assert.equal(second.providerError, first.providerError);
  assert.equal(calls, 1);
});
test('create is a draft; concurrent launch invokes provider exactly once', async t => {
  const { service, store } = await setup(t); const mock = mockApi();
  const task = await service.create(input, mock.api); assert.equal(mock.creates, 0);
  assert.equal(task.modeId, 'full-access');
  assert.equal(task.thinkingOptionId, 'high');
  const results = await Promise.all([service.launch(task.id, mock.api), service.launch(task.id, mock.api)]);
  assert.equal(mock.creates, 1); assert.equal(results[0].agentId, results[1].agentId);
  assert.equal((await store.read()).tasks[task.id].agentId, results[0].agentId);
  assert.equal(mock.configs[0].modeId, 'full-access');
  assert.equal(mock.configs[0].thinkingOptionId, 'high');
});
test('Inbox capture is idempotent and conversion removes the entry only after task creation', async t => {
  const { service, store } = await setup(t); const mock = mockApi();
  const contents = Buffer.from('idea attachment');
  const entryInput = { clientRequestId: '51515151-5151-4151-8151-515151515151', title: 'Capture this idea', attachments: [{ id: '50505050-5050-4050-8050-505050505050', fileName: 'idea.txt', mimeType: 'text/plain', size: contents.byteLength, dataBase64: contents.toString('base64') }] };
  const first = await service.addInbox(entryInput);
  const retry = await service.addInbox(entryInput);
  assert.deepEqual(retry, first);
  assert.equal(first.attachments.length, 1);
  assert.equal(await readFile(first.attachments[0].path, 'utf8'), 'idea attachment');
  assert.equal(Object.keys((await store.read()).inbox).length, 1);
  await service.read(mock.api);
  assert.equal(await readFile(first.attachments[0].path, 'utf8'), 'idea attachment');

  const task = await service.create({ ...input, clientRequestId: '52525252-5252-4252-8252-525252525252', inboxId: first.id, title: first.title }, mock.api);
  const converted = await store.read();
  assert.equal(converted.inbox[first.id], undefined);
  assert.equal(converted.tasks[task.id].title, first.title);
  assert.equal(task.attachments.length, 1);
  assert.equal(await readFile(task.attachments[0].path, 'utf8'), 'idea attachment');
  assert.notEqual(task.attachments[0].path, first.attachments[0].path);
  await assert.rejects(() => access(first.attachments[0].path));

  const retained = await service.addInbox({ clientRequestId: '53535353-5353-4353-8353-535353535353', title: 'Keep on failure' });
  mock.api.providers.listModes = async () => ({ provider: 'codex', error: 'offline', fetchedAt: '', requestId: '' });
  await assert.rejects(() => service.create({ ...input, clientRequestId: '54545454-5454-4454-8454-545454545454', inboxId: retained.id }, mock.api), /无法读取运行模式/);
  assert.equal((await store.read()).inbox[retained.id].title, retained.title);
});
test('deleting an Inbox idea removes its stored attachments', async t => {
  const { service, store } = await setup(t);
  const contents = Buffer.from('discarded idea attachment');
  const entry = await service.addInbox({
    clientRequestId: '56565656-5656-4656-8656-565656565656',
    title: 'Discard this idea',
    attachments: [{ id: '57575757-5757-4757-8757-575757575757', fileName: 'discard.txt', mimeType: 'text/plain', size: contents.byteLength, dataBase64: contents.toString('base64') }],
  });
  const path = entry.attachments[0].path;
  await service.deleteInbox(entry.id);
  assert.equal((await store.read()).inbox[entry.id], undefined);
  await assert.rejects(() => access(path));
});
test('editing an Inbox idea updates only its title', async t => {
  const { service, store } = await setup(t);
  const contents = Buffer.from('keep this attachment');
  const entry = await service.addInbox({
    clientRequestId: '58585858-5858-4858-8858-585858585858',
    title: 'Original idea',
    attachments: [{ id: '59595959-5959-4959-8959-595959595959', fileName: 'keep.txt', mimeType: 'text/plain', size: contents.byteLength, dataBase64: contents.toString('base64') }],
  });
  const changed = await service.patchInbox({ id: entry.id, expectedTitle: 'Original idea', title: 'Updated idea' });
  assert.equal(changed.title, 'Updated idea');
  assert.deepEqual(changed.attachments, entry.attachments);
  assert.equal((await store.read()).inbox[entry.id].title, 'Updated idea');
  assert.equal(await readFile(entry.attachments[0].path, 'utf8'), 'keep this attachment');
  await assert.rejects(() => service.patchInbox({ id: entry.id, expectedTitle: 'Original idea', title: 'Stale overwrite' }), /其他位置修改/);
  assert.equal((await store.read()).inbox[entry.id].title, 'Updated idea');
  await assert.rejects(() => service.patchInbox({ id: '60606060-6060-4060-8060-606060606060', expectedTitle: 'Missing', title: 'Missing' }), /Inbox 条目不存在/);
});
test('launch keeps the title out of the prompt body', async t => {
  const { service } = await setup(t); const mock = mockApi();
  const task = await service.create(input, mock.api);
  await service.launch(task.id, mock.api);
  assert.equal(mock.createOptions[0].title, input.title);
  assert.equal(mock.createOptions[0].prompt, input.description);

  const taskWithoutDescription = await service.create({ ...input, clientRequestId: '77777777-7777-4777-8777-777777777777', description: '' }, mock.api);
  await service.launch(taskWithoutDescription.id, mock.api);
  assert.equal(mock.createOptions[1].title, input.title);
  assert.equal(mock.createOptions[1].prompt, '');
});
test('retrying the same create request returns the persisted task without duplicating it', async t => {
  const { service, store } = await setup(t); const mock = mockApi();
  const [first, concurrentRetry] = await Promise.all([service.create(input, mock.api), service.create(input, mock.api)]);
  assert.equal(concurrentRetry.id, first.id);
  mock.api.providers.listModes = async () => ({ provider: 'codex', error: 'offline', fetchedAt: '', requestId: '' });
  const retry = await service.create(input, mock.api);
  assert.equal(retry.id, first.id);
  assert.equal(Object.keys((await store.read()).tasks).length, 1);
});
test('attachments persist outside the board file and are forwarded on launch', async t => {
  const { service } = await setup(t); const mock = mockApi();
  const contents = Buffer.from('attachment contents');
  const task = await service.create({ ...input, attachments: [{ id: '77777777-7777-4777-8777-777777777777', fileName: 'notes.txt', mimeType: 'text/plain', size: contents.byteLength, dataBase64: contents.toString('base64') }] }, mock.api);
  assert.equal(task.attachments.length, 1);
  assert.equal(await readFile(task.attachments[0].path, 'utf8'), 'attachment contents');
  const boardFile = await readFile(service.store.file, 'utf8');
  assert(!boardFile.includes(contents.toString('base64')));
  await service.launch(task.id, mock.api);
  assert.deepEqual(mock.createOptions[0].attachments, task.attachments);
});
test('a never-started task can change workspace and add pasted attachments', async t => {
  const { service, store } = await setup(t); const mock = mockApi();
  const task = await service.create(input, mock.api);
  const contents = Buffer.from('pasted image');
  await service.patch({ id: task.id, patch: {
    workspaceId: 'workspace-api',
    attachmentAdditions: [{ id: '12121212-1212-4121-8121-121212121212', fileName: 'pasted.png', mimeType: 'image/png', size: contents.byteLength, dataBase64: contents.toString('base64') }],
  } }, mock.api);
  const changed = (await store.read()).tasks[task.id];
  assert.equal(changed.workspaceId, 'workspace-api');
  assert.equal(changed.attachments.length, 1);
  assert.equal(await readFile(changed.attachments[0].path, 'utf8'), 'pasted image');
  await service.launch(task.id, mock.api);
  assert.equal(mock.agents.at(-1)?.workspaceId, 'workspace-api');
  assert.deepEqual(mock.createOptions[0].attachments, changed.attachments);
  await assert.rejects(() => service.patch({ id: task.id, patch: { workspaceId: 'workspace-design' } }, mock.api), /开始执行后不能修改/);
});
test('a failed attachment patch removes files written earlier in the same patch', async t => {
  const { service, store } = await setup(t); const mock = mockApi();
  const task = await service.create(input, mock.api);
  const first = { id: '13131313-1313-4131-8131-131313131313', fileName: 'first.txt', mimeType: 'text/plain', size: 5, dataBase64: Buffer.from('first').toString('base64') };
  const incomplete = { id: '14141414-1414-4141-8141-141414141414', fileName: 'broken.txt', mimeType: 'text/plain', size: 20, dataBase64: Buffer.from('short').toString('base64') };
  await assert.rejects(() => service.patch({ id: task.id, patch: { attachmentAdditions: [first, incomplete] } }, mock.api), /内容不完整/);
  assert.equal((await store.read()).tasks[task.id].attachments.length, 0);
  await service.patch({ id: task.id, patch: { attachmentAdditions: [first] } }, mock.api);
  assert.equal((await store.read()).tasks[task.id].attachments.length, 1);
});
test('deleting a never-run task removes its stored attachments and launched tasks are protected', async t => {
  const { service, store } = await setup(t); const mock = mockApi();
  const contents = Buffer.from('delete me');
  const draft = await service.create({ ...input, attachments: [{ id: '88888888-8888-4888-8888-888888888888', fileName: 'draft.png', mimeType: 'image/png', size: contents.byteLength, dataBase64: contents.toString('base64') }] }, mock.api);
  const path = draft.attachments[0].path;
  assert.deepEqual(await service.delete(draft.id), { ok: true });
  assert.equal((await store.read()).tasks[draft.id], undefined);
  await assert.rejects(() => readFile(path));
  const launched = await service.create(input, mock.api);
  await service.launch(launched.id, mock.api);
  await assert.rejects(() => service.delete(launched.id), /从未执行过/);
});
test('board reads recover interrupted attachment deletes and remove orphan tombstones', async t => {
  const { service, store } = await setup(t); const mock = mockApi();
  const contents = Buffer.from('recover me');
  const draft = await service.create({ ...input, attachments: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', fileName: 'recovery.txt', mimeType: 'text/plain', size: contents.byteLength, dataBase64: contents.toString('base64') }] }, mock.api);
  const directory = dirname(draft.attachments[0].path);
  const activeTombstone = `${directory}.deleting-cccccccc-cccc-4ccc-8ccc-cccccccccccc`;
  await rename(directory, activeTombstone);
  await service.read(mock.api);
  assert.equal(await readFile(draft.attachments[0].path, 'utf8'), 'recover me');
  const deletedTombstone = `${directory}.deleting-dddddddd-dddd-4ddd-8ddd-dddddddddddd`;
  await rename(directory, deletedTombstone);
  await store.update(data => { delete data.tasks[draft.id]; });
  await service.read(mock.api);
  await assert.rejects(() => access(deletedTombstone));
});
test('launch rejects attachment paths outside the task-owned directory', async t => {
  const { service, store } = await setup(t); const mock = mockApi();
  const contents = Buffer.from('safe content');
  const draft = await service.create({ ...input, attachments: [{ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', fileName: 'safe.txt', mimeType: 'text/plain', size: contents.byteLength, dataBase64: contents.toString('base64') }] }, mock.api);
  const outside = join(dirname(store.file), 'outside.txt');
  await writeFile(outside, contents);
  await store.update(data => { data.tasks[draft.id].attachments[0].path = outside; });
  await assert.rejects(() => service.launch(draft.id, mock.api), /附件已丢失或不可读取/);
  assert.equal((await store.read()).tasks[draft.id].launchState, undefined);
  assert.equal(mock.creates, 0);
});
test('selected restrictive mode survives reload and is forwarded on launch', async t => {
  const { service, store } = await setup(t); const mock = mockApi();
  const task = await service.create({ ...input, modeId: 'auto' }, mock.api);
  const reloaded = new BoardService(new Store(store.file));
  assert.equal((await store.read()).tasks[task.id].modeId, 'auto');
  await reloaded.launch(task.id, mock.api);
  assert.equal(mock.configs[0].modeId, 'auto');
});
test('selected thinking mode survives reload and is forwarded on launch', async t => {
  const { service, store } = await setup(t); const mock = mockApi();
  const task = await service.create({ ...input, thinkingOptionId: 'low' }, mock.api);
  const reloaded = new BoardService(new Store(store.file));
  assert.equal((await store.read()).tasks[task.id].thinkingOptionId, 'low');
  await reloaded.launch(task.id, mock.api);
  assert.equal(mock.configs[0].thinkingOptionId, 'low');
});
test('invalid or unavailable thinking mode fails before any launch state is written', async t => {
  const { service, store } = await setup(t); const mock = mockApi();
  await assert.rejects(() => service.create({ ...input, thinkingOptionId: 'ultra' }, mock.api), /Thinking Mode 已不可用/);
  assert.equal(Object.keys((await store.read()).tasks).length, 0);
  const task = await service.create({ ...input, thinkingOptionId: 'low' }, mock.api);
  mock.api.providers.listModels = async () => ({ provider: 'codex', fetchedAt: '', requestId: '', models: [{ provider: 'codex', id: 'model', label: 'Model', thinkingOptions: [{ id: 'high', label: 'High' }] }] });
  await assert.rejects(() => service.launch(task.id, mock.api), /Thinking Mode 已不可用/);
  assert.equal((await store.read()).tasks[task.id].launchState, undefined);
  assert.equal(mock.creates, 0);
});
test('invalid or unavailable mode fails before any launch state is written', async t => {
  const { service, store } = await setup(t); const mock = mockApi();
  await assert.rejects(() => service.create({ ...input, modeId: 'other-provider-mode' }, mock.api), /模式已不可用/);
  assert.equal(Object.keys((await store.read()).tasks).length, 0);
  const task = await service.create({ ...input, modeId: 'auto-review' }, mock.api);
  mock.api.providers.listModes = async () => ({ provider: 'codex', modes: [{ id: 'auto', label: 'Default' }], fetchedAt: '', requestId: '' });
  await assert.rejects(() => service.launch(task.id, mock.api), /模式已不可用/);
  assert.equal((await store.read()).tasks[task.id].launchState, undefined);
  assert.equal(mock.creates, 0);
});
test('mode discovery failure does not silently launch with other permissions', async t => {
  const { service } = await setup(t); const mock = mockApi();
  mock.api.providers.listModes = async () => ({ provider: 'codex', error: 'offline', fetchedAt: '', requestId: '' });
  await assert.rejects(() => service.create(input, mock.api), /无法读取运行模式/);
  assert.equal(mock.creates, 0);
});
test('legacy drafts without a mode migrate to Full Access before the first prompt', async t => {
  const { service, store } = await setup(t); const mock = mockApi();
  const task = taskSchema.parse({ ...input, id: 'task:legacy', createdAt: '', updatedAt: '' });
  await store.update(data => { data.tasks[task.id] = task; });
  await service.launch(task.id, mock.api);
  assert.equal(mock.configs[0].modeId, 'full-access');
  assert.equal((await store.read()).tasks[task.id].modeId, 'full-access');
});
test('lost response is reconciled by task label without executing twice', async t => {
  const { service } = await setup(t); const mock = mockApi(); const task = await service.create(input, mock.api); mock.lose();
  await assert.rejects(() => service.launch(task.id, mock.api), /启动未确认/);
  const result = await service.launch(task.id, mock.api); assert.equal(result.agentId, 'created-1'); assert.equal(mock.creates, 1);
});
test('ambiguous transport failure does not silently start a duplicate', async t => {
  const { service } = await setup(t); const mock = mockApi(); const task = await service.create(input, mock.api); mock.fail();
  await assert.rejects(() => service.launch(task.id, mock.api), /启动未确认/);
  await assert.rejects(() => service.launch(task.id, mock.api), /上次启动结果尚未确认/);
  assert.equal(mock.creates, 1);
});
test('partial metadata updates merge and moving active agents to done fails', async t => {
  const { service, store } = await setup(t); const { api } = mockApi();
  await service.patch({ id: 'agent:session-01', patch: { description: 'keep', tags: ['keep'] } }, api);
  await service.patch({ id: 'agent:session-01', patch: { pinned: true } }, api);
  const meta = (await store.read()).sessions['session-01']; assert.equal(meta.description, 'keep'); assert.equal(meta.pinned, true);
  await assert.rejects(() => service.move({ id: 'agent:session-01', stage: 'done' }, api), /会话仍在运行/);
});
test('batch completion marks every reviewed task done atomically', async t => {
  const { service, store } = await setup(t); const { api } = mockApi();
  await assert.rejects(() => service.completeReview({ ids: ['agent:session-05', 'agent:session-04'] }, api), /已不在待审核状态/);
  assert.equal((await store.read()).sessions['session-05'], undefined);
  assert.equal((await store.read()).sessions['session-04'], undefined);

  const result = await service.completeReview({ ids: ['agent:session-05', 'agent:session-06', 'agent:session-05'] }, api);
  assert.deepEqual(result, { ok: true, count: 2 });
  const data = await store.read();
  assert.equal(data.sessions['session-05'].stage, 'done');
  assert.equal(data.sessions['session-06'].stage, 'done');
  assert(data.sessions['session-05'].stageTurn);
});
test('real installed SDK splits provider/model and forwards workspace and prompt', async () => {
  const calls: Record<string, unknown>[] = [];
  const driver = { createAgent: async (options: Record<string,unknown>) => { calls.push(options); return { id: 'real-sdk-agent' }; } };
  const api = createPaseoApi(driver as never);
  const attachments = [{ type: 'uploaded_file' as const, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', fileName: 'brief.pdf', mimeType: 'application/pdf', size: 12, path: 'C:/uploads/brief.pdf' }];
  const result = await api.agents.create({ config: { provider: 'codex/test-model', modeId: 'full-access', thinkingOptionId: 'high' }, cwd: 'C:/test', prompt: 'implement', title: 'Task', attachments });
  assert.equal(result.id, 'real-sdk-agent');
  assert.equal((calls[0].config as Record<string,unknown>).model, 'test-model');
  assert.equal((calls[0].config as Record<string,unknown>).modeId, 'full-access');
  assert.equal((calls[0].config as Record<string,unknown>).thinkingOptionId, 'high');
  assert.equal(calls[0].initialPrompt, 'implement');
  assert.deepEqual(calls[0].attachments, attachments);
  await assert.rejects(() => api.agents.create({ config: { provider: 'codex' }, cwd: 'C:/test' }), /provider\/model/);
  assert.equal(calls.length, 1);
});
