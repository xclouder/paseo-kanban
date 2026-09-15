import { createElement, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { PluginTheme } from '@getpaseo/plugin';
import type { PluginSurfaceProps, PluginWorkspacePanelProps } from '@getpaseo/plugin/client';
import { useRpc } from '@getpaseo/plugin/client';
import { Icon } from '@getpaseo/plugin/client/react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { completeReviewCards, createTask, deleteInboxEntry, deleteTask, launchTask, MAX_ATTACHMENT_FILES, MAX_ATTACHMENT_SIZE, MAX_ATTACHMENT_TOTAL_SIZE, moveCard, patchCard, readBoard, type CompleteReviewInput, type CreateAttachmentInput, type CreateInput, type MoveInput, type PatchInput } from '../shared/contracts';
import { agentIsRunning, buildCards, defaultModeId, defaultThinkingOptionId, filterCards, priorityNames, relativeTime, stageNames, stages, type Card, type InboxEntry, type Snapshot, type Stage, type Task, type TaskAttachment, type Workspace } from '../shared/model';
import { organizeProjects } from '../shared/contracts';
import type { ProjectAction } from '../shared/projects';
import { ProjectSidebar } from './project-sidebar';
import { INBOX_CHANGED_EVENT, QUICK_INBOX_MODAL_TEST_ID, setQuickInboxPalette } from './quick-inbox';
import { BOARD_KEYBOARD_SCOPE_TEST_ID_PREFIX, isActiveBoardKeyboardScope } from './board-shortcut';

export interface BoardApi {
  organize(action: ProjectAction): Promise<unknown>;
  read(): Promise<Snapshot>;
  patch(input: PatchInput): Promise<unknown>;
  move(input: MoveInput): Promise<unknown>;
  completeReview(input: CompleteReviewInput): Promise<{ ok: boolean; count: number }>;
  create(input: CreateInput): Promise<Task>;
  removeInbox(input: { id: string }): Promise<unknown>;
  launch(input: { id: string }): Promise<{ agentId: string }>;
  remove(input: { id: string }): Promise<unknown>;
}

export function KanbanSurface(props: PluginSurfaceProps) {
  return <ConnectedBoard key={props.host.id} {...props} />;
}
export function KanbanWorkspace(props: PluginWorkspacePanelProps) {
  return <ConnectedBoard key={`${props.host.id}:${props.workspaceId}`} {...props} workspaceId={props.workspaceId} />;
}
function ConnectedBoard(props: PluginSurfaceProps & { workspaceId?: string }) {
  const organize = useRpc(organizeProjects);
  const read = useRpc(readBoard), patch = useRpc(patchCard), move = useRpc(moveCard), completeReview = useRpc(completeReviewCards), create = useRpc(createTask), removeInbox = useRpc(deleteInboxEntry), launch = useRpc(launchTask), remove = useRpc(deleteTask);
  const api = useMemo<BoardApi>(() => ({ read: () => read({}), patch, move, completeReview, create, removeInbox, launch, remove, organize }), [read, patch, move, completeReview, create, removeInbox, launch, remove, organize]);
  return <BoardView {...props} api={api} />;
}

type Colors = PluginTheme['colors'];
const SIDEBAR_MIN_WIDTH = 176;
const SIDEBAR_MAX_WIDTH = 420;
const SIDEBAR_DEFAULT_WIDTH = 210;
const row = { flexDirection: 'row', alignItems: 'center' } as const;
const wrap = { ...row, flexWrap: 'wrap', gap: 8 } as const;
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
const stageIcons: Record<Stage, string> = { todo: 'CircleDashed', running: 'CirclePlay', blocked: 'CircleAlert', review: 'CircleDot', done: 'CircleCheck' };
function stageColor(stage: Stage, c: Colors) { return stage === 'done' ? c.statusSuccess : stage === 'blocked' ? c.statusDanger : stage === 'review' ? c.statusWarning : stage === 'running' ? c.accent : c.foregroundMuted; }

function Button({ children, icon, onPress, c, primary, active, disabled, label, small, radio }: { children?: ReactNode; icon?: string; onPress(): void; c: Colors; primary?: boolean; active?: boolean; disabled?: boolean; label?: string; small?: boolean; radio?: boolean }) {
  const color = primary ? c.accentForeground : active ? c.accent : c.foreground;
  return <Pressable accessibilityRole={radio ? 'radio' : 'button'} accessibilityLabel={label} accessibilityState={{ disabled: Boolean(disabled), selected: Boolean(active), checked: radio ? Boolean(active) : undefined }} aria-checked={radio ? Boolean(active) : undefined} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ ...row, gap: 7, justifyContent: 'center', minHeight: small ? 30 : 36, paddingHorizontal: children ? 11 : 9, paddingVertical: 6, borderRadius: 7, borderWidth: 1, borderColor: primary ? c.accent : active ? c.accent : c.border, backgroundColor: primary ? c.accent : active ? c.surface2 : c.surface1, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 })}>
    {icon && <Icon name={icon} size={small ? 14 : 16} color={color} />}
    {children && <Text style={{ color, fontSize: small ? 11 : 12, fontWeight: '600' }}>{children}</Text>}
  </Pressable>;
}
function Label({ children, c }: { children: ReactNode; c: Colors }) { return <Text style={{ color: c.foregroundMuted, fontSize: 11, fontWeight: '600', marginBottom: 8 }}>{children}</Text>; }

const PASEO_SIDEBAR_RESIZE_HANDLE_ID = 'left-sidebar-resize-handle';
const PASEO_SIDEBAR_TOGGLE_ID = 'menu-button';
const PASEO_SURFACE_CLOSE_TEST_ID = 'plugin-surface-close';
const PASEO_SURFACE_RETURN_ATTRIBUTE = 'data-paseo-kanban-return';
const PASEO_SURFACE_RETURN_SOURCE_ATTRIBUTE = 'data-paseo-kanban-return-source';
const PASEO_SURFACE_RETURN_STYLE_ID = 'paseo-kanban-surface-return-style';
const PASEO_SURFACE_RETURN_TEST_ID = 'paseo-kanban-surface-return';
function paseoSidebarResizeHandle() {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>(`[data-testid="${PASEO_SIDEBAR_RESIZE_HANDLE_ID}"]`)
    ?? document.getElementById(PASEO_SIDEBAR_RESIZE_HANDLE_ID);
}
function paseoSidebarToggle() {
  if (typeof document === 'undefined') return null;
  return document.getElementById(PASEO_SIDEBAR_TOGGLE_ID)
    ?? document.querySelector<HTMLElement>(`[data-testid="${PASEO_SIDEBAR_TOGGLE_ID}"]`);
}
function paseoSidebarShortcut() {
  if (typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform)) {
    return { hint: '⌘B', event: { key: 'b', code: 'KeyB', metaKey: true } satisfies KeyboardEventInit };
  }
  return { hint: 'Ctrl+.', event: { key: '.', code: 'Period', ctrlKey: true } satisfies KeyboardEventInit };
}
function paseoSidebarIsVisible() {
  const resizeHandle = paseoSidebarResizeHandle();
  return Boolean(resizeHandle?.getClientRects().length);
}
function dispatchPaseoSidebarShortcut() {
  if (typeof document === 'undefined') return false;
  const init: KeyboardEventInit = { ...paseoSidebarShortcut().event, bubbles: true, cancelable: true };
  document.body.dispatchEvent(new KeyboardEvent('keydown', init));
  document.body.dispatchEvent(new KeyboardEvent('keyup', init));
  return true;
}
function waitForHostUpdate() {
  return new Promise<void>(resolve => {
    if (typeof requestAnimationFrame === 'undefined') resolve();
    else requestAnimationFrame(() => resolve());
  });
}
async function setPaseoSidebarVisibility(visible: boolean) {
  if (typeof document === 'undefined' || paseoSidebarIsVisible() === visible) return paseoSidebarIsVisible();
  const hostToggle = paseoSidebarToggle();
  if (hostToggle instanceof HTMLElement) {
    hostToggle.click();
    await waitForHostUpdate();
    if (paseoSidebarIsVisible() === visible) return visible;
  }
  if (dispatchPaseoSidebarShortcut()) await waitForHostUpdate();
  return paseoSidebarIsVisible();
}

