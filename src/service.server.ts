import type { PaseoApi, PaseoAgent } from '@getpaseo/client';
import { MAX_ATTACHMENT_FILES, MAX_ATTACHMENT_SIZE, MAX_ATTACHMENT_TOTAL_SIZE, type CompleteReviewInput, type CreateInput, type MoveInput, type PatchInput } from './contracts.shared';
import { buildCards, defaultModeId, metadataSchema, resolveStage, taskSchema, type Agent, type BoardStore, type Metadata, type Snapshot, type TaskAttachment } from './model.shared';
import { Store } from './store.server';
import { applyProjectAction, type ProjectAction } from './projects.shared';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, lstat, mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';

const agentRefreshConcurrency = 25;

export async function collectPages<T>(fetch: (cursor?: string) => Promise<{ entries: T[]; pageInfo: { hasMore: boolean; nextCursor: string | null } }>): Promise<T[]> {
  const entries: T[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await fetch(cursor);
    entries.push(...page.entries);
    if (!page.pageInfo.hasMore) return entries;
    const next = page.pageInfo.nextCursor;
    if (!next || seen.has(next)) throw new Error('会话分页异常，请刷新重试。');
    seen.add(next); cursor = next;
  } while (true);
}

export function summarizeAgent(agent: PaseoAgent): Agent {
  return {
    id: agent.id, workspaceId: agent.workspaceId ?? null, title: agent.title || '未命名会话',
    provider: agent.provider, cwd: agent.cwd, status: agent.status,
    updatedAt: agent.updatedAt, createdAt: agent.createdAt, lastUserMessageAt: agent.lastUserMessageAt,
    attentionReason: agent.attentionReason ?? null, pendingPermission: agent.pendingPermissions.length > 0,
    archived: Boolean(agent.archivedAt), labels: agent.labels,
  };
}

