import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PluginTheme } from '@getpaseo/plugin';
import { BoardView, type BoardApi } from '../client/board';
import { agentIsRunning, buildCards, defaultModeId, defaultThinkingOptionId, metadataSchema, snapshotSchema, taskSchema } from '../shared/model';
import { fixture } from './fixture';
import { applyProjectAction } from '../shared/projects';
import './style.css';
import { installQuickInbox } from '../client/quick-inbox';

const key = 'paseo-kanban-preview-v1';
const initial = () => { try { const raw = localStorage.getItem(key); return raw ? snapshotSchema.parse(JSON.parse(raw)) : fixture(); } catch { return fixture(); } };
let data = initial();
const persist = () => localStorage.setItem(key, JSON.stringify(data));
function metadata(id: string) {
  if (id.startsWith('agent:')) { const aid = id.slice(6); data.store.sessions[aid] ??= metadataSchema.parse({}); return data.store.sessions[aid]; }
  if (!data.store.tasks[id]) throw new Error('任务不存在');
  return data.store.tasks[id];
}
const api: BoardApi = {
  organize: async action => {
    const next = structuredClone(data);
    applyProjectAction(next.store.projectLayout, action, [...new Map(next.workspaces.map(workspace => [workspace.projectId, { id: workspace.projectId, name: workspace.project }])).values()]);
    localStorage.setItem(key, JSON.stringify(next));
    data = next;
  },
  read: async () => { const catalog = fixture(); return structuredClone({ ...data, models: catalog.models, modes: catalog.modes, fetchedAt: new Date().toISOString() }); },
  createProject: async ({ projectName }) => {
    if (data.workspaces.some(workspace => workspace.project === projectName)) throw new Error('项目目录已存在。');
    const baseDirectory = data.store.settings.projectBaseDirectory;
    const workspace = { id: `workspace-${crypto.randomUUID()}`, name: projectName, project: projectName, projectId: `project-${crypto.randomUUID()}`, directory: `${baseDirectory.replace(/[\\/]$/, '')}\\${projectName}` };
    data.workspaces.push(workspace); persist(); return workspace;
  },
  patch: async ({ id, patch }) => {
    const task = data.store.tasks[id];
    const { workspaceId, attachmentAdditions = [], ...metadataPatch } = patch;
    if ((workspaceId !== undefined || attachmentAdditions.length) && !task) throw new Error('只有看板新建的任务可以修改工作区或附件。');
    if ((workspaceId !== undefined || attachmentAdditions.length) && (task.agentId || task.launchState)) throw new Error('任务开始执行后不能修改工作区或附件。');
    if (workspaceId !== undefined && !data.workspaces.some(workspace => workspace.id === workspaceId)) throw new Error('工作区已不存在，请重新选择。');
    Object.assign(metadata(id), metadataPatch);
    if (task) {
      if (workspaceId !== undefined) task.workspaceId = workspaceId;
      task.attachments.push(...attachmentAdditions.map(({ dataBase64: _dataBase64, ...attachment }) => ({ ...attachment, type: 'uploaded_file' as const, path: `preview-attachment://${attachment.id}` })));
      task.updatedAt = new Date().toISOString();
    }
    persist();
  },
  move: async ({ id, stage, beforeId }) => {
    if (location.search.includes('move-delay')) await new Promise(resolve => setTimeout(resolve, 500));
    const card = buildCards(data).find(c => c.id === id)!;
    if (stage === 'done' && card.agent && (agentIsRunning(card.agent) || card.agent.pendingPermission)) throw new Error('会话仍在运行或等待授权，请处理后再标记完成。');
    if (stage === 'running' && !card.agent) throw new Error('请在任务详情中点击“开始执行”，启动 Agent。');
    if (stage !== 'running' && card.agent && agentIsRunning(card.agent)) throw new Error('Agent 仍在执行，结束后会自动进入待审核。');
    Object.assign(metadata(id), { stage, stageTurn: card.agent?.lastUserMessageAt ?? null });
    const ids = buildCards(data).filter(c => c.stage === stage && c.id !== id).sort((a, b) => a.order - b.order).map(c => c.id);
    const at = beforeId ? ids.indexOf(beforeId) : -1; ids.splice(at < 0 ? ids.length : at, 0, id);
    ids.forEach((cid, i) => { metadata(cid).order = i + 1; }); persist();
  },
  completeReview: async ({ ids }) => {
    const cards = buildCards(data);
    const targets = [...new Set(ids)].map(id => cards.find(card => card.id === id));
    if (targets.some(card => !card || card.stage !== 'review')) throw new Error('部分任务已不在待审核状态，请刷新看板后重试。');
    const lastOrder = Math.max(0, ...cards.map(card => card.order));
    targets.forEach((card, index) => Object.assign(metadata(card!.id), { stage: 'done', stageTurn: card!.agent?.lastUserMessageAt ?? null, order: lastOrder + index + 1 }));
    persist();
    return { ok: true, count: targets.length };
  },
  hideDone: async ({ ids }) => {
    const cards = buildCards(data);
    const targets = [...new Set(ids)].map(id => cards.find(card => card.id === id));
    if (targets.some(card => !card || card.hidden || card.stage !== 'done')) throw new Error('部分任务已不在已完成状态，请刷新看板后重试。');
    targets.forEach(card => { metadata(card!.id).hidden = true; });
    persist();
    return { ok: true, count: targets.length };
  },
  create: async input => { const existing = Object.values(data.store.tasks).find(task => task.createRequestId === input.clientRequestId); if (existing) return existing; const inboxEntry = input.inboxId ? data.store.inbox[input.inboxId] : undefined; if (input.inboxId && !inboxEntry) throw new Error('Inbox 条目已不存在，请刷新后重试。'); const now = new Date().toISOString(); const attachments = [...(inboxEntry?.attachments ?? []), ...(input.attachments ?? []).map(({ dataBase64: _dataBase64, ...attachment }) => ({ ...attachment, type: 'uploaded_file' as const, path: `preview-attachment://${attachment.id}` }))]; const task = taskSchema.parse({ ...input, createRequestId: input.clientRequestId, attachments, id: `task:${crypto.randomUUID()}`, createdAt: now, updatedAt: now, stage: 'todo' }); data.store.tasks[task.id] = task; if (input.inboxId) delete data.store.inbox[input.inboxId]; persist(); return task; },
  patchInbox: async ({ id, expectedTitle, title }) => { const entry = data.store.inbox[id]; if (!entry) throw new Error('Inbox 条目不存在，请刷新后重试。'); if (entry.title !== expectedTitle) throw new Error('Inbox 条目已在其他位置修改，请刷新后再保存。'); entry.title = title; persist(); return entry; },
  removeInbox: async ({ id }) => { if (!data.store.inbox[id]) throw new Error('Inbox 条目不存在，请刷新后重试。'); delete data.store.inbox[id]; persist(); },
  launch: async ({ id, confirmedWorkspaceId }) => {
    if (location.search.includes('launch-error')) throw new Error('Agent 启动失败，请稍后重试。');
    const task = data.store.tasks[id]; if (task.agentId) return { status: 'started', agentId: task.agentId };
    const runningAgents = data.agents.filter(agent => agent.workspaceId === task.workspaceId && agentIsRunning(agent)).map(agent => ({ id: agent.id, title: agent.title }));
    if (runningAgents.length && confirmedWorkspaceId !== task.workspaceId) {
      const workspace = data.workspaces.find(item => item.id === task.workspaceId)!;
      return { status: 'confirmation_required', workspace: { id: workspace.id, name: workspace.name, project: workspace.project }, runningAgents };
    }
    task.modeId ??= defaultModeId(data.modes.filter(mode => mode.provider === task.provider.split('/')[0]), task.provider.split('/')[0]);
    const model = data.models.find(model => model.id === task.provider);
    task.thinkingOptionId ??= defaultThinkingOptionId(model?.thinkingOptions ?? [], model?.defaultThinkingOptionId);
    const agentId = crypto.randomUUID(); const now = new Date().toISOString();
    data.agents.push({ id: agentId, title: task.title, provider: task.provider.split('/')[0], workspaceId: task.workspaceId, cwd: '', status: 'running', activeTurn: true, createdAt: now, updatedAt: now, lastUserMessageAt: now, attentionReason: null, pendingPermission: false, archived: false, labels: {} });
    task.agentId = agentId; task.stage = undefined; persist(); return { status: 'started', agentId };
  },
  remove: async ({ id }) => { const task = data.store.tasks[id]; if (!task) throw new Error('任务不存在。'); if (task.agentId || task.launchState) throw new Error('只有从未执行过的任务可以删除。'); delete data.store.tasks[id]; persist(); },
};
const dark: PluginTheme = { colors: { surface0: '#101113', surface1: '#18191c', surface2: '#24262b', border: '#2b2d33', foreground: '#e9eaed', foregroundMuted: '#8a8e98', accent: '#b9a0f5', accentForeground: '#171020', statusSuccess: '#83b69b', statusWarning: '#d5b879', statusDanger: '#df9293' } };
const light: PluginTheme = { colors: { surface0: '#f7f7f9', surface1: '#ffffff', surface2: '#ededf2', border: '#ddddE4', foreground: '#24242c', foregroundMuted: '#737380', accent: '#7451bb', accentForeground: '#ffffff', statusSuccess: '#357451', statusWarning: '#946200', statusDanger: '#b03d4e' } };
const paseoDark: PluginTheme = { colors: { surface0: '#181b1a', surface1: '#1e2120', surface2: '#272a29', border: '#252b2a', foreground: '#fafafa', foregroundMuted: '#a1a5a4', accent: '#20744a', accentForeground: '#ffffff', statusSuccess: '#83b69b', statusWarning: '#d5b879', statusDanger: '#d8847b' } };
const qc = new QueryClient();
function App() {
  const [compact, setCompact] = useState(innerWidth < 850);
  const [hostSidebarVisible, setHostSidebarVisible] = useState(!location.search.includes('sidebar=hidden'));
  const [hostSidebarMounted, setHostSidebarMounted] = useState(!location.search.includes('sidebar=late'));
  useEffect(() => { const resize = () => setCompact(innerWidth < 850); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  useEffect(() => {
    if (hostSidebarMounted) return;
    const timer = setTimeout(() => setHostSidebarMounted(true), 100);
    return () => clearTimeout(timer);
  }, [hostSidebarMounted]);
  useEffect(() => {
    const toggleSidebar = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.code === 'Period') setHostSidebarVisible(value => !value);
    };
    document.addEventListener('keydown', toggleSidebar);
    return () => document.removeEventListener('keydown', toggleSidebar);
  }, []);
  useEffect(() => installQuickInbox(async input => {
    data.store.inbox[input.clientRequestId] ??= { id: input.clientRequestId, title: input.title, attachments: (input.attachments ?? []).map(({ dataBase64: _dataBase64, ...attachment }) => ({ ...attachment, type: 'uploaded_file' as const, path: `preview-inbox-attachment://${attachment.id}` })), createdAt: new Date().toISOString() };
    persist();
    await qc.invalidateQueries({ queryKey: ['paseo-kanban', 'preview'] });
  }), []);
  const hostOnly = location.search.includes('no-board');
  const theme = hostOnly ? paseoDark : location.search.includes('light') ? light : dark;
  const stackedBoard = location.search.includes('stacked-board');
  const scopedWorkspaceId = location.search.includes('workspace-board') ? 'workspace-web' : undefined;
  const hostToggleWorks = !location.search.includes('sidebar-button=broken');
  const navigation = useMemo(() => ({ openAgent: ({ agentId }: { agentId: string }) => { document.getElementById('preview-event')!.textContent = `预览：打开会话 ${agentId}`; }, openWorkspace: ({ workspaceId }: { workspaceId: string }) => { document.getElementById('preview-event')!.textContent = `预览：打开工作区 ${workspaceId}`; } }), []);
  const board = <BoardView theme={theme} host={{ id: 'preview', label: 'Damon 的工作站' }} layout={{ compact, platform: 'web' }} navigation={navigation} workspaceId={scopedWorkspaceId} api={api} preview />;
  if (hostOnly) return <QueryClientProvider client={qc}><main data-testid="host-only" style={{ boxSizing: 'border-box', minHeight: '100vh', padding: 48, background: theme.colors.surface0, color: theme.colors.foreground }}><section data-testid="host-card" style={{ maxWidth: 640, margin: '18vh auto', padding: 24, border: `1px solid ${theme.colors.border}`, borderRadius: 12, background: theme.colors.surface1 }}><h1 style={{ marginTop: 0 }}>Paseo</h1><p style={{ color: theme.colors.foregroundMuted }}>Global shortcut host surface without mounting the board.</p><button data-testid="host-primary" type="button" style={{ padding: '9px 14px', border: 0, borderRadius: 7, background: theme.colors.accent, color: theme.colors.accentForeground }}>Primary action</button></section></main></QueryClientProvider>;
  return <QueryClientProvider client={qc}><button id="menu-button" data-testid="menu-button" type="button" aria-hidden tabIndex={-1} onClick={() => { if (hostToggleWorks) setHostSidebarVisible(value => !value); }} style={{ display: 'none' }} />{hostSidebarMounted && <div data-testid="left-sidebar-resize-handle" style={{ display: hostSidebarVisible ? 'block' : 'none', position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />}{stackedBoard && <div style={{ display: 'none' }}>{board}</div>}{board}<div id="preview-event" role="status" /></QueryClientProvider>;
}
createRoot(document.getElementById('root')!).render(<App />);