function customizePaseoSurfaceReturn(color: string) {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  const sourceSelector = `[data-testid="${PASEO_SURFACE_CLOSE_TEST_ID}"]`;
  const returnSelector = `[data-testid="${PASEO_SURFACE_RETURN_TEST_ID}"]`;
  const style = document.createElement('style');
  style.id = PASEO_SURFACE_RETURN_STYLE_ID;
  style.textContent = `
    ${sourceSelector}[${PASEO_SURFACE_RETURN_SOURCE_ATTRIBUTE}] {
      display: none !important;
    }
    ${returnSelector}[${PASEO_SURFACE_RETURN_ATTRIBUTE}] {
      width: auto !important;
      min-width: 106px !important;
      padding-inline: 12px !important;
      column-gap: 7px !important;
      color: ${color} !important;
      font-size: 12px;
      font-weight: 500;
      line-height: 1;
      white-space: nowrap;
    }
    ${returnSelector}[${PASEO_SURFACE_RETURN_ATTRIBUTE}]::before {
      content: "";
      width: 16px;
      height: 16px;
      flex: 0 0 16px;
      background-color: currentColor;
      -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M19 12H5M12 19l-7-7 7-7' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / contain no-repeat;
      mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M19 12H5M12 19l-7-7 7-7' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / contain no-repeat;
    }
  `;
  document.getElementById(PASEO_SURFACE_RETURN_STYLE_ID)?.remove();
  document.head.appendChild(style);

  let source: HTMLElement | null = null;
  let returnButton: HTMLElement | null = null;
  const forwardReturn = () => source?.click();
  const forwardReturnKeyDown = (event: KeyboardEvent) => {
    if (returnButton instanceof HTMLButtonElement) return;
    if (event.key === ' ') event.preventDefault();
    if (event.key === 'Enter' && !event.repeat) { event.preventDefault(); forwardReturn(); }
  };
  const forwardReturnKeyUp = (event: KeyboardEvent) => {
    if (returnButton instanceof HTMLButtonElement || event.key !== ' ') return;
    event.preventDefault();
    forwardReturn();
  };
  const restore = () => {
    source?.removeAttribute(PASEO_SURFACE_RETURN_SOURCE_ATTRIBUTE);
    returnButton?.removeEventListener('click', forwardReturn);
    returnButton?.removeEventListener('keydown', forwardReturnKeyDown);
    returnButton?.removeEventListener('keyup', forwardReturnKeyUp);
    returnButton?.remove();
    returnButton = null;
  };
  const sync = () => {
    const next = document.querySelector<HTMLElement>(sourceSelector);
    if (next !== source) {
      restore();
      source = next;
    }
    if (!source?.parentElement) return;
    source.setAttribute(PASEO_SURFACE_RETURN_SOURCE_ATTRIBUTE, '');
    if (!returnButton?.isConnected) {
      returnButton = source.cloneNode(false) as HTMLElement;
      returnButton.removeAttribute('id');
      returnButton.removeAttribute('aria-describedby');
      returnButton.removeAttribute(PASEO_SURFACE_RETURN_SOURCE_ATTRIBUTE);
      returnButton.setAttribute('data-testid', PASEO_SURFACE_RETURN_TEST_ID);
      returnButton.setAttribute('aria-label', '返回 Paseo 主界面');
      returnButton.setAttribute('title', '返回 Paseo 主界面');
      returnButton.setAttribute(PASEO_SURFACE_RETURN_ATTRIBUTE, '');
      returnButton.textContent = '返回 Paseo';
      returnButton.addEventListener('click', forwardReturn);
      returnButton.addEventListener('keydown', forwardReturnKeyDown);
      returnButton.addEventListener('keyup', forwardReturnKeyUp);
      source.parentElement.insertBefore(returnButton, source.nextSibling);
    }
  };
  const observer = new MutationObserver(sync);
  observer.observe(document.body, { childList: true, subtree: true });
  sync();
  return () => {
    observer.disconnect();
    restore();
    style.remove();
  };
}

function DragItem({ id, enabled, children, onDrag }: { id: string; enabled: boolean; children: ReactNode; onDrag(id: string | null): void }) {
  if (!enabled) return <View>{children}</View>;
  return createElement('div', { draggable: true, style: { minWidth: 0, width: '100%' }, onDragStart: (event: React.DragEvent) => { event.dataTransfer.setData('application/x-paseo-kanban', id); event.dataTransfer.effectAllowed = 'move'; onDrag(id); }, onDragEnd: () => onDrag(null) }, children);
}
function DropZone({ enabled, onDrop, children, item = false }: { enabled: boolean; onDrop(id: string): void; children: ReactNode; item?: boolean }) {
  if (!enabled) return <View style={item ? { flexShrink: 0 } : { flex: 1 }}>{children}</View>;
  return createElement('div', { style: { display: 'flex', flexDirection: 'column', width: '100%', flex: item ? '0 0 auto' : '1 1 0%', minHeight: item ? undefined : 100 }, onDragOver: (event: React.DragEvent) => { if (event.dataTransfer.types.includes('application/x-paseo-kanban')) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }, onDrop: (event: React.DragEvent) => { const id = event.dataTransfer.getData('application/x-paseo-kanban'); if (id) { event.preventDefault(); event.stopPropagation(); onDrop(id); } } }, children);
}

