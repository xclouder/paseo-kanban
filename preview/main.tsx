import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PluginTheme } from '@getpaseo/plugin';
import { BoardView, type BoardApi } from '../src/board.client';
import { buildCards, defaultModeId, metadataSchema, snapshotSchema, taskSchema } from '../src/model.shared';
import { fixture } from './fixture';
import { applyProjectAction } from '../src/projects.shared';
import './style.css';

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
  read: async () => structuredClone({ ...data, modes: fixture().modes, fetchedAt: new Date().toISOString() }),
  patch: async ({ id, patch }) => { Object.assign(metadata(id), patch); persist(); },
  move: async ({ id, stage, beforeId }) => {
    const card = buildCards(data).find(c => c.id === id)!;
    if (stage === 'done' && card.agent && (['running', 'initializing'].includes(card.agent.status) || card.agent.pendingPermission)) throw new Error('会话仍在运行或等待授权，请处理后再标记完成。');
    if (stage === 'running' && !card.agent) throw new Error('请在任务详情中点击“开始执行”，启动 Agent。');
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
  create: async input => { const existing = Object.values(data.store.tasks).find(task => task.createRequestId === input.clientRequestId); if (existing) return existing; const now = new Date().toISOString(); const attachments = (input.attachments ?? []).map(({ dataBase64: _dataBase64, ...attachment }) => ({ ...attachment, type: 'uploaded_file' as const, path: `preview-attachment://${attachment.id}` })); const task = taskSchema.parse({ ...input, createRequestId: input.clientRequestId, attachments, id: `task:${crypto.randomUUID()}`, createdAt: now, updatedAt: now, stage: 'todo' }); data.store.tasks[task.id] = task; persist(); return task; },
  launch: async ({ id }) => {
    const task = data.store.tasks[id]; if (task.agentId) return { agentId: task.agentId };
    task.modeId ??= defaultModeId(data.modes.filter(mode => mode.provider === task.provider.split('/')[0]), task.provider.split('/')[0]);
    const agentId = crypto.randomUUID(); const now = new Date().toISOString();
    data.agents.push({ id: agentId, title: task.title, provider: task.provider.split('/')[0], workspaceId: task.workspaceId, cwd: '', status: 'running', createdAt: now, updatedAt: now, lastUserMessageAt: now, attentionReason: null, pendingPermission: false, archived: false, labels: {} });
    task.agentId = agentId; task.stage = undefined; persist(); return { agentId };
  },
  remove: async ({ id }) => { const task = data.store.tasks[id]; if (!task) throw new Error('任务不存在。'); if (task.agentId || task.launchState) throw new Error('只有从未执行过的任务可以删除。'); delete data.store.tasks[id]; persist(); },
};
const dark: PluginTheme = { colors: { surface0: '#101113', surface1: '#18191c', surface2: '#24262b', border: '#2b2d33', foreground: '#e9eaed', foregroundMuted: '#8a8e98', accent: '#b9a0f5', accentForeground: '#171020', statusSuccess: '#83b69b', statusWarning: '#d5b879', statusDanger: '#df9293' } };
const light: PluginTheme = { colors: { surface0: '#f7f7f9', surface1: '#ffffff', surface2: '#ededf2', border: '#ddddE4', foreground: '#24242c', foregroundMuted: '#737380', accent: '#7451bb', accentForeground: '#ffffff', statusSuccess: '#357451', statusWarning: '#946200', statusDanger: '#b03d4e' } };
const qc = new QueryClient();
function App() {
  const [compact, setCompact] = useState(innerWidth < 850);
  useEffect(() => { const resize = () => setCompact(innerWidth < 850); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  const theme = location.search.includes('light') ? light : dark;
  const navigation = useMemo(() => ({ openAgent: ({ agentId }: { agentId: string }) => { document.getElementById('preview-event')!.textContent = `预览：打开会话 ${agentId}`; }, openWorkspace: ({ workspaceId }: { workspaceId: string }) => { document.getElementById('preview-event')!.textContent = `预览：打开工作区 ${workspaceId}`; } }), []);
  return <QueryClientProvider client={qc}><BoardView theme={theme} host={{ id: 'preview', label: 'Damon 的工作站' }} layout={{ compact, platform: 'web' }} navigation={navigation} api={api} preview /><div id="preview-event" role="status" /></QueryClientProvider>;
}
createRoot(document.getElementById('root')!).render(<App />);
