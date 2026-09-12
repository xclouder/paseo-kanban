import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createPaseoApi, type PaseoApi } from '@getpaseo/client';
import { Store } from '../src/store.server';
import { BoardService, collectPages } from '../src/service.server';
import { fixture } from '../preview/fixture';
import { emptyStore, metadataSchema, taskSchema } from '../src/model.shared';

async function setup(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'paseo-kanban-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new Store(join(directory, 'board.json'));
  return { store, service: new BoardService(store) };
}
function mockApi() {
  const snapshot = fixture();
  const agents = snapshot.agents.map(a => ({ ...a, title: a.title, archivedAt: null, pendingPermissions: a.pendingPermission ? [{ id: 'permission' }] : [], capabilities: {}, model: 'model', availableModes: [], currentModeId: null, persistence: null }));
  let creates = 0, failure = false, loseResponse = false;
  const configs: { provider: string; modeId?: string }[] = [];
  const createOptions: Record<string, unknown>[] = [];
  const api = {
    agents: {
      list: async (opts?: { filter?: { labels?: Record<string, string> } }) => ({ entries: agents.filter(a => !opts?.filter?.labels || Object.entries(opts.filter.labels).every(([k,v]) => a.labels[k] === v)).map(agent => ({ agent })), pageInfo: { hasMore: false, nextCursor: null } }),
      ref: (id: string) => ({ refresh: async () => { const agent = agents.find(a => a.id === id); return agent ? { agent } : null; } }),
    },
    workspaces: {
      list: async () => ({ entries: snapshot.workspaces.map(w => ({ ...w, projectDisplayName: w.project, projectRootPath: w.directory, workspaceDirectory: w.directory })), pageInfo: { hasMore: false, nextCursor: null } }),
      ref: (id: string) => ({ refresh: async () => { const w = snapshot.workspaces.find(w => w.id === id); return w ? { ...w, workspaceDirectory: w.directory, projectRootPath: w.directory } : null; }, agents: { create: async (options: { config: { provider: string; modeId?: string }; labels: Record<string,string>; title: string }) => {
        creates++; assert.match(options.config.provider, /^[^/]+\/.+$/);
        createOptions.push(options as unknown as Record<string, unknown>);
        configs.push(options.config);
        if (failure) throw new Error('connection lost');
        const agent = { ...agents[0], id: `created-${creates}`, title: options.title, labels: options.labels, workspaceId: id };
        agents.push(agent); if (loseResponse) throw new Error('response lost'); return { id: agent.id };
      } } }),
    },
    providers: { listAvailable: async () => ({ providers: [{ provider: 'codex', available: true }] }), listModels: async () => ({ models: [{ id: 'model', label: 'Model' }] }), listModes: async () => ({ modes: snapshot.modes.filter(mode => mode.provider === 'codex') }) },
  } as unknown as PaseoApi;
  return { api, agents, configs, createOptions, get creates() { return creates; }, fail: () => { failure = true; }, lose: () => { loseResponse = true; } };
}
const input = { clientRequestId: '66666666-6666-4666-8666-666666666666', title: 'Ship feature', description: 'Acceptance criteria', workspaceId: 'workspace-web', provider: 'codex/model', priority: 'high' as const, tags: ['test'] };

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
  assert(snapshot.modes.some(mode => mode.provider === 'codex' && mode.id === 'full-access'));
});
test('create is a draft; concurrent launch invokes provider exactly once', async t => {
  const { service, store } = await setup(t); const mock = mockApi();
  const task = await service.create(input, mock.api); assert.equal(mock.creates, 0);
  assert.equal(task.modeId, 'full-access');
  const results = await Promise.all([service.launch(task.id, mock.api), service.launch(task.id, mock.api)]);
  assert.equal(mock.creates, 1); assert.equal(results[0].agentId, results[1].agentId);
  assert.equal((await store.read()).tasks[task.id].agentId, results[0].agentId);
  assert.equal(mock.configs[0].modeId, 'full-access');
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
  const result = await api.agents.create({ config: { provider: 'codex/test-model', modeId: 'full-access' }, cwd: 'C:/test', prompt: 'implement', title: 'Task', attachments });
  assert.equal(result.id, 'real-sdk-agent');
  assert.equal((calls[0].config as Record<string,unknown>).model, 'test-model');
  assert.equal((calls[0].config as Record<string,unknown>).modeId, 'full-access');
  assert.equal(calls[0].initialPrompt, 'implement');
  assert.deepEqual(calls[0].attachments, attachments);
  await assert.rejects(() => api.agents.create({ config: { provider: 'codex' }, cwd: 'C:/test' }), /provider\/model/);
  assert.equal(calls.length, 1);
});