export function BoardView({ theme, host, layout, navigation, workspaceId, api, preview = false }: PluginSurfaceProps & { workspaceId?: string; api: BoardApi; preview?: boolean }) {
  const c = theme.colors;
  const queryClient = useQueryClient();
  const queryKey = ['paseo-kanban', host.id];
  const board = useQuery({ queryKey, queryFn: () => api.read(), refetchInterval: 5000, retry: 1 });
  const [query, setQuery] = useState('');
  const [project, setProject] = useState('');
  const [provider, setProvider] = useState('');
  const [pinned, setPinned] = useState(false);
  const [attention, setAttention] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [inboxView, setInboxView] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createSource, setCreateSource] = useState<{ id: string; title: string } | null>(null);
  const [createDirty, setCreateDirty] = useState(false);
  const [confirmingCreateClose, setConfirmingCreateClose] = useState(false);
  const [createCloseBlocked, setCreateCloseBlocked] = useState(false);
  const keyboardScopeTestId = useRef(`${BOARD_KEYBOARD_SCOPE_TEST_ID_PREFIX}${clientUuid()}`).current;
  const [paseoSidebarVisible, setPaseoSidebarVisible] = useState(false);
  const creatingRef = useRef(creating), createDirtyRef = useRef(createDirty), confirmingCreateCloseRef = useRef(confirmingCreateClose);
  creatingRef.current = creating; createDirtyRef.current = createDirty; confirmingCreateCloseRef.current = confirmingCreateClose;
  const handledCreateEscapeRef = useRef(false);
  const createCloseBlockedRef = useRef(createCloseBlocked);
  createCloseBlockedRef.current = createCloseBlocked;
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [defaultModel, setDefaultModel] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const search = useRef<TextInput>(null);
  const mutation = useMutation({ mutationFn: (run: () => Promise<unknown>) => run(), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey }); }, onError: error => setMessage({ text: errorText(error), error: true }) });
  const mutationPendingRef = useRef(mutation.isPending);
  mutationPendingRef.current = mutation.isPending;
  const busy = mutation.isPending || !board.data || board.isError;
  const run = async (action: () => Promise<unknown>, success?: string) => {
    if (busy) return false;
    try { await mutation.mutateAsync(action); if (success) setMessage({ text: success, error: false }); return true; } catch { return false; }
  };
  const changeCreateDirty = (dirty: boolean) => { createDirtyRef.current = dirty; setCreateDirty(dirty); };
  const hideCreateConfirmation = () => { confirmingCreateCloseRef.current = false; setConfirmingCreateClose(false); };
  const changeCreateCloseBlocked = (blocked: boolean) => { createCloseBlockedRef.current = blocked; setCreateCloseBlocked(blocked); };
  const openCreate = (source?: { id: string; title: string }) => { setCreateSource(source ?? null); changeCreateDirty(false); changeCreateCloseBlocked(false); hideCreateConfirmation(); creatingRef.current = true; setCreating(true); };
  const requestCreateClose = () => {
    if (mutationPendingRef.current || createCloseBlockedRef.current) return;
    if (createDirtyRef.current) { confirmingCreateCloseRef.current = true; setConfirmingCreateClose(true); }
    else { creatingRef.current = false; setCreating(false); setCreateSource(null); }
  };
  const discardCreate = () => { changeCreateDirty(false); hideCreateConfirmation(); creatingRef.current = false; setCreating(false); setCreateSource(null); };
  useEffect(() => {
    if (!message || message.error) return;
    const timer = setTimeout(() => setMessage(null), 3500);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    if (layout.platform !== 'web') return;
    setQuickInboxPalette({
      surface0: c.surface0, surface1: c.surface1, surface2: c.surface2, border: c.border,
      foreground: c.foreground, foregroundMuted: c.foregroundMuted, accent: c.accent,
      accentForeground: c.accentForeground, statusDanger: c.statusDanger,
    });
  }, [c.accent, c.accentForeground, c.border, c.foreground, c.foregroundMuted, c.statusDanger, c.surface0, c.surface1, c.surface2, layout.platform]);
  useEffect(() => {
    if (layout.platform !== 'web' || typeof window === 'undefined') return;
    const onKey = (event: KeyboardEvent) => {
      if (!isActiveBoardKeyboardScope(keyboardScopeTestId)) return;
      if (document.querySelector(`[data-testid="${QUICK_INBOX_MODAL_TEST_ID}"]`)) return;
      if (event.key === 'Escape' && event.type === 'keyup' && handledCreateEscapeRef.current) {
        event.preventDefault(); event.stopImmediatePropagation(); handledCreateEscapeRef.current = false;
        return;
      }
      if (event.key === 'Escape' && document.querySelector('[data-testid="workspace-subpanel"]')) return;
      if (event.key === 'Escape' && creatingRef.current) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (event.type === 'keyup' || event.repeat) return;
        handledCreateEscapeRef.current = true;
        if (confirmingCreateCloseRef.current) hideCreateConfirmation();
        else requestCreateClose();
        return;
      }
      if (creatingRef.current) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, [contenteditable="true"]') || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === '/') { event.preventDefault(); event.stopImmediatePropagation(); search.current?.focus(); }
      if (event.key.toLowerCase() === 'n') { event.preventDefault(); event.stopImmediatePropagation(); openCreate(); }
      if (event.key === 'Escape' && selected) { event.stopImmediatePropagation(); setSelected(null); }
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKey, true); };
  }, [keyboardScopeTestId, layout.platform, selected]);
  useEffect(() => {
    if (layout.platform !== 'web' || typeof document === 'undefined') return;
    const refreshInbox = () => { void board.refetch(); };
    document.addEventListener(INBOX_CHANGED_EVENT, refreshInbox);
    return () => document.removeEventListener(INBOX_CHANGED_EVENT, refreshInbox);
  }, [board.refetch, layout.platform]);
  useEffect(() => {
    if (layout.platform !== 'web' || typeof window === 'undefined') return;
    const savedWidth = Number(window.localStorage.getItem(`paseo-kanban:sidebar-width:${host.id}`));
    if (Number.isFinite(savedWidth) && savedWidth >= SIDEBAR_MIN_WIDTH && savedWidth <= SIDEBAR_MAX_WIDTH) setSidebarWidth(savedWidth);
    setDefaultModel(window.localStorage.getItem(`paseo-kanban:default-model:${host.id}`) ?? '');
  }, [host.id, layout.platform]);
  const showPaseoSidebarToggle = layout.platform === 'web' && !layout.compact && !workspaceId;
  const showPaseoSurfaceReturn = layout.platform === 'web' && !workspaceId;
  useEffect(() => {
    if (!showPaseoSurfaceReturn) return;
    return customizePaseoSurfaceReturn(c.foregroundMuted);
  }, [c.foregroundMuted, showPaseoSurfaceReturn]);
  useEffect(() => {
    if (!showPaseoSidebarToggle || typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    let syncFrame = 0;
    let autoHidePending = true;
    let stopped = false;
    let visibilityObserver: MutationObserver | undefined;
    let discoveryObserver: MutationObserver;
    function watchVisibility(handle: HTMLElement) {
      if (visibilityObserver) return;
      visibilityObserver = new MutationObserver(sync);
      for (let element: HTMLElement | null = handle; element && element !== document.body; element = element.parentElement) {
        visibilityObserver.observe(element, { attributes: true });
      }
      discoveryObserver.disconnect();
    }
    function sync() {
      cancelAnimationFrame(syncFrame);
      syncFrame = requestAnimationFrame(() => {
        const handle = paseoSidebarResizeHandle();
        const mounted = handle instanceof HTMLElement;
        if (handle instanceof HTMLElement) watchVisibility(handle);
        const visible = paseoSidebarIsVisible();
        if (autoHidePending && mounted) {
          autoHidePending = false;
          void setPaseoSidebarVisibility(false).then(actual => { if (!stopped) setPaseoSidebarVisible(actual); });
          return;
        }
        if (!autoHidePending) setPaseoSidebarVisible(visible);
      });
    }
    discoveryObserver = new MutationObserver(sync);
    discoveryObserver.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => {
      stopped = true;
      cancelAnimationFrame(syncFrame);
      discoveryObserver.disconnect();
      visibilityObserver?.disconnect();
    };
  }, [showPaseoSidebarToggle]);
  const onTogglePaseoSidebar = () => {
    void setPaseoSidebarVisibility(!paseoSidebarIsVisible()).then(setPaseoSidebarVisible);
  };
  const paseoSidebarShortcutHint = paseoSidebarShortcut().hint;
  const saveDefaultModel = (model: string) => {
    setDefaultModel(model);
    if (layout.platform === 'web' && typeof window !== 'undefined') window.localStorage.setItem(`paseo-kanban:default-model:${host.id}`, model);
  };
  const resizeSidebar = (event: React.PointerEvent) => {
    if (layout.platform !== 'web' || typeof window === 'undefined') return;
    event.preventDefault();
    const startX = event.clientX, startWidth = sidebarWidth;
    const move = (next: PointerEvent) => setSidebarWidth(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, startWidth + next.clientX - startX)));
    const up = (next: PointerEvent) => {
      const width = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, startWidth + next.clientX - startX));
      setSidebarWidth(width); window.localStorage.setItem(`paseo-kanban:sidebar-width:${host.id}`, String(width));
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const all = useMemo(() => board.data ? buildCards(board.data) : [], [board.data]);
  const scope = all.filter(card => !workspaceId || card.workspaceId === workspaceId);
  const visible = filterCards(all, { query, projectId: project, workspaceId, provider, pinned, attention, hidden });
  const active = all.find(card => card.id === selected);
  const projects = [...new Map((board.data?.workspaces ?? []).filter(w => !workspaceId || w.id === workspaceId).map(w => [w.projectId, { id: w.projectId, name: w.project }])).values()];
  const count = (id?: string) => scope.filter(card => !card.hidden && (!id || card.projectId === id)).length;
  const move = (id: string, stage: Stage, beforeId?: string) => { setDragging(null); void run(() => api.move({ id, stage, beforeId }), `已移至${stageNames[stage]}`); };
  const completeReview = (ids: string[]) => { void run(() => api.completeReview({ ids }), `已将 ${ids.length} 个待审核任务标记为完成`); };
  const reset = () => { setInboxView(false); setQuery(''); setProject(''); setProvider(''); setPinned(false); setAttention(false); setHidden(false); };

  const sidebarItem = (text: string, icon: string, selectedItem: boolean, onPress: () => void, amount?: number) => <Pressable key={text} accessibilityRole="button" onPress={onPress} style={{ ...row, gap: 9, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 7, backgroundColor: selectedItem ? c.surface2 : 'transparent' }}>
    <Icon name={icon} size={15} color={selectedItem ? c.foreground : c.foregroundMuted} />
    <Text numberOfLines={1} style={{ color: selectedItem ? c.foreground : c.foregroundMuted, flex: 1, fontSize: 12, fontWeight: selectedItem ? '600' : '400' }}>{text}</Text>
    {amount !== undefined && <Text style={{ color: c.foregroundMuted, fontSize: 11 }}>{amount}</Text>}
  </Pressable>;

  const detail = active && <Detail key={active.id} card={active} snapshot={board.data!} c={c} busy={busy} web={layout.platform === 'web'} pasteEnabled={!creating} navigation={navigation} close={() => setSelected(null)}
    move={stage => move(active.id, stage)}
    save={patch => run(() => api.patch({ id: active.id, patch }), '已保存')}
    launch={() => run(async () => { const result = await api.launch({ id: active.id }); navigation?.openAgent({ agentId: result.agentId }); }, '任务已交给 Agent')}
    remove={() => run(() => api.remove({ id: active.id }), '任务已删除')}
  />;

  return <View testID={keyboardScopeTestId} style={{ flex: 1, backgroundColor: c.surface0, minHeight: 0 }}>
    {preview && <View style={{ ...row, backgroundColor: c.surface2, justifyContent: 'center', padding: 8, gap: 8 }}><Icon name="FlaskConical" size={13} color={c.statusWarning} /><Text style={{ color: c.foregroundMuted, fontSize: 11 }}>交互预览 · 使用示例数据，不会操作真实 Paseo 会话</Text></View>}
    <View style={{ flex: 1, flexDirection: 'row', minHeight: 0 }}>
      {!layout.compact && !workspaceId && <View testID="board-sidebar" style={{ width: sidebarWidth, position: 'relative', borderRightWidth: 1, borderRightColor: c.border, padding: 16, paddingTop: 24 }}>
        <View style={{ ...row, gap: 10, paddingHorizontal: 8, marginBottom: 30 }}><Icon name="PanelsTopLeft" size={23} color={c.accent} /><Text style={{ color: c.foreground, fontSize: 18, fontWeight: '700', letterSpacing: -0.6 }}>paseo<Text style={{ color: c.foregroundMuted, fontWeight: '400' }}> / board</Text></Text></View>
        <Label c={c}>工作台</Label>
        {sidebarItem('Inbox', 'Inbox', inboxView, () => { reset(); setInboxView(true); }, Object.keys(board.data?.store.inbox ?? {}).length)}
        {sidebarItem('全部任务', 'LayoutGrid', !inboxView && !project && !pinned && !attention && !hidden, reset, count())}
        {sidebarItem('需要我处理', 'Inbox', attention, () => { reset(); setAttention(true); }, scope.filter(x => !x.hidden && ['blocked', 'review'].includes(x.stage)).length)}
        {sidebarItem('已置顶', 'Pin', pinned, () => { reset(); setPinned(true); }, scope.filter(x => !x.hidden && x.pinned).length)}
        <View style={{ height: 28 }} />
        <ScrollView style={{ flex: 1 }}>
          {board.data && <ProjectSidebar c={c} projects={projects} layout={board.data.store.projectLayout} selected={project} busy={busy} web={layout.platform === 'web'} select={id => { reset(); setProject(id); }} count={id => count(id)} organize={action => run(() => api.organize(action))} />}
        </ScrollView>
        {sidebarItem('已收起', 'Archive', hidden, () => { reset(); setHidden(true); }, scope.filter(x => x.hidden).length)}
        <View style={{ marginTop: 18, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 18, ...row, gap: 8 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: board.isError ? c.statusDanger : c.statusSuccess }} />
          <Text numberOfLines={1} style={{ flex: 1, color: c.foregroundMuted, fontSize: 11 }}>{host.label}</Text>
          <Text style={{ color: c.foregroundMuted, fontSize: 10 }}>本机存储</Text>
        </View>
        {layout.platform === 'web' && createElement('div', { 'data-testid': 'sidebar-resizer', role: 'separator', 'aria-label': '调整左侧栏宽度', 'aria-orientation': 'vertical', onPointerDown: resizeSidebar, style: { position: 'absolute', top: 0, right: -4, bottom: 0, width: 8, cursor: 'col-resize', touchAction: 'none', zIndex: 2 } })}
      </View>}
      <View style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <View style={{ paddingHorizontal: layout.compact ? 16 : 28, paddingTop: 25, paddingBottom: 19, borderBottomWidth: 1, borderBottomColor: c.border, gap: 18 }}>
          <View style={{ ...row, justifyContent: 'space-between', gap: 12 }}>
            {showPaseoSidebarToggle && createElement('div', { title: `切换侧边栏（${paseoSidebarShortcutHint}）`, style: { display: 'flex' } },
              <Pressable accessibilityRole="button" accessibilityLabel={`${paseoSidebarVisible ? '隐藏' : '显示'} Paseo 主侧栏`} accessibilityHint={paseoSidebarShortcutHint} accessibilityState={{ expanded: paseoSidebarVisible }} aria-expanded={paseoSidebarVisible} onPress={onTogglePaseoSidebar}
                style={({ pressed }) => ({ ...row, justifyContent: 'center', width: 36, height: 36, borderRadius: 7, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface1, opacity: pressed ? 0.7 : 1 })}>
                <Icon name="PanelLeft" size={17} color={c.foregroundMuted} />
              </Pressable>)}
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.foregroundMuted, fontSize: 11, marginBottom: 9 }}>工作台 / {workspaceId ? '工作区看板' : '任务看板'}</Text>
              <View style={{ ...row, gap: 12 }}><Text accessibilityRole="header" style={{ color: c.foreground, fontSize: layout.compact ? 24 : 28, fontWeight: '700', letterSpacing: -0.8 }}>{inboxView ? 'Inbox' : hidden ? '已收起的任务' : pinned ? '置顶任务' : attention ? '需要我处理' : projects.find(p => p.id === project)?.name ?? '所有任务，一目了然'}</Text><Text style={{ color: c.foregroundMuted, fontSize: 12 }}>{inboxView ? Object.keys(board.data?.store.inbox ?? {}).length : visible.length}</Text></View>
              {!layout.compact && <Text style={{ color: c.foregroundMuted, fontSize: 12, marginTop: 8 }}>{inboxView ? '快速收集想法，准备好后再补全信息并创建任务。' : '从想法到交付，把每一段会话放回工作流。'}</Text>}
            </View>
            <Button c={c} icon={inboxView ? 'LayoutGrid' : 'Inbox'} active={inboxView} onPress={() => { if (inboxView) reset(); else { reset(); setInboxView(true); } }}>{inboxView ? '返回看板' : 'Inbox'}</Button>
            <Button c={c} primary icon="Plus" onPress={() => openCreate()} disabled={busy}>新建任务</Button>
          </View>
          {!inboxView && <View style={{ ...wrap, gap: 10 }}>
            <View style={{ ...row, flexGrow: 1, flexShrink: 1, minWidth: 190, maxWidth: 400, gap: 9, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface1, borderRadius: 7, paddingHorizontal: 11 }}>
              <Icon name="Search" size={15} color={c.foregroundMuted} />
              <TextInput ref={search} accessibilityLabel="搜索任务" placeholder="搜索任务、标签、工作区或会话 ID…" placeholderTextColor={c.foregroundMuted} value={query} onChangeText={setQuery} style={{ flex: 1, color: c.foreground, fontSize: 12, height: 36, minWidth: 0 }} />
              {query ? <Pressable accessibilityLabel="清除搜索" accessibilityRole="button" onPress={() => setQuery('')}><Icon name="X" size={14} color={c.foregroundMuted} /></Pressable> : <Text style={{ color: c.foregroundMuted, fontSize: 11 }}>/</Text>}
            </View>
            <Button c={c} icon="Pin" active={pinned} onPress={() => setPinned(!pinned)}>置顶</Button>
            <Button c={c} icon="CircleAlert" active={attention} onPress={() => setAttention(!attention)}>需处理</Button>
            <Button c={c} icon="Archive" active={hidden} onPress={() => setHidden(!hidden)} label={hidden ? '返回活动任务' : '查看已收起任务'} />
            <View style={{ flex: 1 }} />
            {mutation.isPending ? <ActivityIndicator size="small" color={c.accent} /> : <Text style={{ color: c.foregroundMuted, fontSize: 10 }}>{board.isFetching ? '同步中' : '每 5 秒同步'}</Text>}
            <Button c={c} icon="RefreshCw" label="刷新看板" onPress={() => void board.refetch()} disabled={board.isFetching} />
          </View>}
          {!inboxView && (layout.compact || provider || (board.data?.providers.length ?? 0) > 1) && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ ...row, gap: 7 }}>
            <Text style={{ color: c.foregroundMuted, fontSize: 11, marginRight: 4 }}>Agent</Text>
            <Button c={c} small active={!provider} onPress={() => setProvider('')}>全部</Button>
            {[...new Set([...(board.data?.providers ?? []), ...all.map(card => card.provider)])].filter(Boolean).map(p => <Button key={p} c={c} small active={provider === p} onPress={() => setProvider(p)}>{p}</Button>)}
            {layout.compact && projects.map(p => <Button key={p.id} c={c} small active={project === p.id} onPress={() => setProject(project === p.id ? '' : p.id)}>{p.name}</Button>)}
          </ScrollView>}
        </View>
        {(board.isError || message) && <View accessibilityRole="alert" style={{ ...row, gap: 9, padding: 12, backgroundColor: c.surface2 }}>
          <Icon name={board.isError || message?.error ? 'CircleAlert' : 'Check'} size={16} color={board.isError || message?.error ? c.statusDanger : c.statusSuccess} />
          <Text style={{ flex: 1, color: board.isError || message?.error ? c.statusDanger : c.foreground, fontSize: 12 }}>{board.isError ? `同步失败，操作已暂停。${errorText(board.error)}` : message?.text}</Text>
          <Button c={c} small onPress={() => board.isError ? void board.refetch() : setMessage(null)}>{board.isError ? '重试' : '关闭'}</Button>
        </View>}
        {board.isPending ? <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}><ActivityIndicator color={c.accent} /><Text style={{ color: c.foregroundMuted }}>正在整理你的会话…</Text></View> : inboxView ? <InboxPanel c={c} entries={Object.values(board.data?.store.inbox ?? {})} busy={busy} createTask={entry => openCreate(entry)} remove={id => run(() => api.removeInbox({ id }), 'Inbox 条目已删除')} /> : <View style={{ flex: 1, minHeight: 0, flexDirection: 'row' }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {visible.length === 0 && <View style={{ padding: 16, ...row, gap: 12 }}><Icon name="Search" size={17} color={c.foregroundMuted} /><Text style={{ color: c.foregroundMuted, fontSize: 12, flex: 1 }}>{all.length ? '没有符合条件的任务。试试清除筛选，或查看已收起任务。' : '还没有会话。新建一个任务，或在 Paseo 中打开会话后刷新。'}</Text>{all.length > 0 && <Button c={c} small onPress={reset}>清除筛选</Button>}</View>}
            <ScrollView horizontal style={{ flex: 1 }} contentContainerStyle={{ padding: layout.compact ? 12 : 24, gap: 15, flexGrow: 1 }} showsHorizontalScrollIndicator>
              {stages.map(stage => {
                const cards = visible.filter(card => card.stage === stage);
                return <View key={stage} testID={`column-${stage}`} style={{ width: layout.compact ? 280 : 268, flexGrow: 1, minHeight: 200 }}>
                  <View style={{ ...row, gap: 8, marginBottom: 17, paddingHorizontal: 3 }}><Icon name={stageIcons[stage]} size={16} color={stageColor(stage, c)} /><Text style={{ color: c.foreground, fontSize: 12, fontWeight: '600' }}>{stageNames[stage]}</Text><Text style={{ color: c.foregroundMuted, fontSize: 11, marginLeft: 4 }}>{cards.length}</Text><View style={{ flex: 1 }} />{stage === 'review' && cards.length > 0 && <Button c={c} small icon="CheckCheck" label={`完成当前筛选的 ${cards.length} 个待审核任务`} disabled={busy} onPress={() => completeReview(cards.map(card => card.id))}>完成当前 {cards.length} 项</Button>}{stage === 'todo' && <Pressable accessibilityRole="button" accessibilityLabel="添加待办" disabled={busy} onPress={() => openCreate()}><Icon name="Plus" size={16} color={c.foregroundMuted} /></Pressable>}</View>
                  <DropZone enabled={layout.platform === 'web' && !busy} onDrop={id => move(id, stage)}>
                    <ScrollView style={{ flex: 1, borderRadius: 9, backgroundColor: c.surface0, borderWidth: dragging ? 1 : 0, borderColor: c.border }} contentContainerStyle={{ gap: 10, paddingBottom: 32, minHeight: 150 }}>
                      {cards.map(card => <DropZone key={card.id} item enabled={layout.platform === 'web' && !busy} onDrop={id => { if (id !== card.id) move(id, stage, card.id); }}>
                        <DragItem id={card.id} enabled={layout.platform === 'web' && !busy} onDrag={setDragging}>
                          <TaskCard card={card} c={c} selected={selected === card.id} busy={busy} onSelect={() => setSelected(card.id)} onPin={() => void run(() => api.patch({ id: card.id, patch: { pinned: !card.pinned } }))} />
                        </DragItem>
                      </DropZone>)}
                      {cards.length === 0 && <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, borderRadius: 9, minHeight: 112, alignItems: 'center', justifyContent: 'center', gap: 8 }}><Icon name={stageIcons[stage]} size={20} color={c.foregroundMuted} /><Text style={{ color: c.foregroundMuted, fontSize: 11 }}>{dragging ? '松开以移动到这里' : stage === 'todo' ? '下一个想法，从这里开始' : '暂无任务'}</Text></View>}
                    </ScrollView>
                  </DropZone>
                </View>;
              })}
            </ScrollView>
            {!layout.compact && <View style={{ ...row, paddingHorizontal: 26, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.border, gap: 8 }}><Icon name="GripVertical" size={13} color={c.foregroundMuted} /><Text style={{ color: c.foregroundMuted, fontSize: 10 }}>拖动卡片调整进度 · 点击查看详情 · / 搜索 · N 新建</Text><View style={{ flex: 1 }} /><Text style={{ color: c.foregroundMuted, fontSize: 10 }}>完成由你确认</Text></View>}
          </View>
          {!layout.compact && detail && <View style={{ width: 350, borderLeftWidth: 1, borderLeftColor: c.border, backgroundColor: c.surface1 }}>{detail}</View>}
        </View>}
      </View>
    </View>
    {layout.compact && <Modal visible={Boolean(active)} animationType="slide" onRequestClose={() => setSelected(null)}><View style={{ flex: 1, backgroundColor: c.surface1, paddingTop: 28 }}>{detail}</View></Modal>}
    <Modal visible={creating} transparent animationType="fade" onRequestClose={requestCreateClose}>
      <View style={{ flex: 1, backgroundColor: c.surface0, alignItems: 'center', justifyContent: 'center', padding: layout.compact ? 12 : 28 }}>
        <View style={{ width: '100%', maxWidth: 560, maxHeight: '95%', backgroundColor: c.surface1, borderWidth: 1, borderColor: c.border, borderRadius: 14, overflow: 'hidden' }}>
          {creating && <CreateForm c={c} snapshot={board.data} workspaceId={workspaceId} projectId={project} web={layout.platform === 'web'} shortcutEnabled={!confirmingCreateClose} busy={busy} defaultModel={defaultModel} initialTitle={createSource?.title} inboxId={createSource?.id} setDefaultModel={saveDefaultModel} onDirtyChange={changeCreateDirty} onCloseBlockedChange={changeCreateCloseBlocked} close={requestCreateClose} create={async input => { let task: Task | undefined; const ok = await run(async () => { task = await api.create(input); }); if (ok && task) { reset(); changeCreateDirty(false); changeCreateCloseBlocked(false); setCreateSource(null); setSelected(task.id); creatingRef.current = false; setCreating(false); } return ok; }} />}
        </View>
      </View>
    </Modal>
    <Modal visible={confirmingCreateClose} transparent animationType="fade" onRequestClose={hideCreateConfirmation}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.58)', alignItems: 'center', justifyContent: 'center', padding: 20 }}><View accessibilityRole="alert" style={{ width: '100%', maxWidth: 390, backgroundColor: c.surface1, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 22 }}><View style={{ ...row, gap: 9, marginBottom: 10 }}><Icon name="CircleAlert" size={18} color={c.statusWarning} /><Text style={{ flex: 1, color: c.foreground, fontSize: 16, fontWeight: '600' }}>放弃未保存的修改？</Text></View><Text style={{ color: c.foregroundMuted, fontSize: 12, lineHeight: 19, marginBottom: 20 }}>任务内容和已添加的附件将会丢失。</Text><View style={{ ...row, justifyContent: 'flex-end', gap: 9 }}><Button c={c} onPress={discardCreate}>放弃修改</Button><Button c={c} primary onPress={hideCreateConfirmation}>继续编辑</Button></View></View></View>
    </Modal>
  </View>;
}

