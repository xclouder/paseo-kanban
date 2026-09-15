import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCards, defaultModeId, defaultThinkingOptionId, emptyStore, filterCards, metadataSchema, resolveStage, storeSchema, taskSchema } from '../shared/model';
import { completeReviewInput, patchInput, createInput } from '../shared/contracts';
import { fixture } from '../preview/fixture';

test('partial RPC inputs do not introduce defaults or erase unrelated metadata', () => {
  const input = patchInput.parse({ id: 'agent:one', patch: { pinned: true } });
  assert.deepEqual(input.patch, { pinned: true });
  const meta = metadataSchema.parse({ description: 'keep', tags: ['retain'], priority: 'high', hidden: true });
  Object.assign(meta, input.patch);
  assert.equal(meta.description, 'keep'); assert.deepEqual(meta.tags, ['retain']); assert.equal(meta.priority, 'high'); assert.equal(meta.hidden, true);
  assert.deepEqual(patchInput.parse({ id: 'agent:one', patch: { hidden: true } }).patch, { hidden: true });
});
test('legacy board files gain an empty Inbox without a version migration', () => {
  const store = storeSchema.parse({ version: 1, sessions: {}, tasks: {} });
  assert.deepEqual(store.inbox, {});
});
test('draft patches accept a workspace and newly pasted attachments without adding defaults', () => {
  const attachment = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', fileName: 'pasted.png', mimeType: 'image/png', size: 3, dataBase64: Buffer.from('abc').toString('base64') };
  const patch = patchInput.parse({ id: 'task:draft', patch: { workspaceId: 'workspace-api', attachmentAdditions: [attachment] } }).patch;
  assert.equal(patch.workspaceId, 'workspace-api');
  assert.deepEqual(patch.attachmentAdditions, [attachment]);
  assert.deepEqual(patchInput.parse({ id: 'task:draft', patch: { workspaceId: 'workspace-api' } }).patch, { workspaceId: 'workspace-api' });
});
test('batch completion accepts every visible reviewed task without an arbitrary count limit', () => {
  const ids = Array.from({ length: 501 }, (_, index) => `agent:${index}`);
  assert.equal(completeReviewInput.parse({ ids }).ids.length, ids.length);
});
test('task launch configuration requires provider/model', () => {
  const input = { clientRequestId: '11111111-1111-4111-8111-111111111111', title: 'task', description: '', workspaceId: 'ws', provider: 'codex', priority: 'medium', tags: [] };
  assert.equal(createInput.safeParse(input).success, false);
  assert.equal(createInput.safeParse({ ...input, provider: 'codex/model' }).success, true);
});
test('Full Access is preferred by provider id or label, with supported fallback', () => {
  assert.equal(defaultModeId([{ id: 'auto', label: 'Default Permissions' }, { id: 'full-access', label: 'Full Access' }]), 'full-access');
  assert.equal(defaultModeId([{ id: 'plan', label: 'Plan Mode' }, { id: 'default', label: 'Always Ask' }, { id: 'bypassPermissions', label: 'Bypass' }], 'claude'), 'bypassPermissions');
  assert.equal(defaultModeId([{ id: 'plan', label: 'Plan' }]), 'plan');
  assert.equal(defaultModeId([]), undefined);
});
test('High thinking is preferred with provider and supported fallbacks', () => {
  const options = [{ id: 'low', label: 'Low' }, { id: 'medium', label: 'Medium', isDefault: true }, { id: 'high', label: 'High' }];
  assert.equal(defaultThinkingOptionId(options, 'medium'), 'high');
  assert.equal(defaultThinkingOptionId(options.slice(0, 2), 'medium'), 'medium');
  assert.equal(defaultThinkingOptionId([{ id: 'minimal', label: 'Minimal' }]), 'minimal');
  assert.equal(defaultThinkingOptionId([]), undefined);
});
test('create RPC preserves a selected mode and legacy tasks do not gain new permissions', () => {
  const input = { clientRequestId: '22222222-2222-4222-8222-222222222222', title: 'task', description: '', workspaceId: 'ws', provider: 'codex/model', priority: 'medium', tags: [], modeId: 'auto-review' };
  assert.equal(createInput.parse(input).modeId, 'auto-review');
  assert.equal(createInput.safeParse({ ...input, modeId: '' }).success, false);
  const { modeId, ...legacy } = input;
  assert.equal(taskSchema.parse({ ...legacy, id: 'legacy', createdAt: '', updatedAt: '' }).modeId, undefined);
  assert.deepEqual(taskSchema.parse({ ...legacy, id: 'legacy', createdAt: '', updatedAt: '' }).attachments, []);
});
test('create RPC preserves a selected thinking mode while legacy tasks remain compatible', () => {
  const input = { clientRequestId: '44444444-4444-4444-8444-444444444444', title: 'task', description: '', workspaceId: 'ws', provider: 'codex/model', priority: 'medium' as const, tags: [], thinkingOptionId: 'low' };
  assert.equal(createInput.parse(input).thinkingOptionId, 'low');
  assert.equal(createInput.safeParse({ ...input, thinkingOptionId: '' }).success, false);
  const { thinkingOptionId, ...legacy } = input;
  assert.equal(taskSchema.parse({ ...legacy, id: 'legacy-thinking', createdAt: '', updatedAt: '' }).thinkingOptionId, undefined);
});
test('create RPC validates attachment metadata and applies an empty default', () => {
  const base = { clientRequestId: '33333333-3333-4333-8333-333333333333', title: 'task', description: '', workspaceId: 'ws', provider: 'codex/model', priority: 'medium', tags: [] };
  assert.deepEqual(createInput.parse(base).attachments, []);
  const attachment = { id: '99999999-9999-4999-8999-999999999999', fileName: 'mock.png', mimeType: 'image/png', size: 3, dataBase64: Buffer.from('abc').toString('base64') };
  assert.equal(createInput.safeParse({ ...base, attachments: [attachment] }).success, true);
  assert.equal(createInput.safeParse({ ...base, attachments: [{ ...attachment, dataBase64: 'not base64' }] }).success, false);
});
test('all existing sessions appear without a manual import', () => {
  const snapshot = fixture(); snapshot.store = emptyStore();
  assert.equal(buildCards(snapshot).length, snapshot.agents.length);
});
test('running, permission, errors and finished turns map to workflow stages', () => {
  const agent = fixture().agents[0], meta = metadataSchema.parse({});
  assert.equal(resolveStage(meta, agent), 'running');
  assert.equal(resolveStage(meta, { ...agent, status: 'idle', activeTurn: false }), 'review');
  assert.equal(resolveStage(meta, { ...agent, status: 'error', activeTurn: false }), 'blocked');
  assert.equal(resolveStage(meta, { ...agent, pendingPermission: true, activeTurn: false }), 'blocked');
  assert.equal(resolveStage(meta, { ...agent, status: 'idle', activeTurn: true }), 'running');
});
test('manual running stage does not mask finish, permission or failure', () => {
  const agent = fixture().agents[0], meta = metadataSchema.parse({ stage: 'running', stageTurn: agent.lastUserMessageAt });
  assert.equal(resolveStage(meta, { ...agent, status: 'idle', activeTurn: false }), 'review');
  assert.equal(resolveStage(meta, { ...agent, status: 'error', activeTurn: false }), 'blocked');
  assert.equal(resolveStage(meta, { ...agent, pendingPermission: true, activeTurn: false }), 'blocked');
});
test('done survives metadata updates but reopens on a new prompt', () => {
  const agent = { ...fixture().agents[0], status: 'idle', activeTurn: false };
  const meta = metadataSchema.parse({ stage: 'done', stageTurn: agent.lastUserMessageAt });
  assert.equal(resolveStage(meta, { ...agent, updatedAt: new Date().toISOString() }), 'done');
  assert.equal(resolveStage(meta, { ...agent, lastUserMessageAt: new Date().toISOString() }), 'review');
  assert.equal(resolveStage(meta, { ...agent, status: 'running' }), 'running');
});
test('linked task has one card and retains its identity if session disappears', () => {
  const snapshot = fixture(); const task = Object.values(snapshot.store.tasks)[0]; task.agentId = snapshot.agents[0].id;
  let cards = buildCards(snapshot);
  assert.equal(cards.filter(c => c.agent?.id === task.agentId).length, 1);
  snapshot.agents = snapshot.agents.filter(a => a.id !== task.agentId);
  cards = buildCards(snapshot); assert(cards.some(c => c.id === task.id));
});
test('search matches Chinese tags, paths, provider and exact agent ID across workspaces', () => {
  const cards = buildCards(fixture());
  const filters = { query: '数据库', projectId: '', provider: '', pinned: false, attention: false, hidden: false };
  assert.equal(filterCards(cards, filters).length, 1);
  assert.equal(filterCards(cards, { ...filters, query: 'session-03' })[0].agent?.id, 'session-03');
  assert(filterCards(cards, { ...filters, query: 'PASEO-KANBAN' }).length > 1);
  assert.equal(filterCards(cards, { ...filters, query: '数据库', workspaceId: 'workspace-web' }).length, 0);
});
test('pinned and priority sorting and hiding preserve metadata', () => {
  const cards = buildCards(fixture()); const filters = { query: '', projectId: '', provider: '', pinned: false, attention: false, hidden: false };
  assert.equal(filterCards(cards, filters)[0].pinned, true);
  cards[0].hidden = true; assert(!filterCards(cards, filters).some(c => c.id === cards[0].id));
  assert.equal(filterCards(cards, { ...filters, hidden: true })[0].id, cards[0].id);
});