export class BoardService {
  constructor(readonly store: Store) {}
  async organizeProjects(action: ProjectAction, paseo: PaseoApi) {
    return this.store.update(async data => {
      const workspaces = action.type === 'moveProject' ? await collectPages(cursor => paseo.workspaces.list({ page: { limit: 100, cursor } })) : [];
      const projects = [...new Map(workspaces.map(workspace => [workspace.projectId, { id: workspace.projectId, name: workspace.projectDisplayName }])).values()];
      applyProjectAction(data.projectLayout, action, projects);
      return { ok: true };
    });
  }
  private attachmentKey(taskId: string) {
    const uuid = /^task:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(taskId)?.[1];
    return uuid ?? createHash('sha256').update(taskId).digest('hex');
  }
  private attachmentRoot() { return join(dirname(this.store.file), 'attachments'); }
  private attachmentDirectory(taskId: string) { return join(this.attachmentRoot(), this.attachmentKey(taskId)); }
  /** Recover an interrupted delete, and retry cleanup after interrupted creates/deletes. */
  private async reconcileAttachmentStorage(data: BoardStore) {
    let entries;
    try { entries = await readdir(this.attachmentRoot(), { withFileTypes: true }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    const managedKey = '(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[0-9a-f]{64})';
    const canonicalPattern = new RegExp(`^${managedKey}$`, 'i');
    const deletingPattern = new RegExp(`^(${managedKey})\\.deleting-[0-9a-f-]{36}$`, 'i');
    const active = new Set(Object.keys(data.tasks).map(taskId => this.attachmentKey(taskId).toLowerCase()));
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const source = join(this.attachmentRoot(), entry.name);
      const deleting = deletingPattern.exec(entry.name);
      if (deleting) {
        const key = deleting[1].toLowerCase();
        if (!active.has(key)) { await rm(source, { recursive: true, force: true }).catch(() => undefined); continue; }
        const target = join(this.attachmentRoot(), deleting[1]);
        try { await rename(source, target); }
        catch {
          try { await access(target); await rm(source, { recursive: true, force: true }); }
          catch { /* Leave the tombstone for the next board read. */ }
        }
      } else if (canonicalPattern.test(entry.name) && !active.has(entry.name.toLowerCase())) {
        await rm(source, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  }
  private async saveAttachments(taskId: string, attachments: NonNullable<CreateInput['attachments']>): Promise<TaskAttachment[]> {
    if (attachments.length > MAX_ATTACHMENT_FILES) throw new Error(`最多添加 ${MAX_ATTACHMENT_FILES} 个附件。`);
    const oversized = attachments.find(attachment => attachment.size > MAX_ATTACHMENT_SIZE);
    if (oversized) throw new Error(`${oversized.fileName} 超过 20 MB，无法添加。`);
    const total = attachments.reduce((sum, attachment) => sum + attachment.size, 0);
    if (total > MAX_ATTACHMENT_TOTAL_SIZE) throw new Error('附件总大小不能超过 50 MB。');
    if (new Set(attachments.map(attachment => attachment.id)).size !== attachments.length) throw new Error('附件标识重复，请移除后重新添加。');
    if (!attachments.length) return [];
    const directory = this.attachmentDirectory(taskId);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const stored: TaskAttachment[] = [];
    for (const attachment of attachments) {
      const bytes = Buffer.from(attachment.dataBase64, 'base64');
      if (bytes.byteLength !== attachment.size) throw new Error(`附件 ${attachment.fileName} 的内容不完整，请重新添加。`);
      const rawExtension = extname(attachment.fileName);
      const extension = /^\.[A-Za-z0-9]{1,16}$/.test(rawExtension) ? rawExtension.toLowerCase() : '';
      const path = join(directory, `${attachment.id}${extension}`);
      await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
      stored.push({ type: 'uploaded_file', id: attachment.id, fileName: attachment.fileName, mimeType: attachment.mimeType, size: attachment.size, path });
    }
    return stored;
  }
  private providerCache?: { time: number; value: Pick<Snapshot, 'providers' | 'models' | 'modes' | 'providerError'> };
  private async providerOptions(paseo: PaseoApi): Promise<Pick<Snapshot, 'providers' | 'models' | 'modes' | 'providerError'>> {
    if (this.providerCache && Date.now() - this.providerCache.time < 60000) return this.providerCache.value;
    try {
      const result = await paseo.providers.listAvailable();
      if (result.error) throw new Error(result.error);
      const providers = result.providers.filter(p => p.available).map(p => p.provider);
      const results = await Promise.allSettled(providers.map(async provider => {
        const [result, modeResult] = await Promise.all([paseo.providers.listModels(provider), paseo.providers.listModes(provider)]);
        if (result.error || modeResult.error) throw new Error(result.error || modeResult.error!);
        return {
          models: (result.models ?? []).filter(m => m.isSelectable !== false).map(m => ({ id: `${provider}/${m.id}`, label: m.label, provider })),
          modes: (modeResult.modes ?? []).map(m => ({ id: m.id, label: m.label, provider, description: m.description })),
        };
      }));
      const models = results.flatMap(r => r.status === 'fulfilled' ? r.value.models : []);
      const modes = results.flatMap(r => r.status === 'fulfilled' ? r.value.modes : []);
      const value = { providers, models, modes, providerError: results.some(r => r.status === 'rejected') ? '部分 Agent 模型或运行模式暂时无法读取，请稍后刷新。' : undefined };
      if (!value.providerError) this.providerCache = { time: Date.now(), value };
      return value;
    } catch { return { providers: [], models: [], modes: [], providerError: '暂时无法读取 Agent 模型和运行模式列表，请稍后刷新。' }; }
  }
  private async agents(paseo: PaseoApi) {
    const entries = await collectPages(cursor => paseo.agents.list({ filter: { includeArchived: false }, sort: [{ key: 'created_at', direction: 'asc' }], page: { limit: 100, cursor } }));
    return [...new Map(entries.map(({ agent }) => [agent.id, summarizeAgent(agent)])).values()];
  }
  async read(paseo: PaseoApi, reconcileAttachments = true): Promise<Snapshot> {
    const storeRead = reconcileAttachments ? this.store.exclusive(async () => {
      const data = await this.store.read();
      await this.reconcileAttachmentStorage(data);
      return data;
    }) : this.store.read();
    const [store, agents, workspaces, providers] = await Promise.all([
      storeRead, this.agents(paseo),
      collectPages(cursor => paseo.workspaces.list({ sort: [{ key: 'name', direction: 'asc' }], page: { limit: 100, cursor } })),
      this.providerOptions(paseo),
    ]);
    return { store, agents, workspaces: workspaces.map(w => ({ id: w.id, name: w.title || w.name, project: w.projectDisplayName, projectId: w.projectId, directory: w.workspaceDirectory ?? w.projectRootPath })), ...providers, fetchedAt: new Date().toISOString() };
  }
  private async metadata(data: BoardStore, id: string, paseo: PaseoApi): Promise<{ meta: Metadata; agent?: Agent }> {
    if (id.startsWith('agent:')) {
      const agentId = id.slice(6);
      const record = await paseo.agents.ref(agentId).refresh();
      if (!record) throw new Error('这个会话已不存在，请刷新看板。');
      data.sessions[agentId] ??= metadataSchema.parse({});
      return { meta: data.sessions[agentId], agent: summarizeAgent(record.agent) };
    }
    const task = data.tasks[id];
    if (!task) throw new Error('任务不存在，请刷新看板。');
    const record = task.agentId ? await paseo.agents.ref(task.agentId).refresh() : null;
    return { meta: task, agent: record ? summarizeAgent(record.agent) : undefined };
  }
  async patch(input: PatchInput, paseo: PaseoApi) {
    return this.store.update(async data => {
      const { meta } = await this.metadata(data, input.id, paseo);
      if (input.patch.title !== undefined && !input.patch.title.trim()) throw new Error('标题不能为空。');
      Object.assign(meta, input.patch);
      return { ok: true };
    });
  }
  async move(input: MoveInput, paseo: PaseoApi) {
    return this.store.update(async data => {
      const { meta, agent } = await this.metadata(data, input.id, paseo);
      if (input.stage === 'done' && agent && (agent.status === 'running' || agent.status === 'initializing' || agent.pendingPermission)) throw new Error('会话仍在运行或等待授权，请处理后再标记完成。');
      if (input.stage === 'running' && !agent) throw new Error('请在任务详情中点击“开始执行”，启动 Agent。');
      if (input.stage !== 'running' && agent && (agent.status === 'running' || agent.status === 'initializing')) throw new Error('Agent 仍在执行，结束后会自动进入待审核。');
      if (input.stage !== 'blocked' && agent && (agent.pendingPermission || agent.status === 'error')) throw new Error('请先在 Paseo 处理授权或执行错误。');
      meta.stage = input.stage; meta.stageTurn = agent?.lastUserMessageAt ?? null;
      // Reindex a lane under the same writer lock, avoiding drifting fractional ranks.
      const snapshot = await this.read(paseo, false);
      const lane = buildCards({ ...snapshot, store: data }).filter(c => c.stage === input.stage && c.id !== input.id).sort((a, b) => a.order - b.order);
      const before = input.beforeId ? lane.findIndex(c => c.id === input.beforeId) : -1;
      const ids = lane.map(c => c.id);
      ids.splice(before < 0 ? ids.length : before, 0, input.id);
      ids.forEach((id, index) => {
        if (id.startsWith('agent:')) { data.sessions[id.slice(6)] ??= metadataSchema.parse({}); data.sessions[id.slice(6)].order = index + 1; }
        else if (data.tasks[id]) data.tasks[id].order = index + 1;
      });
      return { ok: true };
    });
  }
  async completeReview(input: CompleteReviewInput, paseo: PaseoApi) {
    const ids = [...new Set(input.ids)];
    return this.store.update(async data => {
      const cards: Array<{ meta: Metadata; agent?: Agent }> = [];
      for (let offset = 0; offset < ids.length; offset += agentRefreshConcurrency) {
        const batch = ids.slice(offset, offset + agentRefreshConcurrency);
        cards.push(...await Promise.all(batch.map(id => this.metadata(data, id, paseo))));
      }
      if (cards.some(({ meta, agent }) => resolveStage(meta, agent) !== 'review')) {
        throw new Error('部分任务已不在待审核状态，请刷新看板后重试。');
      }
      const lastOrder = Math.max(0, ...Object.values(data.sessions).map(meta => meta.order), ...Object.values(data.tasks).map(task => task.order));
      cards.forEach(({ meta, agent }, index) => {
        meta.stage = 'done';
        meta.stageTurn = agent?.lastUserMessageAt ?? null;
        meta.order = lastOrder + index + 1;
      });
      return { ok: true, count: cards.length };
    });
  }
  async create(input: CreateInput, paseo: PaseoApi) {
    const persisted = Object.values((await this.store.read()).tasks).find(task => task.createRequestId === input.clientRequestId);
    if (persisted) return persisted;
    if (!/^[^/]+\/.+$/.test(input.provider)) throw new Error('请选择具体的 Agent 模型。');
    const workspace = await paseo.workspaces.ref(input.workspaceId).refresh();
    if (!workspace) throw new Error('工作区已不存在，请重新选择。');
    const modeResult = await paseo.providers.listModes(input.provider.split('/')[0], { cwd: workspace.workspaceDirectory ?? workspace.projectRootPath });
    if (modeResult.error) throw new Error(`无法读取运行模式：${modeResult.error}`);
    const modes = modeResult.modes ?? [];
    const modeId = input.modeId ?? defaultModeId(modes, input.provider.split('/')[0]);
    if (modeId && !modes.some(mode => mode.id === modeId)) throw new Error('所选运行模式已不可用，请刷新后重新选择。');
    return this.store.exclusive(async () => {
      const data = await this.store.read();
      const existing = Object.values(data.tasks).find(task => task.createRequestId === input.clientRequestId);
      if (existing) return existing;
      const now = new Date().toISOString();
      const taskId = `task:${randomUUID()}`;
      const { attachments = [], clientRequestId, ...fields } = input;
      try {
        const storedAttachments = await this.saveAttachments(taskId, attachments);
        const task = taskSchema.parse({ ...fields, modeId, createRequestId: clientRequestId, attachments: storedAttachments, id: taskId, createdAt: now, updatedAt: now, stage: 'todo' });
        data.tasks[task.id] = task;
        await this.store.write(data);
        return task;
      } catch (error) {
        await rm(this.attachmentDirectory(taskId), { recursive: true, force: true }).catch(() => undefined);
        throw error;
      }
    });
  }
  async delete(id: string) {
    return this.store.exclusive(async () => {
      const data = await this.store.read();
      const task = data.tasks[id];
      if (!task) throw new Error('任务不存在。');
      if (task.agentId || task.launchState) throw new Error('只有从未执行过的任务可以删除。');
      const directory = this.attachmentDirectory(id);
      const trash = `${directory}.deleting-${randomUUID()}`;
      let moved = false;
      try {
        await rename(directory, trash);
        moved = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      delete data.tasks[id];
      try {
        await this.store.write(data);
      } catch (error) {
        if (moved) await rename(trash, directory).catch(() => undefined);
        throw error;
      }
      if (moved) await rm(trash, { recursive: true, force: true }).catch(() => undefined);
      return { ok: true };
    });
  }
  async launch(id: string, paseo: PaseoApi) {
    return this.store.exclusive(async () => {
      const data = await this.store.read();
      const task = data.tasks[id];
      if (!task) throw new Error('任务不存在。');
      if (task.agentId) return { agentId: task.agentId };
      if (!/^[^/]+\/.+$/.test(task.provider)) throw new Error('任务缺少具体模型，请新建任务并选择可用模型。');
      // Reconcile a lost response before permitting any duplicate execution.
      const existing = await collectPages(cursor => paseo.agents.list({ filter: { labels: { 'paseo-kanban-task': id }, includeArchived: true }, page: { limit: 100, cursor } }));
      if (existing.length) {
        task.agentId = existing[0].agent.id; task.launchState = 'started'; task.stage = undefined;
        await this.store.write(data); return { agentId: task.agentId };
      }
      if (task.launchState) throw new Error('上次启动结果尚未确认。请先在 Paseo 检查是否已创建会话，避免重复执行；刷新后重试可关联已创建的会话。');
      const workspace = await paseo.workspaces.ref(task.workspaceId).refresh();
      if (!workspace) throw new Error('工作区不可用，请先在 Paseo 恢复该工作区。');
      const modeResult = await paseo.providers.listModes(task.provider.split('/')[0], { cwd: workspace.workspaceDirectory ?? workspace.projectRootPath });
      if (modeResult.error) throw new Error(`无法确认运行模式：${modeResult.error}`);
      const modes = modeResult.modes ?? [];
      const modeId = task.modeId ?? defaultModeId(modes, task.provider.split('/')[0]);
      if (modeId && !modes.some(mode => mode.id === modeId)) throw new Error('任务选择的运行模式已不可用，请检查 Agent 配置后重试。');
      // Drafts created before run-mode support did not persist modeId. Resolve
      // and store the same Full Access default before their first prompt starts.
      if (!task.modeId && modeId) task.modeId = modeId;
      const expectedDirectory = resolve(this.attachmentDirectory(id));
      try { await Promise.all(task.attachments.map(async attachment => {
        const path = resolve(attachment.path);
        const sameDirectory = process.platform === 'win32' ? dirname(path).toLowerCase() === expectedDirectory.toLowerCase() : dirname(path) === expectedDirectory;
        if (!sameDirectory) throw new Error('invalid attachment path');
        const info = await lstat(path);
        if (!info.isFile()) throw new Error('attachment is not a file');
        await access(path, constants.R_OK);
      })); }
      catch { throw new Error('任务附件已丢失或不可读取，请删除任务后重新添加。'); }
      task.launchState = 'starting';
      await this.store.write(data);
      try {
        const agent = await paseo.workspaces.ref(task.workspaceId).agents.create({
          config: { provider: task.provider, ...(modeId ? { modeId } : {}) }, title: task.title,
          prompt: task.description ? `${task.title}\n\n${task.description}` : task.title,
          attachments: task.attachments,
          labels: { 'paseo-kanban-task': id },
        });
        task.agentId = agent.id; task.launchState = 'started'; task.stage = undefined; task.updatedAt = new Date().toISOString();
        await this.store.write(data);
        return { agentId: agent.id };
      } catch (error) {
        task.launchState = 'uncertain'; await this.store.write(data);
        throw new Error(`启动未确认：${error instanceof Error ? error.message : String(error)}。任务已保留，请检查 Paseo 会话后重试关联。`);
      }
    });
  }
}