function InboxPanel({ c, entries, busy, createTask, remove }: { c: Colors; entries: InboxEntry[]; busy: boolean; createTask(entry: InboxEntry): void; remove(id: string): Promise<boolean> }) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const sorted = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  return <ScrollView testID="inbox-panel" style={{ flex: 1 }} contentContainerStyle={{ width: '100%', maxWidth: 820, alignSelf: 'center', padding: 24, gap: 10 }}>
    {!sorted.length ? <View style={{ minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, borderRadius: 12 }}>
      <Icon name="Inbox" size={28} color={c.foregroundMuted} />
      <Text style={{ color: c.foreground, fontSize: 14, fontWeight: '600' }}>Inbox 还是空的</Text>
      <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>在 Paseo 任意位置按 Ctrl+Shift+I 快速记下一项。</Text>
    </View> : sorted.map(entry => <View key={entry.id} testID={`inbox-entry-${entry.id}`} style={{ ...row, gap: 14, padding: 15, borderWidth: 1, borderColor: c.border, borderRadius: 10, backgroundColor: c.surface1 }}>
      <View style={{ width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface2 }}><Icon name="Inbox" size={16} color={c.accent} /></View>
      <View style={{ flex: 1, minWidth: 0 }}><Text style={{ color: c.foreground, fontSize: 13, fontWeight: '600', lineHeight: 20 }}>{entry.title}</Text><Text style={{ color: c.foregroundMuted, fontSize: 10, marginTop: 4 }}>{relativeTime(entry.createdAt)}</Text></View>
      <Button c={c} small primary icon="Plus" disabled={busy} onPress={() => createTask(entry)}>创建任务</Button>
      <Button c={c} small icon="Trash2" disabled={busy} label={confirmDelete === entry.id ? `确认删除 Inbox 条目 ${entry.title}` : `删除 Inbox 条目 ${entry.title}`} onPress={() => {
        if (confirmDelete !== entry.id) { setConfirmDelete(entry.id); return; }
        void remove(entry.id).then(ok => { if (ok) setConfirmDelete(null); });
      }}>{confirmDelete === entry.id ? '确认删除' : undefined}</Button>
    </View>)}
  </ScrollView>;
}

