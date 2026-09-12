import { z } from 'zod';

export const stages = ['todo', 'running', 'blocked', 'review', 'done'] as const;
export const stageNames: Record<Stage, string> = { todo: '待办', running: '执行中', blocked: '需关注', review: '待审核', done: '已完成' };
export type Stage = typeof stages[number];
export const priorityNames = { high: '高优先级', medium: '普通', low: '低优先级' };
export const metadataSchema = z.object({
  title: z.string().trim().max(180).optional(),
  description: z.string().max(20000).default(''),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  pinned: z.boolean().default(false),
  hidden: z.boolean().default(false),
  stage: z.enum(stages).optional(),
  stageTurn: z.string().nullable().optional(),
  order: z.number().finite().default(0),
});
export type Metadata = z.infer<typeof metadataSchema>;
export const taskAttachmentSchema = z.object({
  type: z.literal('uploaded_file'),
  id: z.string().uuid(),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(200),
  size: z.number().int().nonnegative(),
  path: z.string().min(1),
});
export type TaskAttachment = z.infer<typeof taskAttachmentSchema>;
export const taskSchema = metadataSchema.extend({
  id: z.string(), title: z.string().trim().min(1).max(180),
  workspaceId: z.string().min(1), provider: z.string().trim().min(1).max(200),
  modeId: z.string().trim().min(1).max(200).optional(),
  createRequestId: z.string().uuid().optional(),
  createdAt: z.string(), updatedAt: z.string(), agentId: z.string().optional(),
  launchState: z.enum(['starting', 'started', 'uncertain']).optional(),
  attachments: z.array(taskAttachmentSchema).default([]),
});
export type Task = z.infer<typeof taskSchema>;
export const storeSchema = z.object({
  version: z.literal(1),
  sessions: z.record(z.string(), metadataSchema),
  tasks: z.record(z.string(), taskSchema),
});
export type BoardStore = z.infer<typeof storeSchema>;
export const emptyStore = (): BoardStore => ({ version: 1, sessions: {}, tasks: {} });
export const agentSchema = z.object({
  id: z.string(), workspaceId: z.string().nullable(), title: z.string(),
  provider: z.string(), cwd: z.string(), status: z.string(),
  updatedAt: z.string(), createdAt: z.string(), lastUserMessageAt: z.string().nullable(),
  attentionReason: z.string().nullable(), pendingPermission: z.boolean(),
  archived: z.boolean(), labels: z.record(z.string(), z.string()),
});
export type Agent = z.infer<typeof agentSchema>;
export const workspaceSchema = z.object({ id: z.string(), name: z.string(), project: z.string(), projectId: z.string(), directory: z.string() });
export type Workspace = z.infer<typeof workspaceSchema>;
export const runModeSchema = z.object({ id: z.string(), label: z.string(), provider: z.string(), description: z.string().optional() });
export type RunMode = z.infer<typeof runModeSchema>;
export function defaultModeId(modes: readonly Pick<RunMode, 'id' | 'label'>[], provider?: string): string | undefined {
  const normalize = (value: string) => value.toLowerCase().replace(/[\s_-]/g, '');
  return modes.find(mode => normalize(mode.id) === 'fullaccess' || normalize(mode.label) === 'fullaccess' || (provider === 'claude' && mode.id === 'bypassPermissions'))?.id ?? modes[0]?.id;
}
export const snapshotSchema = z.object({
  store: storeSchema, agents: z.array(agentSchema), workspaces: z.array(workspaceSchema),
  providers: z.array(z.string()), models: z.array(z.object({ id: z.string(), label: z.string(), provider: z.string() })), providerError: z.string().optional(), fetchedAt: z.string(),
  modes: z.array(runModeSchema).default([]),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Card = Metadata & {
  id: string; title: string; stage: Stage; workspaceId: string | null;
  workspace: string; project: string; projectId: string; cwd: string;
  provider: string; updatedAt: string; agent?: Agent; task?: Task;
};

export function automaticStage(agent: Agent): Stage {
  if (agent.pendingPermission || agent.attentionReason === 'permission' || agent.status === 'error') return 'blocked';
  if (agent.status === 'running' || agent.status === 'initializing') return 'running';
  return 'review';
}

export function resolveStage(meta: Metadata, agent?: Agent): Stage {
  if (!agent) return meta.stage ?? 'todo';
  // Runtime blockers must never be hidden by an earlier manual move.
  const live = automaticStage(agent);
  if (live === 'blocked') return 'blocked';
  if (live === 'running') return 'running';
  // A new prompt invalidates the previous turn's manual decision, including Done.
  if (meta.stage && meta.stage !== 'running' && meta.stageTurn === agent.lastUserMessageAt) return meta.stage;
  return live;
}

export function buildCards(snapshot: Snapshot): Card[] {
  const workspaces = new Map(snapshot.workspaces.map(w => [w.id, w]));
  const agents = new Map(snapshot.agents.map(a => [a.id, a]));
  const linked = new Set(Object.values(snapshot.store.tasks).flatMap(t => t.agentId ? [t.agentId] : []));
  const cards: Card[] = [];
  function add(id: string, meta: Metadata, agent?: Agent, task?: Task) {
    const workspaceId = agent?.workspaceId ?? task?.workspaceId ?? null;
    const ws = workspaces.get(workspaceId ?? '');
    cards.push({ ...meta, id, title: meta.title || agent?.title || '未命名会话',
      stage: resolveStage(meta, agent), workspaceId,
      workspace: ws?.name ?? '工作区不可用', project: ws?.project ?? '其他项目',
      projectId: ws?.projectId ?? 'unknown', cwd: ws?.directory ?? agent?.cwd ?? '',
      provider: agent?.provider ?? task?.provider.split('/')[0] ?? '',
      updatedAt: agent?.updatedAt ?? task?.updatedAt ?? '', agent, task });
  }
  for (const task of Object.values(snapshot.store.tasks)) add(task.id, task, task.agentId ? agents.get(task.agentId) : undefined, task);
  for (const agent of snapshot.agents) {
    if (!linked.has(agent.id) && !agent.archived) add(`agent:${agent.id}`, metadataSchema.parse(snapshot.store.sessions[agent.id] ?? {}), agent);
  }
  return cards;
}

export interface Filters { query: string; projectId: string; workspaceId?: string; provider: string; pinned: boolean; attention: boolean; hidden: boolean }
export function filterCards(cards: Card[], filters: Filters): Card[] {
  const words = filters.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const rank = { high: 0, medium: 1, low: 2 };
  return cards.filter(card => {
    if (card.hidden !== filters.hidden || (filters.projectId && card.projectId !== filters.projectId)) return false;
    if (filters.workspaceId && card.workspaceId !== filters.workspaceId) return false;
    if (filters.provider && card.provider !== filters.provider) return false;
    if (filters.pinned && !card.pinned) return false;
    if (filters.attention && card.stage !== 'blocked' && card.stage !== 'review') return false;
    const text = [card.title, card.description, card.cwd, card.workspace, card.project, card.provider, card.id, card.agent?.id, ...card.tags].join(' ').toLocaleLowerCase();
    return words.every(word => text.includes(word));
  }).sort((a, b) => Number(b.pinned) - Number(a.pinned) || rank[a.priority] - rank[b.priority] || a.order - b.order || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}

export function relativeTime(value: string, now = Date.now()): string {
  const delta = Math.max(0, now - new Date(value).getTime());
  if (!Number.isFinite(delta)) return '';
  if (delta < 60000) return '刚刚';
  if (delta < 3600000) return `${Math.floor(delta / 60000)} 分钟前`;
  if (delta < 86400000) return `${Math.floor(delta / 3600000)} 小时前`;
  return `${Math.floor(delta / 86400000)} 天前`;
}