function TaskCard({ card, c, selected, busy, onSelect, onPin }: { card: Card; c: Colors; selected: boolean; busy: boolean; onSelect(): void; onPin(): void }) {
  const runtime = card.agent?.pendingPermission ? '等待授权' : card.agent?.status === 'error' ? '执行出错' : card.agent && agentIsRunning(card.agent) ? (card.agent.status === 'initializing' ? '正在启动' : '正在执行') : card.agent ? '会话空闲' : '尚未启动';
  return <View testID={`card-${card.id}`} style={{ borderWidth: 1, borderColor: selected ? c.accent : c.border, borderRadius: 9, backgroundColor: c.surface1, overflow: 'hidden' }}>
    <View style={{ ...row, paddingHorizontal: 13, paddingTop: 11, gap: 7 }}><Text numberOfLines={1} style={{ color: c.foregroundMuted, fontSize: 10, flex: 1 }}>{card.project} <Text style={{ color: c.foregroundMuted }}> / {card.workspace}</Text></Text><Pressable accessibilityRole="button" accessibilityLabel={`${card.pinned ? '取消置顶' : '置顶'} ${card.title}`} disabled={busy} onPress={onPin} style={{ padding: 4 }}><Icon name="Pin" size={12} color={card.pinned ? c.accent : c.foregroundMuted} /></Pressable></View>
    <Pressable accessibilityRole="button" accessibilityLabel={`查看任务 ${card.title}`} onPress={onSelect} style={({ pressed }) => ({ paddingHorizontal: 14, paddingTop: 7, paddingBottom: 14, opacity: pressed ? 0.7 : 1 })}>
      <Text numberOfLines={3} style={{ color: c.foreground, fontSize: 13, lineHeight: 21, fontWeight: '600', marginBottom: 8 }}>{card.title}</Text>
      {card.description ? <Text numberOfLines={2} style={{ color: c.foregroundMuted, fontSize: 11, lineHeight: 18, marginBottom: 12 }}>{card.description}</Text> : null}
      {card.tags.length > 0 && <View style={{ ...wrap, gap: 5, marginBottom: 12 }}>{card.tags.slice(0, 3).map(tag => <Text key={tag} style={{ color: c.foregroundMuted, fontSize: 10, backgroundColor: c.surface2, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3 }}>{tag}</Text>)}{card.tags.length > 3 && <Text style={{ color: c.foregroundMuted, fontSize: 10 }}>+{card.tags.length - 3}</Text>}</View>}
      {(card.task?.attachments.length ?? 0) > 0 && <View style={{ ...row, gap: 5, marginBottom: 11 }}><Icon name="Paperclip" size={12} color={c.foregroundMuted} /><Text style={{ color: c.foregroundMuted, fontSize: 10 }}>{card.task!.attachments.length} 个附件</Text></View>}
      <View style={{ ...row, gap: 6, marginBottom: 13 }}><View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: card.agent && agentIsRunning(card.agent) ? c.accent : card.stage === 'blocked' ? c.statusDanger : c.foregroundMuted }} /><Text style={{ color: card.stage === 'blocked' ? c.statusDanger : c.foregroundMuted, fontSize: 10 }}>{runtime}</Text></View>
      <View style={{ ...row, gap: 6, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 11 }}><Icon name="Bot" size={13} color={c.foregroundMuted} /><Text numberOfLines={1} style={{ color: c.foregroundMuted, fontSize: 10, maxWidth: 85 }}>{card.provider}</Text><View style={{ flex: 1 }} />{card.priority === 'high' && <Icon name="SignalHigh" size={13} color={c.statusWarning} />}<Text style={{ color: c.foregroundMuted, fontSize: 10 }}>{relativeTime(card.updatedAt)}</Text></View>
    </Pressable>
  </View>;
}

function Input({ c, label, value, onChangeText, multiline, placeholder }: { c: Colors; label: string; value: string; onChangeText(text: string): void; multiline?: boolean; placeholder?: string }) {
  return <View style={{ marginBottom: 18 }}><Label c={c}>{label}</Label><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.foregroundMuted} multiline={multiline} style={{ color: c.foreground, borderColor: c.border, backgroundColor: c.surface0, borderWidth: 1, borderRadius: 7, fontSize: 12, lineHeight: 20, padding: 11, minHeight: multiline ? 130 : 40, textAlignVertical: multiline ? 'top' : 'center' }} /></View>;
}
const parseTags = (text: string) => [...new Set(text.split(/[,，]/).map(t => t.trim()).filter(Boolean))];
const formatBytes = (size: number) => size < 1024 ? `${size} B` : size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;

function WorkspacePicker({ c, workspaces, value, disabled, onChange }: { c: Colors; workspaces: Workspace[]; value: string; disabled?: boolean; onChange(id: string): void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = workspaces.find(workspace => workspace.id === value);
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const filtered = workspaces.filter(workspace => words.every(word => [workspace.project, workspace.name, workspace.directory, workspace.id].join(' ').toLocaleLowerCase().includes(word)));
  const close = () => { setOpen(false); setQuery(''); };
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`选择工作区，当前 ${selected ? `${selected.project} / ${selected.name}` : '未选择'}`} accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled || !workspaces.length} onPress={() => setOpen(true)} style={({ pressed }) => ({ ...row, gap: 10, minHeight: 50, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 18, borderRadius: 8, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface0, opacity: disabled ? 0.65 : pressed ? 0.75 : 1 })}>
      <Icon name="FolderOpen" size={16} color={c.foregroundMuted} />
      <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: selected ? c.foreground : c.statusWarning, fontSize: 12, fontWeight: '600' }}>{selected ? `${selected.project} / ${selected.name}` : '请选择工作区'}</Text>{selected && <Text numberOfLines={1} style={{ color: c.foregroundMuted, fontSize: 10, marginTop: 4 }}>{selected.directory}</Text>}</View>
      {!disabled && workspaces.length > 0 && <Icon name="ChevronRight" size={15} color={c.foregroundMuted} />}
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <View testID="workspace-subpanel" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
        <View accessibilityLabel="选择工作区" style={{ width: '100%', maxWidth: 520, maxHeight: '82%', backgroundColor: c.surface1, borderWidth: 1, borderColor: c.border, borderRadius: 12, overflow: 'hidden' }}>
          <View style={{ ...row, gap: 9, padding: 18, borderBottomWidth: 1, borderBottomColor: c.border }}><Icon name="FolderOpen" size={17} color={c.accent} /><Text accessibilityRole="header" style={{ flex: 1, color: c.foreground, fontSize: 16, fontWeight: '600' }}>选择工作区</Text><Button c={c} small icon="X" label="关闭工作区选择" onPress={close} /></View>
          <View style={{ ...row, gap: 8, margin: 14, marginBottom: 7, paddingHorizontal: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface0, borderRadius: 7 }}><Icon name="Search" size={14} color={c.foregroundMuted} /><TextInput accessibilityLabel="搜索工作区" autoFocus value={query} onChangeText={setQuery} placeholder="按项目、工作区或路径搜索…" placeholderTextColor={c.foregroundMuted} style={{ flex: 1, color: c.foreground, fontSize: 12, height: 40 }} />{query ? <Pressable accessibilityRole="button" accessibilityLabel="清除工作区搜索" onPress={() => setQuery('')}><Icon name="X" size={14} color={c.foregroundMuted} /></Pressable> : null}</View>
          <ScrollView contentContainerStyle={{ padding: 14, paddingTop: 7, gap: 7 }}>
            {filtered.map(workspace => <Pressable key={workspace.id} accessibilityRole="button" accessibilityLabel={`选择工作区 ${workspace.project} / ${workspace.name}`} accessibilityState={{ selected: workspace.id === value }} onPress={() => { onChange(workspace.id); close(); }} style={({ pressed }) => ({ ...row, gap: 10, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: workspace.id === value ? c.accent : c.border, backgroundColor: workspace.id === value ? c.surface2 : c.surface0, opacity: pressed ? 0.75 : 1 })}>
              <Icon name={workspace.id === value ? 'CircleCheck' : 'FolderGit2'} size={15} color={workspace.id === value ? c.accent : c.foregroundMuted} /><View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: c.foreground, fontSize: 12, fontWeight: '600' }}>{workspace.project} / {workspace.name}</Text><Text numberOfLines={1} style={{ color: c.foregroundMuted, fontSize: 10, marginTop: 4 }}>{workspace.directory}</Text></View>
            </Pressable>)}
            {filtered.length === 0 && <Text style={{ color: c.foregroundMuted, fontSize: 12, padding: 16, textAlign: 'center' }}>没有匹配的工作区</Text>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}

const clientUuid = () => globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, token => {
  const value = Math.floor(Math.random() * 16);
  return (token === 'x' ? value : (value & 0x3) | 0x8).toString(16);
});
function readAttachment(file: File): Promise<CreateAttachmentInput> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`无法读取附件 ${file.name}。`));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      if (comma < 0) { reject(new Error(`无法读取附件 ${file.name}。`)); return; }
      resolve({ id: clientUuid(), fileName: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, dataBase64: result.slice(comma + 1) });
    };
    reader.readAsDataURL(file);
  });
}

function AttachmentPicker({ c, attachments, disabled, pasteEnabled = true, existingCount = 0, existingSize = 0, onChange, onError, onReadingChange }: { c: Colors; attachments: CreateAttachmentInput[]; disabled: boolean; pasteEnabled?: boolean; existingCount?: number; existingSize?: number; onChange(value: CreateAttachmentInput[]): void; onError(message: string): void; onReadingChange(reading: boolean): void }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const addFiles = async (files: File[]) => {
    if (disabled || reading || !files.length) return;
    if (existingCount + attachments.length + files.length > MAX_ATTACHMENT_FILES) { onError(`最多添加 ${MAX_ATTACHMENT_FILES} 个附件。`); return; }
    const invalidName = files.find(file => !file.name.trim() || file.name.length > 255);
    if (invalidName) { onError('附件文件名不能为空且不能超过 255 个字符。'); return; }
    const oversized = files.find(file => file.size > MAX_ATTACHMENT_SIZE);
    if (oversized) { onError(`${oversized.name} 超过 20 MB，无法添加。`); return; }
    const total = existingSize + attachments.reduce((sum, attachment) => sum + attachment.size, 0) + files.reduce((sum, file) => sum + file.size, 0);
    if (total > MAX_ATTACHMENT_TOTAL_SIZE) { onError('附件总大小不能超过 50 MB。'); return; }
    setReading(true); onReadingChange(true); onError('');
    try { onChange([...attachments, ...await Promise.all(files.map(readAttachment))]); }
    catch (error) { onError(errorText(error)); }
    finally { setReading(false); onReadingChange(false); }
  };
  useEffect(() => {
    if (!pasteEnabled || typeof window === 'undefined') return;
    const paste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (!files.length) return;
      event.preventDefault();
      void addFiles(files);
    };
    window.addEventListener('paste', paste);
    return () => window.removeEventListener('paste', paste);
  });
  return createElement('div', {
    'data-testid': 'attachment-dropzone',
    style: { border: `1px dashed ${dragging ? c.accent : c.border}`, borderRadius: 8, background: dragging ? c.surface2 : c.surface0, padding: 14, marginBottom: 18 },
    onDragEnter: (event: React.DragEvent) => { if (!disabled && event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragging(true); } },
    onDragOver: (event: React.DragEvent) => { if (!disabled && event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDragging(true); } },
    onDragLeave: (event: React.DragEvent) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); },
    onDrop: (event: React.DragEvent) => { if (!disabled && event.dataTransfer.files.length) { event.preventDefault(); event.stopPropagation(); setDragging(false); void addFiles(Array.from(event.dataTransfer.files)); } },
  },
  createElement('input', { ref: input, type: 'file', multiple: true, disabled: disabled || reading, style: { display: 'none' }, onChange: (event: React.ChangeEvent<HTMLInputElement>) => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void addFiles(files); } }),
  <View style={{ ...row, gap: 10 }}><Icon name="Paperclip" size={17} color={dragging ? c.accent : c.foregroundMuted} /><View style={{ flex: 1 }}><Text style={{ color: c.foreground, fontSize: 12, fontWeight: '600' }}>{reading ? '正在读取附件…' : dragging ? '松开即可添加' : '拖拽或粘贴图片、文件到这里'}</Text><Text style={{ color: c.foregroundMuted, fontSize: 10, marginTop: 4 }}>支持 Ctrl/⌘ + V · 最多 10 个，单个 20 MB，总计 50 MB</Text></View><Button c={c} small disabled={disabled || reading} onPress={() => input.current?.click()}>选择文件</Button></View>,
  attachments.length > 0 && <View style={{ gap: 7, marginTop: 12 }}>{attachments.map(attachment => <View key={attachment.id} style={{ ...row, gap: 8, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8 }}><Icon name="File" size={14} color={c.foregroundMuted} /><Text numberOfLines={1} style={{ flex: 1, color: c.foreground, fontSize: 11 }}>{attachment.fileName}</Text><Text style={{ color: c.foregroundMuted, fontSize: 10 }}>{formatBytes(attachment.size)}</Text><Button c={c} small icon="X" label={`移除附件 ${attachment.fileName}`} disabled={disabled || reading} onPress={() => onChange(attachments.filter(item => item.id !== attachment.id))} /></View>)}</View>);
}

function StoredAttachments({ c, attachments }: { c: Colors; attachments: TaskAttachment[] }) {
  return <View testID="task-attachments" style={{ gap: 7, marginBottom: 10 }}>{attachments.map(attachment => <View key={attachment.id} style={{ ...row, gap: 9, padding: 10, borderWidth: 1, borderColor: c.border, borderRadius: 7, backgroundColor: c.surface0 }}><Icon name={attachment.mimeType.startsWith('image/') ? 'Image' : 'File'} size={15} color={c.foregroundMuted} /><View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: c.foreground, fontSize: 11, fontWeight: '600' }}>{attachment.fileName}</Text><Text style={{ color: c.foregroundMuted, fontSize: 10, marginTop: 3 }}>{attachment.mimeType.startsWith('image/') ? '图片' : '文件'} · {formatBytes(attachment.size)}</Text></View><Text style={{ color: c.statusSuccess, fontSize: 10 }}>已上传</Text></View>)}</View>;
}

function Detail({ card, snapshot, c, busy, web, pasteEnabled, navigation, close, move, save, launch, remove }: { card: Card; snapshot: Snapshot; c: Colors; busy: boolean; web: boolean; pasteEnabled: boolean; navigation: PluginSurfaceProps['navigation']; close(): void; move(stage: Stage): void; save(patch: PatchInput['patch']): Promise<boolean>; launch(): Promise<boolean>; remove(): Promise<boolean> }) {
  const [title, setTitle] = useState(card.title), [description, setDescription] = useState(card.description), [tags, setTags] = useState(card.tags.join(', '));
  const [priority, setPriority] = useState(card.priority);
  const [workspace, setWorkspace] = useState(card.workspaceId ?? '');
  const [attachmentAdditions, setAttachmentAdditions] = useState<CreateAttachmentInput[]>([]);
  const [readingAttachments, setReadingAttachments] = useState(false);
  const [formError, setFormError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canEditDraft = Boolean(card.task && !card.task.agentId && !card.task.launchState);
  const draftChanged = canEditDraft && (workspace !== card.workspaceId || attachmentAdditions.length > 0);
  const dirty = title !== card.title || description !== card.description || tags !== card.tags.join(', ') || priority !== card.priority || draftChanged;
  const selectedWorkspace = snapshot.workspaces.find(item => item.id === workspace);
  const workspaceAvailable = Boolean(selectedWorkspace);
  const savedWorkspaceAvailable = snapshot.workspaces.some(item => item.id === card.workspaceId);
  const existingAttachmentSize = card.task?.attachments.reduce((sum, attachment) => sum + attachment.size, 0) ?? 0;
  const taskModeId = card.task?.modeId ?? defaultModeId(snapshot.modes.filter(mode => mode.provider === card.provider), card.provider);
  const taskModel = snapshot.models.find(model => model.id === card.task?.provider);
  const taskWasStarted = Boolean(card.task?.agentId || card.task?.launchState);
  const taskThinkingOptionId = card.task?.thinkingOptionId ?? (taskWasStarted ? undefined : defaultThinkingOptionId(taskModel?.thinkingOptions ?? [], taskModel?.defaultThinkingOptionId));
  return <>
    <View style={{ ...row, padding: 18, borderBottomWidth: 1, borderBottomColor: c.border, gap: 8 }}><Icon name="PanelRight" size={16} color={c.foregroundMuted} /><Text style={{ color: c.foregroundMuted, flex: 1, fontSize: 11 }}>任务详情 {dirty ? '· 未保存' : ''}</Text><Button c={c} small icon="X" label="关闭详情" onPress={close} /></View>
    <ScrollView contentContainerStyle={{ padding: 20 }}>
      <View style={{ ...row, gap: 7, marginBottom: 22 }}><Icon name={stageIcons[card.stage]} size={16} color={stageColor(card.stage, c)} /><Text style={{ color: stageColor(card.stage, c), fontSize: 12 }}>{stageNames[card.stage]}</Text><View style={{ flex: 1 }} /><Text selectable style={{ color: c.foregroundMuted, fontSize: 10 }}>{card.id.slice(-8)}</Text></View>
      <Input c={c} label="任务标题" value={title} onChangeText={setTitle} />
      <Input c={c} label="任务说明" value={description} onChangeText={setDescription} multiline placeholder="记录目标、上下文和验收标准…" />
      <Input c={c} label="标签（逗号分隔）" value={tags} onChangeText={setTags} placeholder="前端, 性能, 本周" />
      <Label c={c}>优先级</Label><View style={{ ...wrap, marginBottom: 18 }}>{(['high', 'medium', 'low'] as const).map(p => <Button key={p} c={c} small active={priority === p} onPress={() => setPriority(p)}>{priorityNames[p]}</Button>)}</View>
      {card.task && <>
        <Label c={c}>图片与文件 · {card.task.attachments.length + attachmentAdditions.length}</Label>
        {card.task.attachments.length > 0 && <StoredAttachments c={c} attachments={card.task.attachments} />}
        {canEditDraft && web ? <AttachmentPicker c={c} attachments={attachmentAdditions} pasteEnabled={pasteEnabled} existingCount={card.task.attachments.length} existingSize={existingAttachmentSize} disabled={busy} onChange={setAttachmentAdditions} onError={setFormError} onReadingChange={setReadingAttachments} /> : card.task.attachments.length === 0 ? <Text style={{ color: c.foregroundMuted, fontSize: 11, marginBottom: 18 }}>无附件</Text> : <View style={{ marginBottom: 8 }} />}
        {canEditDraft && !web && <Text style={{ color: c.foregroundMuted, fontSize: 11, marginBottom: 18 }}>请在桌面端粘贴、拖拽或选择附件。</Text>}
      </>}
      {formError ? <Text accessibilityRole="alert" style={{ color: c.statusDanger, fontSize: 12, marginBottom: 10 }}>{formError}</Text> : null}
      <Button c={c} primary icon="Check" disabled={busy || readingAttachments || !dirty} onPress={() => { const parsed = parseTags(tags); if (!title.trim()) { setFormError('请填写任务标题。'); return; } if (title.length > 180 || description.length > 20000 || parsed.length > 12 || parsed.some(t => t.length > 40)) { setFormError('标题最多 180 字，说明最多 20000 字，标签最多 12 个且各不超过 40 字。'); return; } setFormError(''); void save({ title: title.trim(), description, tags: parsed, priority, ...(canEditDraft && workspace !== card.workspaceId ? { workspaceId: workspace } : {}), ...(canEditDraft && attachmentAdditions.length ? { attachmentAdditions } : {}) }).then(ok => { if (ok) { setTitle(title.trim()); setTags(parsed.join(', ')); setAttachmentAdditions([]); } }); }}>保存修改</Button>
      <View style={{ height: 1, backgroundColor: c.border, marginVertical: 24 }} />
      <Label c={c}>移动到</Label><View style={{ ...wrap, marginBottom: 24 }}>{stages.map(stage => <Button key={stage} c={c} small icon={stageIcons[stage]} active={card.stage === stage} disabled={busy || stage === card.stage} onPress={() => move(stage)}>{stageNames[stage]}</Button>)}</View>
      <Label c={c}>工作区</Label>
      {canEditDraft ? <WorkspacePicker c={c} workspaces={snapshot.workspaces} value={workspace} disabled={busy} onChange={setWorkspace} /> : <><Text style={{ color: c.foreground, fontSize: 12, marginBottom: 6 }}>{card.project} / {card.workspace}</Text><Text selectable style={{ color: c.foregroundMuted, fontSize: 10, lineHeight: 17, marginBottom: 16 }}>{card.cwd}</Text></>}
      <Label c={c}>执行 Agent</Label><Text style={{ color: c.foreground, fontSize: 12, marginBottom: 16 }}>{card.task?.provider ?? card.provider}</Text>
      {card.task && <><Label c={c}>运行模式</Label><Text testID="task-run-mode" style={{ color: c.foreground, fontSize: 12, marginBottom: 16 }}>{snapshot.modes.find(mode => mode.provider === card.provider && mode.id === taskModeId)?.label ?? taskModeId ?? 'Agent 默认'}</Text></>}
      {card.task && <><Label c={c}>Thinking Mode</Label><Text testID="task-thinking-mode" style={{ color: c.foreground, fontSize: 12, marginBottom: 16 }}>{taskModel?.thinkingOptions.find(option => option.id === taskThinkingOptionId)?.label ?? taskThinkingOptionId ?? (taskWasStarted ? '未记录（Agent 默认）' : 'Agent 默认')}</Text></>}
      {card.agent && <><Label c={c}>会话 ID</Label><Text selectable style={{ color: c.foregroundMuted, fontSize: 10, marginBottom: 18 }}>{card.agent.id}</Text></>}
      {card.agent && navigation && <Button c={c} primary icon="ArrowUpRight" onPress={() => navigation.openAgent({ agentId: card.agent!.id })}>打开 Paseo 会话</Button>}
      {card.task && !card.task.agentId && <><Button c={c} primary icon="Play" disabled={busy || dirty || !workspaceAvailable} onPress={() => void launch()}>{card.task.launchState ? '检查并关联会话' : '开始执行'}</Button><Text style={{ color: c.foregroundMuted, fontSize: 10, lineHeight: 18, marginTop: 9 }}>{dirty ? '请先保存修改，再启动任务。' : !workspaceAvailable ? '工作区不可用，请先在 Paseo 恢复工作区。' : card.task.launchState ? '启动结果待确认，将检查是否已存在关联会话。' : '在此工作区新建会话，将任务说明发送给 Agent。'}</Text></>}
      {card.task?.agentId && !card.agent && <Text style={{ color: c.statusWarning, fontSize: 11, lineHeight: 18 }}>关联会话已归档或不可用。任务记录仍然保留。</Text>}
      {savedWorkspaceAvailable && navigation && <View style={{ marginTop: 9 }}><Button c={c} icon="FolderOpen" disabled={dirty} onPress={() => navigation.openWorkspace({ workspaceId: card.workspaceId! })}>打开工作区</Button></View>}
      {card.task && !card.task.agentId && !card.task.launchState && <View style={{ marginTop: 24 }}><Button c={c} icon="Trash2" disabled={busy} onPress={() => { if (!confirmDelete) { setConfirmDelete(true); return; } void remove().then(ok => { if (ok) close(); }); }}>{confirmDelete ? '确认永久删除' : '删除未启动任务'}</Button><Text style={{ color: confirmDelete ? c.statusDanger : c.foregroundMuted, fontSize: 10, lineHeight: 18, marginTop: 8 }}>{confirmDelete ? '再次点击将删除任务及其附件，此操作无法撤销。' : '仅从未启动过的任务可以直接删除。'}</Text></View>}
      <View style={{ marginTop: 24 }}><Button c={c} icon={card.hidden ? 'ArchiveRestore' : 'Archive'} disabled={busy} onPress={() => void save({ hidden: !card.hidden }).then(ok => { if (ok) close(); })}>{card.hidden ? '恢复到看板' : '从看板收起'}</Button><Text style={{ color: c.foregroundMuted, fontSize: 10, lineHeight: 18, marginTop: 8 }}>收起仅整理看板，会话继续保留在 Paseo 中。</Text></View>
    </ScrollView>
  </>;
}

function CreateForm({ c, snapshot, workspaceId, projectId, web, shortcutEnabled, busy, defaultModel, initialTitle = '', inboxId, setDefaultModel, onDirtyChange, onCloseBlockedChange, close, create }: { c: Colors; snapshot?: Snapshot; workspaceId?: string; projectId: string; web: boolean; shortcutEnabled: boolean; busy: boolean; defaultModel: string; initialTitle?: string; inboxId?: string; setDefaultModel(model: string): void; onDirtyChange(dirty: boolean): void; onCloseBlockedChange(blocked: boolean): void; close(): void; create(input: CreateInput): Promise<boolean> }) {
  const [clientRequestId] = useState(clientUuid);
  const [title, setTitle] = useState(initialTitle), [description, setDescription] = useState(''), [tags, setTags] = useState('');
  const [attachments, setAttachments] = useState<CreateAttachmentInput[]>([]);
  const initialWorkspace = useRef(workspaceId ?? snapshot?.workspaces.find(w => !projectId || w.projectId === projectId)?.id ?? '').current;
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const availableModels = snapshot?.models ?? [];
  const initialProvider = useRef(availableModels.some(model => model.id === defaultModel) ? defaultModel : availableModels[0]?.id ?? '').current;
  const [provider, setProvider] = useState(initialProvider);
  const selectedModel = availableModels.find(model => model.id === provider);
  const selectableWorkspaces = (snapshot?.workspaces ?? []).filter(w => !workspaceId || w.id === workspaceId);
  const [modeSelection, setModeSelection] = useState<{ provider: string; id: string } | null>(null);
  const modeProvider = provider.split('/')[0];
  const modes = (snapshot?.modes ?? []).filter(mode => mode.provider === modeProvider);
  const modeId = modeSelection?.provider === modeProvider && modes.some(mode => mode.id === modeSelection.id) ? modeSelection.id : defaultModeId(modes, modeProvider);
  const initialModeId = useRef(defaultModeId((snapshot?.modes ?? []).filter(mode => mode.provider === initialProvider.split('/')[0]), initialProvider.split('/')[0])).current;
  const [thinkingSelection, setThinkingSelection] = useState<{ model: string; id: string } | null>(null);
  const thinkingOptions = selectedModel?.thinkingOptions ?? [];
  const thinkingOptionId = thinkingSelection?.model === provider && thinkingOptions.some(option => option.id === thinkingSelection.id) ? thinkingSelection.id : defaultThinkingOptionId(thinkingOptions, selectedModel?.defaultThinkingOptionId);
  const initialModel = availableModels.find(model => model.id === initialProvider);
  const initialThinkingOptionId = useRef(defaultThinkingOptionId(initialModel?.thinkingOptions ?? [], initialModel?.defaultThinkingOptionId)).current;
  const [priority, setPriority] = useState<CreateInput['priority']>('medium');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [readingAttachments, setReadingAttachments] = useState(false);
  const submit = async () => {
    if (busy || submitting || readingAttachments || !workspace || !provider) return;
    const parsed = parseTags(tags);
    if (!title.trim()) { setError('请填写任务标题。'); return; }
    if (title.length > 180 || description.length > 20000 || parsed.length > 12 || parsed.some(t => t.length > 40)) { setError('标题最多 180 字，说明最多 20000 字，标签最多 12 个且各不超过 40 字。'); return; }
    onCloseBlockedChange(true); setSubmitting(true); setError('');
    const ok = await create({ clientRequestId, ...(inboxId ? { inboxId } : {}), title: title.trim(), description: description.trim(), tags: parsed, workspaceId: workspace, provider, modeId, thinkingOptionId, priority, attachments });
    if (!ok) { onCloseBlockedChange(false); setError('创建失败，任务尚未保存。请关闭弹窗查看错误详情后重试。'); setSubmitting(false); }
  };
  useEffect(() => {
    onDirtyChange(Boolean(title !== initialTitle || description || tags || attachments.length || workspace !== initialWorkspace || provider !== initialProvider || modeId !== initialModeId || thinkingOptionId !== initialThinkingOptionId || priority !== 'medium'));
  }, [attachments.length, description, initialModeId, initialProvider, initialThinkingOptionId, initialTitle, initialWorkspace, modeId, onDirtyChange, priority, provider, tags, thinkingOptionId, title, workspace]);
  useEffect(() => {
    if (!web || !shortcutEnabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (document.querySelector(`[data-testid="${QUICK_INBOX_MODAL_TEST_ID}"]`)) return;
      if (event.ctrlKey && event.key === 'Enter') {
        event.preventDefault();
        void submit();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  });
  return <>
    <View style={{ ...row, padding: 20, borderBottomWidth: 1, borderBottomColor: c.border }}><View style={{ flex: 1 }}><Text accessibilityRole="header" style={{ color: c.foreground, fontSize: 19, fontWeight: '600' }}>{inboxId ? '从 Inbox 创建任务' : '新建任务'}</Text><Text style={{ color: c.foregroundMuted, fontSize: 11, marginTop: 6 }}>{inboxId ? '补全工作区和执行设置，保存后该条目会离开 Inbox。' : '先记录想法，准备好后再交给 Agent。'}</Text></View><Button c={c} icon="X" label="关闭新建任务" onPress={close} disabled={submitting || readingAttachments} /></View>
    <ScrollView contentContainerStyle={{ padding: 22 }}>
      <Input c={c} label="任务标题" value={title} onChangeText={value => { onDirtyChange(true); setTitle(value); }} placeholder="这次想完成什么？" />
      <Input c={c} label="任务说明" value={description} onChangeText={value => { onDirtyChange(true); setDescription(value); }} multiline placeholder="目标、涉及的文件，以及怎样才算完成…" />
      <Label c={c}>图片与文件</Label>
      {web ? <AttachmentPicker c={c} attachments={attachments} disabled={busy || submitting} onChange={value => { onDirtyChange(true); setAttachments(value); }} onError={setError} onReadingChange={reading => { onCloseBlockedChange(reading || submitting); setReadingAttachments(reading); }} /> : <Text style={{ color: c.foregroundMuted, fontSize: 11, marginBottom: 18 }}>请在桌面端拖拽或选择附件。</Text>}
      <Label c={c}>工作区</Label>
      <WorkspacePicker c={c} workspaces={selectableWorkspaces} value={workspace} disabled={busy || submitting || Boolean(workspaceId)} onChange={id => { onDirtyChange(true); setWorkspace(id); }} />
      {!snapshot?.workspaces.length && <Text style={{ color: c.statusWarning, fontSize: 12, marginBottom: 15 }}>请先在 Paseo 中创建一个工作区。</Text>}
      <Label c={c}>Agent / 模型</Label><View style={{ ...wrap, marginBottom: 10 }}>{snapshot?.models.map(m => <Button key={m.id} c={c} small icon="Bot" active={provider === m.id} onPress={() => { onDirtyChange(true); setProvider(m.id); }}>{m.provider} / {m.label}</Button>)}</View>
      {provider && <View style={{ ...row, marginBottom: 20 }}><Button c={c} small icon={defaultModel === provider ? 'Star' : 'StarOff'} active={defaultModel === provider} onPress={() => setDefaultModel(provider)}>{defaultModel === provider ? '当前默认模型' : '设为默认模型'}</Button></View>}
      {!snapshot?.models.length && <Text style={{ color: c.statusWarning, fontSize: 12, marginBottom: 15 }}>{snapshot?.providerError || '未发现可用模型，请先在 Paseo 配置提供商。'}</Text>}
      <Label c={c}>Thinking Mode</Label>
      <View accessibilityRole="radiogroup" accessibilityLabel="Thinking Mode" style={{ ...wrap, marginBottom: 20 }}>
        {thinkingOptions.map(option => <Button key={option.id} c={c} small radio label={`Thinking Mode ${option.label}`} active={thinkingOptionId === option.id} onPress={() => { onDirtyChange(true); setThinkingSelection({ model: provider, id: option.id }); }}>{option.label}</Button>)}
        {thinkingOptions.length === 0 && <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>当前模型不支持 Thinking Mode</Text>}
      </View>
      <Label c={c}>运行模式</Label>
      <View accessibilityRole="radiogroup" accessibilityLabel="运行模式" style={{ ...wrap, marginBottom: 20 }}>
        {modes.map(mode => <Button key={mode.id} c={c} small radio label={`运行模式 ${mode.label}`} active={modeId === mode.id} onPress={() => { onDirtyChange(true); setModeSelection({ provider: modeProvider, id: mode.id }); }}>{mode.label}</Button>)}
        {modes.length === 0 && <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>Agent 默认</Text>}
      </View>
      <Label c={c}>优先级</Label><View style={{ ...wrap, marginBottom: 20 }}>{(['high', 'medium', 'low'] as const).map(p => <Button key={p} c={c} small active={p === priority} onPress={() => { onDirtyChange(true); setPriority(p); }}>{priorityNames[p]}</Button>)}</View>
      <Input c={c} label="标签（逗号分隔）" value={tags} onChangeText={value => { onDirtyChange(true); setTags(value); }} placeholder="例如：体验优化, 本周" />
      {error && <Text accessibilityRole="alert" style={{ color: c.statusDanger, marginBottom: 12, fontSize: 12 }}>{error}</Text>}
      <Button c={c} primary icon="Plus" disabled={busy || submitting || readingAttachments || !workspace || !provider} onPress={() => void submit()}>{submitting ? '正在保存…' : '创建待办任务'}</Button>
      <Text style={{ color: c.foregroundMuted, fontSize: 10, marginTop: 8, textAlign: 'center' }}>快捷键：Ctrl+Enter</Text>
    </ScrollView>
  </>;
}
