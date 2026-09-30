import { createElement, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { PluginTheme } from '@getpaseo/plugin';
import type { PluginSurfaceProps, PluginWorkspacePanelProps } from '@getpaseo/plugin/client';
import { useRpc } from '@getpaseo/plugin/client';
import { Icon } from '@getpaseo/plugin/client/react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addInboxEntry, completeReviewCards, createProjectWorkspace, createTask, deleteInboxEntry, deleteTask, hideDoneCards, launchTask, MAX_ATTACHMENT_FILES, MAX_ATTACHMENT_TOTAL_SIZE, moveCard, patchCard, patchInboxEntry, readBoard, type AddInboxInput, type CompleteReviewInput, type CreateAttachmentInput, type CreateInput, type CreateProjectWorkspaceInput, type HideDoneInput, type LaunchInput, type LaunchResult, type MoveInput, type PatchInboxInput, type PatchInput } from '../shared/contracts';
import { agentIsRunning, buildCards, defaultModeId, defaultThinkingOptionId, filterCards, MAX_DESCRIPTION_LENGTH, MAX_TITLE_LENGTH, priorityNames, relativeTime, stageNames, stages, type Card, type InboxEntry, type Snapshot, type Stage, type Task, type TaskAttachment, type Workspace } from '../shared/model';
import { organizeProjects } from '../shared/contracts';
import type { ProjectAction } from '../shared/projects';
import { ProjectSidebar } from './project-sidebar';
import { INBOX_CHANGED_EVENT, QUICK_INBOX_MODAL_TEST_ID, openQuickInbox, setQuickInboxPalette } from './quick-inbox';
import { BOARD_KEYBOARD_SCOPE_TEST_ID_PREFIX, isActiveBoardKeyboardScope, isOpenBoardShortcut } from './board-shortcut';
import { WebDragItem, WebDropZone } from './web';
import { openKanbanSettings } from './open-settings';

export interface BoardApi {
  organize(action: ProjectAction): Promise<unknown>;
  read(): Promise<Snapshot>;
  patch(input: PatchInput): Promise<unknown>;
  move(input: MoveInput): Promise<unknown>;
  completeReview(input: CompleteReviewInput): Promise<{ ok: boolean; count: number }>;
  hideDone(input: HideDoneInput): Promise<{ ok: boolean; count: number }>;
  create(input: CreateInput): Promise<Task>;
  addInbox(input: AddInboxInput): Promise<InboxEntry>;
  createProject(input: CreateProjectWorkspaceInput): Promise<Workspace>;
  patchInbox(input: PatchInboxInput): Promise<InboxEntry>;
  removeInbox(input: { id: string }): Promise<unknown>;
  launch(input: LaunchInput): Promise<LaunchResult>;
  remove(input: { id: string }): Promise<unknown>;
}

export function KanbanSurface(props: PluginSurfaceProps) {
  return <ConnectedBoard key={props.host.id} {...props} />;
}
export function KanbanWorkspace(props: PluginWorkspacePanelProps) {
  return <ConnectedBoard key={`${props.host.id}:${props.workspaceId}`} {...props} workspaceId={props.workspaceId} />;
}
function ConnectedBoard(props: PluginSurfaceProps & { workspaceId?: string }) {
  const organize = useRpc(organizeProjects), createProject = useRpc(createProjectWorkspace);
  const read = useRpc(readBoard), patch = useRpc(patchCard), move = useRpc(moveCard), completeReview = useRpc(completeReviewCards), hideDone = useRpc(hideDoneCards), create = useRpc(createTask), addInbox = useRpc(addInboxEntry), patchInbox = useRpc(patchInboxEntry), removeInbox = useRpc(deleteInboxEntry), launch = useRpc(launchTask), remove = useRpc(deleteTask);
  const api = useMemo<BoardApi>(() => ({ read: () => read({}), patch, move, completeReview, hideDone, create, addInbox, createProject, patchInbox, removeInbox, launch, remove, organize }), [read, patch, move, completeReview, hideDone, create, addInbox, createProject, patchInbox, removeInbox, launch, remove, organize]);
  return <BoardView {...props} api={api} />;
}

type Colors = PluginTheme['colors'];
type Notice = { text: string; error: boolean; retry?: boolean };
const SIDEBAR_MIN_WIDTH = 176;
const SIDEBAR_MAX_WIDTH = 420;
const SIDEBAR_DEFAULT_WIDTH = 210;
const row = { flexDirection: 'row', alignItems: 'center' } as const;
const wrap = { ...row, flexWrap: 'wrap', gap: 8 } as const;
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
const stageIcons: Record<Stage, string> = { todo: 'CircleDashed', running: 'CirclePlay', blocked: 'CircleAlert', review: 'CircleDot', done: 'CircleCheck' };
function stageColor(stage: Stage, c: Colors) { return stage === 'done' ? c.statusSuccess : stage === 'blocked' ? c.statusDanger : stage === 'review' ? c.statusWarning : stage === 'running' ? c.accent : c.foregroundMuted; }

function Button({ children, icon, onPress, c, primary, active, disabled, label, small, large, radio }: { children?: ReactNode; icon?: string; onPress(): void; c: Colors; primary?: boolean; active?: boolean; disabled?: boolean; label?: string; small?: boolean; large?: boolean; radio?: boolean }) {
  const color = primary ? c.accentForeground : active ? c.accent : c.foreground;
  return <Pressable accessibilityRole={radio ? 'radio' : 'button'} accessibilityLabel={label} accessibilityState={{ disabled: Boolean(disabled), selected: Boolean(active), checked: radio ? Boolean(active) : undefined }} aria-checked={radio ? Boolean(active) : undefined} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ ...row, gap: large ? 9 : 7, justifyContent: 'center', minHeight: large ? 46 : small ? 30 : 36, paddingHorizontal: large ? 15 : children ? 11 : 9, paddingVertical: large ? 9 : 6, borderRadius: large ? 10 : 7, borderWidth: 1, borderColor: primary ? c.accent : active ? c.accent : c.border, backgroundColor: primary ? c.accent : active ? c.surface2 : c.surface1, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 })}>
    {icon && <Icon name={icon} size={large ? 17 : small ? 14 : 16} color={color} />}
    {children && <Text style={{ color, fontSize: large ? 14 : small ? 11 : 12, fontWeight: '600' }}>{children}</Text>}
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
  const [detailDirty, setDetailDirty] = useState(false);
  const [confirmingDetailClose, setConfirmingDetailClose] = useState(false);
  const [detailCloseBlocked, setDetailCloseBlocked] = useState(false);
  const [inboxView, setInboxView] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createSource, setCreateSource] = useState<InboxEntry | null>(null);
  const [autoLaunchTaskId, setAutoLaunchTaskId] = useState<string | null>(null);
  const [createDirty, setCreateDirty] = useState(false);
  const [confirmingCreateClose, setConfirmingCreateClose] = useState(false);
  const [createCloseBlocked, setCreateCloseBlocked] = useState(false);
  const keyboardScopeTestId = useRef(`${BOARD_KEYBOARD_SCOPE_TEST_ID_PREFIX}${clientUuid()}`).current;
  const [paseoSidebarVisible, setPaseoSidebarVisible] = useState(false);
  const creatingRef = useRef(creating), createDirtyRef = useRef(createDirty), confirmingCreateCloseRef = useRef(confirmingCreateClose);
  creatingRef.current = creating; createDirtyRef.current = createDirty; confirmingCreateCloseRef.current = confirmingCreateClose;
  const handledCreateEscapeRef = useRef(false);
  const detailDirtyRef = useRef(detailDirty), confirmingDetailCloseRef = useRef(confirmingDetailClose);
  detailDirtyRef.current = detailDirty; confirmingDetailCloseRef.current = confirmingDetailClose;
  const detailCloseBlockedRef = useRef(detailCloseBlocked);
  detailCloseBlockedRef.current = detailCloseBlocked;
  const handledDetailEscapeRef = useRef(false);
  const createCloseBlockedRef = useRef(createCloseBlocked);
  createCloseBlockedRef.current = createCloseBlocked;
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [defaultModel, setDefaultModel] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const [message, setMessage] = useState<Notice | null>(null);
  const search = useRef<TextInput>(null);
  const mutation = useMutation({ mutationFn: (run: () => Promise<unknown>) => run(), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey }); }, onError: error => setMessage({ text: errorText(error), error: true }) });
  const mutationPendingRef = useRef(mutation.isPending);
  mutationPendingRef.current = mutation.isPending;
  const busy = mutation.isPending || !board.data || board.isError;
  const notice: Notice | null = board.isError ? { text: `同步失败，操作已暂停。${errorText(board.error)}`, error: true, retry: true } : message;
  const projectBaseDirectory = board.data?.store.settings.projectBaseDirectory ?? '';
  const run = async (action: () => Promise<unknown>, success?: string) => {
    if (busy) return false;
    try { await mutation.mutateAsync(action); if (success) setMessage({ text: success, error: false }); return true; } catch { return false; }
  };
  const removeInboxOptimistically = async (id: string) => {
    if (busy) return false;
    await queryClient.cancelQueries({ queryKey });
    const removedEntry = queryClient.getQueryData<Snapshot>(queryKey)?.store.inbox[id];
    queryClient.setQueryData<Snapshot>(queryKey, current => {
      if (!current?.store.inbox[id]) return current;
      const inbox = { ...current.store.inbox };
      delete inbox[id];
      return { ...current, store: { ...current.store, inbox } };
    });
    const ok = await run(() => api.removeInbox({ id }), 'Inbox 条目已删除');
    if (!ok && removedEntry) queryClient.setQueryData<Snapshot>(queryKey, current => current
      ? { ...current, store: { ...current.store, inbox: { ...current.store.inbox, [id]: removedEntry } } }
      : undefined);
    return ok;
  };
  const changeCreateDirty = (dirty: boolean) => { createDirtyRef.current = dirty; setCreateDirty(dirty); };
  const hideCreateConfirmation = () => { confirmingCreateCloseRef.current = false; setConfirmingCreateClose(false); };
  const changeCreateCloseBlocked = (blocked: boolean) => { createCloseBlockedRef.current = blocked; setCreateCloseBlocked(blocked); };
  const openCreate = (source?: InboxEntry) => { setCreateSource(source ?? null); changeCreateDirty(false); changeCreateCloseBlocked(false); hideCreateConfirmation(); creatingRef.current = true; setCreating(true); };
  const requestCreateClose = () => {
    if (mutationPendingRef.current || createCloseBlockedRef.current) return;
    if (createDirtyRef.current) { confirmingCreateCloseRef.current = true; setConfirmingCreateClose(true); }
    else { creatingRef.current = false; setCreating(false); setCreateSource(null); }
  };
  const discardCreate = () => { changeCreateDirty(false); hideCreateConfirmation(); creatingRef.current = false; setCreating(false); setCreateSource(null); };
  const changeDetailDirty = (dirty: boolean) => { detailDirtyRef.current = dirty; setDetailDirty(dirty); };
  const hideDetailConfirmation = () => { confirmingDetailCloseRef.current = false; setConfirmingDetailClose(false); };
  const changeDetailCloseBlocked = (blocked: boolean) => { detailCloseBlockedRef.current = blocked; setDetailCloseBlocked(blocked); };
  const closeDetail = () => { changeDetailDirty(false); changeDetailCloseBlocked(false); hideDetailConfirmation(); setAutoLaunchTaskId(null); setSelected(null); };
  const requestDetailClose = () => {
    if (detailCloseBlockedRef.current) return;
    if (detailDirtyRef.current) { confirmingDetailCloseRef.current = true; setConfirmingDetailClose(true); }
    else closeDetail();
  };
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
      if (event.type === 'keydown' && (inboxView || pinned) && isOpenBoardShortcut(event)) {
        event.preventDefault(); event.stopImmediatePropagation(); reset();
        return;
      }
      if (event.key === 'Escape' && event.type === 'keyup' && handledCreateEscapeRef.current) {
        event.preventDefault(); event.stopImmediatePropagation(); handledCreateEscapeRef.current = false;
        return;
      }
      if (event.key === 'Escape' && event.type === 'keyup' && handledDetailEscapeRef.current) {
        event.preventDefault(); event.stopImmediatePropagation(); handledDetailEscapeRef.current = false;
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
      if (event.key === 'Escape' && selected) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (event.type === 'keyup' || event.repeat) return;
        handledDetailEscapeRef.current = true;
        if (confirmingDetailCloseRef.current) hideDetailConfirmation();
        else requestDetailClose();
        return;
      }
      if (confirmingDetailCloseRef.current) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, [contenteditable="true"]') || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === '/') { event.preventDefault(); event.stopImmediatePropagation(); search.current?.focus(); }
      if (event.key.toLowerCase() === 'n') { event.preventDefault(); event.stopImmediatePropagation(); openCreate(); }
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKey, true); };
  }, [inboxView, keyboardScopeTestId, layout.platform, pinned, selected]);
  useEffect(() => {
    changeDetailDirty(false);
    changeDetailCloseBlocked(false);
    hideDetailConfirmation();
  }, [selected]);
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
  useEffect(() => {
    if (!layout.compact) return;
    setProject('');
    setProvider('');
    setAttention(false);
    setHidden(false);
  }, [layout.compact]);
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
  const visible = filterCards(all, { query, projectId: project, workspaceId, provider, pinned: false, attention, hidden });
  const favoriteCards = [
    ...filterCards(all, { query, projectId: '', workspaceId, provider: '', pinned: true, attention: false, hidden: false }),
    ...filterCards(all, { query, projectId: '', workspaceId, provider: '', pinned: true, attention: false, hidden: true }),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title));
  const active = all.find(card => card.id === selected);
  const projects = [...new Map((board.data?.workspaces ?? []).filter(w => !workspaceId || w.id === workspaceId).map(w => [w.projectId, { id: w.projectId, name: w.project }])).values()];
  const count = (id?: string) => scope.filter(card => !card.hidden && (!id || card.projectId === id)).length;
  const move = (id: string, stage: Stage, beforeId?: string) => { setDragging(null); return run(() => api.move({ id, stage, beforeId }), `已移至${stageNames[stage]}`); };
  const completeReview = (ids: string[]) => { void run(() => api.completeReview({ ids }), `已将 ${ids.length} 个待审核任务标记为完成`); };
  const hideDone = (ids: string[]) => { void run(() => api.hideDone({ ids }), `已从看板收起 ${ids.length} 个已完成任务`); };
  const reset = () => { setInboxView(false); setQuery(''); setProject(''); setProvider(''); setPinned(false); setAttention(false); setHidden(false); };

  const sidebarItem = (text: string, icon: string, selectedItem: boolean, onPress: () => void, amount?: number) => <Pressable key={text} accessibilityRole="button" accessibilityState={{ selected: selectedItem }} onPress={onPress} style={{ ...row, gap: 9, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 7, backgroundColor: selectedItem ? c.surface2 : 'transparent' }}>
    <Icon name={icon} size={15} color={selectedItem ? c.foreground : c.foregroundMuted} />
    <Text numberOfLines={1} style={{ color: selectedItem ? c.foreground : c.foregroundMuted, flex: 1, fontSize: 12, fontWeight: selectedItem ? '600' : '400' }}>{text}</Text>
    {amount !== undefined && <Text style={{ color: c.foregroundMuted, fontSize: 11 }}>{amount}</Text>}
  </Pressable>;

  const detail = active && <Detail key={active.id} card={active} snapshot={board.data!} c={c} busy={busy} web={layout.platform === 'web'} pasteEnabled={!creating} autoLaunch={autoLaunchTaskId === active.id} navigation={navigation} notice={notice} dismissNotice={() => board.isError ? void board.refetch() : setMessage(null)} onDirtyChange={changeDetailDirty} onCloseBlockedChange={changeDetailCloseBlocked} requestClose={requestDetailClose} close={closeDetail}
    move={async stage => {
      const id = active.id;
      const ok = await move(id, stage);
      if (ok && stage === 'done') setSelected(current => current === id ? null : current);
      return ok;
    }}
    save={patch => run(() => api.patch({ id: active.id, patch }), '已保存')}
    launch={async confirmedWorkspaceId => {
      if (busy) return;
      setAutoLaunchTaskId(null);
      try {
        const result = await mutation.mutateAsync(() => api.launch({ id: active.id, ...(confirmedWorkspaceId ? { confirmedWorkspaceId } : {}) })) as LaunchResult;
        if (result.status === 'started') setMessage({ text: '任务已交给 Agent', error: false });
        return result;
      } catch { return; }
    }}
    remove={() => run(() => api.remove({ id: active.id }), '任务已删除')}
  />;

  const openAndLaunch = (id: string) => {
    if (busy) return;
    setAutoLaunchTaskId(id);
    setSelected(id);
  };

  return <View testID={keyboardScopeTestId} style={{ flex: 1, backgroundColor: c.surface0, minHeight: 0 }}>
    {preview && <View style={{ ...row, backgroundColor: c.surface2, justifyContent: 'center', padding: 8, gap: 8 }}><Icon name="FlaskConical" size={13} color={c.statusWarning} /><Text style={{ color: c.foregroundMuted, fontSize: 11 }}>交互预览 · 使用示例数据，不会操作真实 Paseo 会话</Text></View>}
    <View style={{ flex: 1, flexDirection: 'row', minHeight: 0 }}>
      {!layout.compact && !workspaceId && <View testID="board-sidebar" style={{ width: sidebarWidth, position: 'relative', borderRightWidth: 1, borderRightColor: c.border, padding: 16, paddingTop: 24 }}>
        <View style={{ ...row, gap: 10, paddingHorizontal: 8, marginBottom: 30 }}><Icon name="PanelsTopLeft" size={23} color={c.accent} /><Text style={{ color: c.foreground, fontSize: 18, fontWeight: '700', letterSpacing: -0.6 }}>paseo<Text style={{ color: c.foregroundMuted, fontWeight: '400' }}> / board</Text></Text></View>
        <Label c={c}>工作台</Label>
        {sidebarItem('Inbox', 'Inbox', inboxView, () => { reset(); setInboxView(true); }, Object.keys(board.data?.store.inbox ?? {}).length)}
        {sidebarItem('全部任务', 'LayoutGrid', !inboxView && !project && !pinned && !attention && !hidden, reset, count())}
        {sidebarItem('需要我处理', 'Inbox', attention, () => { reset(); setAttention(true); }, scope.filter(x => !x.hidden && ['blocked', 'review'].includes(x.stage)).length)}
        {sidebarItem('常用会话', 'Star', pinned, () => { reset(); setPinned(true); }, scope.filter(x => x.pinned).length)}
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
        <View style={{ paddingHorizontal: layout.compact ? 18 : 28, paddingTop: layout.compact ? 18 : 25, paddingBottom: layout.compact ? 14 : 19, borderBottomWidth: 1, borderBottomColor: c.border, gap: layout.compact ? 14 : 18 }}>
          <View style={{ ...row, justifyContent: 'space-between', gap: 12 }}>
            {showPaseoSidebarToggle && createElement('div', { title: `切换侧边栏（${paseoSidebarShortcutHint}）`, style: { display: 'flex' } },
              <Pressable accessibilityRole="button" accessibilityLabel={`${paseoSidebarVisible ? '隐藏' : '显示'} Paseo 主侧栏`} accessibilityHint={paseoSidebarShortcutHint} accessibilityState={{ expanded: paseoSidebarVisible }} aria-expanded={paseoSidebarVisible} onPress={onTogglePaseoSidebar}
                style={({ pressed }) => ({ ...row, justifyContent: 'center', width: 36, height: 36, borderRadius: 7, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface1, opacity: pressed ? 0.7 : 1 })}>
                <Icon name="PanelLeft" size={17} color={c.foregroundMuted} />
              </Pressable>)}
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.foregroundMuted, fontSize: 11, marginBottom: layout.compact ? 6 : 9 }}>{layout.compact ? 'PASEO · MOBILE' : `工作台 / ${workspaceId ? '工作区看板' : '任务看板'}`}</Text>
              <View style={{ ...row, gap: 12 }}><Text accessibilityRole="header" style={{ color: c.foreground, fontSize: layout.compact ? 22 : 28, fontWeight: '700', letterSpacing: -0.8 }}>{inboxView ? 'Inbox' : pinned ? '常用会话' : layout.compact ? '选择任务，开始执行' : hidden ? '已收起的任务' : attention ? '需要我处理' : projects.find(p => p.id === project)?.name ?? '所有任务，一目了然'}</Text><Text style={{ color: c.foregroundMuted, fontSize: 12 }}>{inboxView ? Object.keys(board.data?.store.inbox ?? {}).length : pinned ? favoriteCards.length : visible.length}</Text></View>
              {!layout.compact && <Text style={{ color: c.foregroundMuted, fontSize: 12, marginTop: 8 }}>{inboxView ? '快速收集想法，准备好后再补全信息并创建任务。' : pinned ? '独立保留不常打开但值得长期收藏的会话，不受看板进度和收起状态影响。' : '从想法到交付，把每一段会话放回工作流。'}</Text>}
            </View>
            {!layout.compact && <Button c={c} icon={inboxView ? 'LayoutGrid' : 'Inbox'} active={inboxView} onPress={() => { if (inboxView) reset(); else { reset(); setInboxView(true); } }}>{inboxView ? '返回看板' : 'Inbox'}</Button>}
            {!layout.compact && <Button c={c} primary icon="Plus" onPress={() => inboxView && layout.platform === 'web' ? openQuickInbox() : openCreate()} disabled={busy}>{inboxView && layout.platform === 'web' ? '新建想法' : '新建任务'}</Button>}
          </View>
          {!inboxView && <View style={{ ...wrap, gap: 10 }}>
            <View style={{ ...row, flexGrow: 1, flexShrink: 1, minWidth: 190, maxWidth: 400, gap: 9, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface1, borderRadius: 7, paddingHorizontal: 11 }}>
              <Icon name="Search" size={15} color={c.foregroundMuted} />
              <TextInput ref={search} accessibilityLabel={pinned ? '搜索常用会话' : '搜索任务'} placeholder={pinned ? '搜索常用会话、项目或会话 ID…' : '搜索任务、标签、工作区或会话 ID…'} placeholderTextColor={c.foregroundMuted} value={query} onChangeText={setQuery} style={{ flex: 1, color: c.foreground, fontSize: 12, height: 36, minWidth: 0 }} />
              {query ? <Pressable accessibilityLabel="清除搜索" accessibilityRole="button" onPress={() => setQuery('')}><Icon name="X" size={14} color={c.foregroundMuted} /></Pressable> : <Text style={{ color: c.foregroundMuted, fontSize: 11 }}>/</Text>}
            </View>
            {!layout.compact && <Button c={c} icon={pinned ? 'LayoutGrid' : 'Star'} active={pinned} onPress={() => { if (pinned) reset(); else { reset(); setPinned(true); } }}>{pinned ? '返回看板' : '常用会话'}</Button>}
            {!layout.compact && !pinned && <Button c={c} icon="CircleAlert" active={attention} onPress={() => setAttention(!attention)}>需处理</Button>}
            {!layout.compact && !pinned && <Button c={c} icon="Archive" active={hidden} onPress={() => setHidden(!hidden)} label={hidden ? '返回活动任务' : '查看已收起任务'} />}
            <View style={{ flex: 1 }} />
            {!layout.compact && (mutation.isPending ? <ActivityIndicator size="small" color={c.accent} /> : <Text style={{ color: c.foregroundMuted, fontSize: 10 }}>{board.isFetching ? '同步中' : '每 5 秒同步'}</Text>)}
            {!layout.compact && <Button c={c} icon="RefreshCw" label="刷新看板" onPress={() => void board.refetch()} disabled={board.isFetching} />}
          </View>}
          {!inboxView && !pinned && !layout.compact && (provider || (board.data?.providers.length ?? 0) > 1) && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ ...row, gap: 7 }}>
            <Text style={{ color: c.foregroundMuted, fontSize: 11, marginRight: 4 }}>Agent</Text>
            <Button c={c} small active={!provider} onPress={() => setProvider('')}>全部</Button>
            {[...new Set([...(board.data?.providers ?? []), ...all.map(card => card.provider)])].filter(Boolean).map(p => <Button key={p} c={c} small active={provider === p} onPress={() => setProvider(p)}>{p}</Button>)}
          </ScrollView>}
        </View>
        {!active && notice && <View accessibilityRole="alert" style={{ ...row, gap: 9, padding: 12, backgroundColor: c.surface2 }}>
          <Icon name={notice.error ? 'CircleAlert' : 'Check'} size={16} color={notice.error ? c.statusDanger : c.statusSuccess} />
          <Text style={{ flex: 1, color: notice.error ? c.statusDanger : c.foreground, fontSize: 12 }}>{notice.text}</Text>
          <Button c={c} small onPress={() => notice.retry ? void board.refetch() : setMessage(null)}>{notice.retry ? '重试' : '关闭'}</Button>
        </View>}
        {board.isPending ? <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}><ActivityIndicator color={c.accent} /><Text style={{ color: c.foregroundMuted }}>正在整理你的会话…</Text></View> : inboxView ? <InboxPanel c={c} entries={Object.values(board.data?.store.inbox ?? {})} compact={layout.compact} busy={busy} add={layout.compact ? input => run(() => api.addInbox(input), '已存入 Inbox') : undefined} createTask={entry => openCreate(entry)} edit={input => run(() => api.patchInbox(input), 'Inbox 条目已更新')} remove={removeInboxOptimistically} /> : pinned ? <FavoritePanel c={c} cards={favoriteCards} total={scope.filter(card => card.pinned).length} query={query} compact={layout.compact} busy={busy} navigation={navigation} clearSearch={() => setQuery('')} select={id => { setAutoLaunchTaskId(null); setSelected(id); }} favorite={card => void run(() => api.patch({ id: card.id, patch: { pinned: false } }), '已取消收藏')} /> : layout.compact ? <MobileTaskPicker c={c} cards={visible} busy={busy} openCreate={() => openCreate()} select={id => { setAutoLaunchTaskId(null); setSelected(id); }} launch={openAndLaunch} favorite={card => void run(() => api.patch({ id: card.id, patch: { pinned: !card.pinned } }), card.pinned ? '已取消收藏' : '已收藏为常用会话')} /> : <View style={{ flex: 1, minHeight: 0 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {visible.length === 0 && <View style={{ padding: 16, ...row, gap: 12 }}><Icon name="Search" size={17} color={c.foregroundMuted} /><Text style={{ color: c.foregroundMuted, fontSize: 12, flex: 1 }}>{all.length ? '没有符合条件的任务。试试清除筛选，或查看已收起任务。' : '还没有会话。新建一个任务，或在 Paseo 中打开会话后刷新。'}</Text>{all.length > 0 && <Button c={c} small onPress={reset}>清除筛选</Button>}</View>}
            <ScrollView horizontal style={{ flex: 1 }} contentContainerStyle={{ padding: layout.compact ? 12 : 24, gap: 15, flexGrow: 1 }} showsHorizontalScrollIndicator>
              {stages.map(stage => {
                const cards = visible.filter(card => card.stage === stage);
                return <View key={stage} testID={`column-${stage}`} style={{ width: layout.compact ? 280 : 268, flexGrow: 1, minHeight: 200 }}>
                  <View style={{ ...row, gap: 8, marginBottom: 17, paddingHorizontal: 3 }}><Icon name={stageIcons[stage]} size={16} color={stageColor(stage, c)} /><Text style={{ color: c.foreground, fontSize: 12, fontWeight: '600' }}>{stageNames[stage]}</Text><Text style={{ color: c.foregroundMuted, fontSize: 11, marginLeft: 4 }}>{cards.length}</Text><View style={{ flex: 1 }} />{stage === 'review' && cards.length > 0 && <Button c={c} small icon="CheckCheck" label={`完成当前筛选的 ${cards.length} 个待审核任务`} disabled={busy} onPress={() => completeReview(cards.map(card => card.id))}>完成当前 {cards.length} 项</Button>}{stage === 'done' && !hidden && cards.length > 0 && <Button c={c} small icon="Archive" label={`从看板收起当前筛选的 ${cards.length} 个已完成任务`} disabled={busy} onPress={() => hideDone(cards.map(card => card.id))}>收起当前 {cards.length} 项</Button>}{stage === 'todo' && <Pressable accessibilityRole="button" accessibilityLabel="添加待办" disabled={busy} onPress={() => openCreate()}><Icon name="Plus" size={16} color={c.foregroundMuted} /></Pressable>}</View>
                  <WebDropZone enabled={layout.platform === 'web' && !busy} onDrop={id => move(id, stage)}>
                    <ScrollView style={{ flex: 1, borderRadius: 9, backgroundColor: c.surface0, borderWidth: dragging ? 1 : 0, borderColor: c.border }} contentContainerStyle={{ gap: 10, paddingBottom: 32, minHeight: 150 }}>
                      {cards.map(card => <WebDropZone key={card.id} item enabled={layout.platform === 'web' && !busy} onDrop={id => { if (id !== card.id) move(id, stage, card.id); }}>
                        <WebDragItem id={card.id} enabled={layout.platform === 'web' && !busy} onDrag={setDragging}>
                          <TaskCard card={card} c={c} selected={selected === card.id} busy={busy} onSelect={() => setSelected(card.id)} onFavorite={() => void run(() => api.patch({ id: card.id, patch: { pinned: !card.pinned } }), card.pinned ? '已取消收藏' : '已收藏为常用会话')} />
                        </WebDragItem>
                      </WebDropZone>)}
                      {cards.length === 0 && <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, borderRadius: 9, minHeight: 112, alignItems: 'center', justifyContent: 'center', gap: 8 }}><Icon name={stageIcons[stage]} size={20} color={c.foregroundMuted} /><Text style={{ color: c.foregroundMuted, fontSize: 11 }}>{dragging ? '松开以移动到这里' : stage === 'todo' ? '下一个想法，从这里开始' : '暂无任务'}</Text></View>}
                    </ScrollView>
                  </WebDropZone>
                </View>;
              })}
            </ScrollView>
            {!layout.compact && <View style={{ ...row, paddingHorizontal: 26, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.border, gap: 8 }}><Icon name="GripVertical" size={13} color={c.foregroundMuted} /><Text style={{ color: c.foregroundMuted, fontSize: 10 }}>拖动卡片调整进度 · 点击查看详情 · / 搜索 · N 新建</Text><View style={{ flex: 1 }} /><Text style={{ color: c.foregroundMuted, fontSize: 10 }}>完成由你确认</Text></View>}
          </View>
        </View>}
        {layout.compact && <MobileBottomNav c={c} inbox={inboxView} favorites={pinned} inboxCount={Object.keys(board.data?.store.inbox ?? {}).length} taskCount={scope.filter(card => !card.hidden && card.stage === 'todo' && card.task && !card.task.agentId).length} favoriteCount={scope.filter(card => card.pinned).length} showInbox={() => { reset(); setInboxView(true); }} showTasks={reset} showFavorites={() => { reset(); setPinned(true); }} />}
      </View>
    </View>
    <Modal visible={Boolean(active)} transparent animationType="fade" {...(layout.platform === 'web' ? { accessibilityViewIsModal: true, accessibilityLabel: active ? `任务详情：${active.title}` : '任务详情' } : {})} onRequestClose={requestDetailClose}>
      <View style={{ flex: 1, backgroundColor: layout.compact ? c.surface1 : 'rgba(0,0,0,0.58)', alignItems: 'center', justifyContent: 'center', padding: layout.compact ? 0 : 28 }}>
        <View testID="task-detail-dialog" {...(layout.platform === 'web' ? {} : { role: 'dialog' as const, accessibilityViewIsModal: true, accessibilityLabel: active ? `任务详情：${active.title}` : '任务详情' })} style={{ width: '100%', maxWidth: layout.compact ? undefined : 680, height: layout.compact ? '100%' : undefined, maxHeight: layout.compact ? '100%' : '90%', backgroundColor: c.surface1, borderWidth: layout.compact ? 0 : 1, borderColor: c.border, borderRadius: layout.compact ? 0 : 14, overflow: 'hidden' }}>
          {detail}
        </View>
      </View>
    </Modal>
    <Modal visible={confirmingDetailClose} transparent animationType="fade" onRequestClose={hideDetailConfirmation}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.58)', alignItems: 'center', justifyContent: 'center', padding: 20 }}><View accessibilityRole="alert" style={{ width: '100%', maxWidth: 390, backgroundColor: c.surface1, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 22 }}><View style={{ ...row, gap: 9, marginBottom: 10 }}><Icon name="CircleAlert" size={18} color={c.statusWarning} /><Text style={{ flex: 1, color: c.foreground, fontSize: 16, fontWeight: '600' }}>放弃未保存的修改？</Text></View><Text style={{ color: c.foregroundMuted, fontSize: 12, lineHeight: 19, marginBottom: 20 }}>任务内容和已添加的附件将会丢失。</Text><View style={{ ...row, justifyContent: 'flex-end', gap: 9 }}><Button c={c} onPress={closeDetail}>放弃修改</Button><Button c={c} primary onPress={hideDetailConfirmation}>继续编辑</Button></View></View></View>
    </Modal>
    <Modal visible={creating} transparent animationType="fade" onRequestClose={requestCreateClose}>
      <View style={{ flex: 1, backgroundColor: c.surface0, alignItems: 'center', justifyContent: 'center', padding: layout.compact ? 0 : 28 }}>
        <View style={{ width: '100%', maxWidth: layout.compact ? undefined : 560, height: layout.compact ? '100%' : undefined, maxHeight: layout.compact ? '100%' : '95%', backgroundColor: c.surface1, borderWidth: layout.compact ? 0 : 1, borderColor: c.border, borderRadius: layout.compact ? 0 : 14, overflow: 'hidden' }}>
          {creating && <CreateForm c={c} snapshot={board.data} workspaceId={workspaceId} projectId={project} web={layout.platform === 'web'} compact={layout.compact} shortcutEnabled={!confirmingCreateClose} busy={busy} defaultModel={defaultModel} projectBaseDirectory={projectBaseDirectory} initialTitle={createSource?.title} initialDescription={createSource?.description} initialAttachments={createSource?.attachments} inboxId={createSource?.id} setDefaultModel={saveDefaultModel} onDirtyChange={changeCreateDirty} onCloseBlockedChange={changeCreateCloseBlocked} close={requestCreateClose} createProject={async input => await mutation.mutateAsync(() => api.createProject(input)) as Workspace} create={async (input, execute) => { let task: Task | undefined; const ok = await run(async () => { task = await api.create(input); }); if (ok && task) { reset(); changeCreateDirty(false); changeCreateCloseBlocked(false); setCreateSource(null); if (execute) setAutoLaunchTaskId(task.id); setSelected(task.id); creatingRef.current = false; setCreating(false); } return ok; }} />}
        </View>
      </View>
    </Modal>
    <Modal visible={confirmingCreateClose} transparent animationType="fade" onRequestClose={hideCreateConfirmation}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.58)', alignItems: 'center', justifyContent: 'center', padding: 20 }}><View accessibilityRole="alert" style={{ width: '100%', maxWidth: 390, backgroundColor: c.surface1, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 22 }}><View style={{ ...row, gap: 9, marginBottom: 10 }}><Icon name="CircleAlert" size={18} color={c.statusWarning} /><Text style={{ flex: 1, color: c.foreground, fontSize: 16, fontWeight: '600' }}>放弃未保存的修改？</Text></View><Text style={{ color: c.foregroundMuted, fontSize: 12, lineHeight: 19, marginBottom: 20 }}>任务内容和已添加的附件将会丢失。</Text><View style={{ ...row, justifyContent: 'flex-end', gap: 9 }}><Button c={c} onPress={discardCreate}>放弃修改</Button><Button c={c} primary onPress={hideCreateConfirmation}>继续编辑</Button></View></View></View>
    </Modal>
  </View>;
}

function FavoritePanel({ c, cards, total, query, compact, busy, navigation, clearSearch, select, favorite }: { c: Colors; cards: Card[]; total: number; query: string; compact: boolean; busy: boolean; navigation: PluginSurfaceProps['navigation']; clearSearch(): void; select(id: string): void; favorite(card: Card): void }) {
  return <ScrollView testID="favorite-panel" style={{ flex: 1 }} contentContainerStyle={{ padding: compact ? 16 : 24, paddingBottom: 36 }}>
    <View style={{ width: '100%', maxWidth: 900, alignSelf: 'center', gap: 12 }}>
      {cards.map(card => <View key={card.id} testID={`favorite-${card.id}`} style={{ borderWidth: 1, borderColor: c.border, borderRadius: compact ? 12 : 9, backgroundColor: c.surface1, overflow: 'hidden' }}>
        <View style={{ ...row, alignItems: 'flex-start', gap: 12, padding: compact ? 15 : 17 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`查看常用会话 ${card.title}`} onPress={() => select(card.id)} style={({ pressed }) => ({ flex: 1, minWidth: 0, opacity: pressed ? 0.72 : 1 })}>
            <View style={{ ...row, gap: 8, marginBottom: 8 }}><Text numberOfLines={1} style={{ flex: 1, color: c.foregroundMuted, fontSize: 11 }}>{card.project} / {card.workspace}</Text>{card.hidden && <Text style={{ color: c.foregroundMuted, fontSize: 10, backgroundColor: c.surface2, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3 }}>已收起</Text>}</View>
            <Text numberOfLines={2} style={{ color: c.foreground, fontSize: compact ? 16 : 15, lineHeight: 23, fontWeight: '700' }}>{card.title}</Text>
            {card.description ? <Text numberOfLines={2} style={{ color: c.foregroundMuted, fontSize: 12, lineHeight: 19, marginTop: 7 }}>{card.description}</Text> : null}
            {card.tags.length > 0 && <View style={{ ...wrap, gap: 5, marginTop: 10 }}>{card.tags.slice(0, 4).map(tag => <Text key={tag} style={{ color: c.foregroundMuted, fontSize: 10, backgroundColor: c.surface2, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3 }}>{tag}</Text>)}</View>}
          </Pressable>
          <Button c={c} small icon="Star" active disabled={busy} label={`取消收藏会话 ${card.title}`} onPress={() => favorite(card)}>{compact ? undefined : '取消收藏'}</Button>
        </View>
        <View style={{ ...row, gap: 8, flexWrap: 'wrap', paddingHorizontal: compact ? 15 : 17, paddingVertical: 11, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface0 }}>
          <Icon name={stageIcons[card.stage]} size={14} color={stageColor(card.stage, c)} /><Text style={{ color: stageColor(card.stage, c), fontSize: 11 }}>{stageNames[card.stage]}</Text>
          <Icon name="Bot" size={13} color={c.foregroundMuted} /><Text style={{ color: c.foregroundMuted, fontSize: 11 }}>{card.provider}</Text>
          <Text style={{ color: c.foregroundMuted, fontSize: 11 }}>{relativeTime(card.updatedAt)}</Text><View style={{ flex: 1 }} />
          {card.agent && navigation && <Button c={c} small icon="ArrowUpRight" label={`打开 Paseo 会话 ${card.title}`} onPress={() => navigation.openAgent({ agentId: card.agent!.id })}>打开会话</Button>}
          <Button c={c} small icon="ChevronRight" label={`查看常用会话详情 ${card.title}`} onPress={() => select(card.id)}>查看详情</Button>
        </View>
      </View>)}
      {cards.length === 0 && <View style={{ minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, borderRadius: 12 }}><Icon name={total > 0 ? 'Search' : 'Star'} size={28} color={c.foregroundMuted} /><Text style={{ color: c.foreground, fontSize: 15, fontWeight: '600' }}>{total > 0 ? '没有匹配的常用会话' : '还没有常用会话'}</Text><Text style={{ color: c.foregroundMuted, fontSize: 12, textAlign: 'center', paddingHorizontal: 24 }}>{total > 0 ? '换个关键词试试，或清除搜索查看全部收藏。' : '返回看板，点击卡片上的星标收藏。已收起的收藏会话也会一直保留在这里。'}</Text>{total > 0 && query && <Button c={c} small icon="X" label="清除常用会话搜索" onPress={clearSearch}>清除搜索</Button>}</View>}
    </View>
  </ScrollView>;
}

function MobileBottomNav({ c, inbox, favorites, inboxCount, taskCount, favoriteCount, showInbox, showTasks, showFavorites }: { c: Colors; inbox: boolean; favorites: boolean; inboxCount: number; taskCount: number; favoriteCount: number; showInbox(): void; showTasks(): void; showFavorites(): void }) {
  const item = (label: string, icon: string, active: boolean, count: number, onPress: () => void) => <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} onPress={onPress} style={({ pressed }) => ({ flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 4, opacity: pressed ? 0.72 : 1 })}>
    <View style={{ ...row, gap: 6 }}><Icon name={icon} size={20} color={active ? c.accent : c.foregroundMuted} />{count > 0 && <View style={{ minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? c.accent : c.surface2 }}><Text style={{ color: active ? c.accentForeground : c.foregroundMuted, fontSize: 11, fontWeight: '700' }}>{count > 99 ? '99+' : count}</Text></View>}</View>
    <Text style={{ color: active ? c.foreground : c.foregroundMuted, fontSize: 13, fontWeight: active ? '700' : '500' }}>{label}</Text>
  </Pressable>;
  return <View testID="mobile-bottom-nav" style={{ ...row, flexShrink: 0, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface1, paddingBottom: 8 }}>
    {item('执行', 'CirclePlay', !inbox && !favorites, taskCount, showTasks)}
    {item('常用', 'Star', !inbox && favorites, favoriteCount, showFavorites)}
    {item('Inbox', 'Inbox', inbox, inboxCount, showInbox)}
  </View>;
}

function MobileTaskPicker({ c, cards, busy, openCreate, select, launch, favorite }: { c: Colors; cards: Card[]; busy: boolean; openCreate(): void; select(id: string): void; launch(id: string): void; favorite(card: Card): void }) {
  const groups = stages.map(stage => ({ stage, cards: cards.filter(card => card.stage === stage) })).filter(group => group.cards.length > 0);
  const readyCount = cards.filter(card => card.stage === 'todo' && card.task && !card.task.agentId).length;
  return <ScrollView testID="mobile-task-picker" style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 28, gap: 20 }}>
    <View style={{ ...row, gap: 12, padding: 16, borderRadius: 14, backgroundColor: c.surface2 }}>
      <View style={{ width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accent }}><Icon name="Play" size={20} color={c.accentForeground} /></View>
      <View style={{ flex: 1, minWidth: 0 }}><Text style={{ color: c.foreground, fontSize: 16, lineHeight: 22, fontWeight: '700' }}>{readyCount ? `${readyCount} 项任务可以开始` : '暂时没有待执行任务'}</Text><Text style={{ color: c.foregroundMuted, fontSize: 13, lineHeight: 19, marginTop: 3 }}>{readyCount ? '选一项，让 Agent 接着做。' : '可以从 Inbox 整理，或直接写一项任务。'}</Text></View>
      <Button c={c} icon="Plus" label="新建任务" onPress={openCreate} disabled={busy} />
    </View>
    {groups.map(({ stage, cards: stageCards }) => <View key={stage} testID={`column-${stage}`} style={{ gap: 10 }}>
      <View style={{ ...row, gap: 8, paddingHorizontal: 2 }}><Icon name={stageIcons[stage]} size={16} color={stageColor(stage, c)} /><Text style={{ color: c.foreground, fontSize: 14, fontWeight: '700' }}>{stage === 'todo' ? '待执行' : stageNames[stage]}</Text><Text style={{ color: c.foregroundMuted, fontSize: 12 }}>{stageCards.length}</Text></View>
      {stageCards.map(card => {
        const canLaunch = Boolean(stage === 'todo' && card.task && !card.task.agentId);
        return <View key={card.id} testID={`card-${card.id}`} style={{ borderWidth: 1, borderColor: c.border, borderRadius: 14, backgroundColor: c.surface1, overflow: 'hidden' }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`查看任务 ${card.title}`} onPress={() => select(card.id)} style={({ pressed }) => ({ padding: 16, opacity: pressed ? 0.72 : 1 })}>
            <View style={{ ...row, gap: 8, marginBottom: 9 }}><Text numberOfLines={1} style={{ flex: 1, color: c.foregroundMuted, fontSize: 12 }}>{card.project} / {card.workspace}</Text>{card.priority === 'high' && <View style={{ borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: c.surface2 }}><Text style={{ color: c.statusWarning, fontSize: 11, fontWeight: '700' }}>高优先级</Text></View>}</View>
            <Text style={{ color: c.foreground, fontSize: 16, lineHeight: 23, fontWeight: '700' }}>{card.title}</Text>
            {card.description ? <Text numberOfLines={2} style={{ color: c.foregroundMuted, fontSize: 13, lineHeight: 20, marginTop: 7 }}>{card.description}</Text> : null}
            <View style={{ ...row, gap: 7, marginTop: 13 }}><Icon name="Bot" size={14} color={c.foregroundMuted} /><Text style={{ flex: 1, color: c.foregroundMuted, fontSize: 12 }}>{card.provider}</Text><Text style={{ color: c.foregroundMuted, fontSize: 12 }}>{relativeTime(card.updatedAt)}</Text></View>
          </Pressable>
          <View style={{ ...row, gap: 9, padding: 12, paddingTop: 0 }}>
            {canLaunch ? <Pressable accessibilityRole="button" accessibilityLabel={`开始执行 ${card.title}`} accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => launch(card.id)} style={({ pressed }) => ({ ...row, flex: 1, minHeight: 46, justifyContent: 'center', gap: 8, borderRadius: 10, backgroundColor: c.accent, opacity: busy ? 0.4 : pressed ? 0.76 : 1 })}><Icon name="Play" size={17} color={c.accentForeground} /><Text style={{ color: c.accentForeground, fontSize: 14, fontWeight: '700' }}>开始执行</Text></Pressable> : <Pressable accessibilityRole="button" accessibilityLabel={`查看任务详情 ${card.title}`} onPress={() => select(card.id)} style={({ pressed }) => ({ ...row, flex: 1, minHeight: 44, justifyContent: 'center', gap: 8, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface0, opacity: pressed ? 0.72 : 1 })}><Text style={{ color: c.foreground, fontSize: 14, fontWeight: '600' }}>查看详情</Text><Icon name="ChevronRight" size={16} color={c.foregroundMuted} /></Pressable>}
            <Pressable accessibilityRole="button" accessibilityLabel={`${card.pinned ? '取消收藏会话' : '收藏会话'} ${card.title}`} accessibilityState={{ selected: card.pinned, disabled: busy }} disabled={busy} onPress={() => favorite(card)} style={({ pressed }) => ({ width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: card.pinned ? c.accent : c.border, backgroundColor: card.pinned ? c.surface2 : c.surface0, opacity: busy ? 0.4 : pressed ? 0.72 : 1 })}><Icon name="Star" size={18} color={card.pinned ? c.accent : c.foregroundMuted} /></Pressable>
          </View>
        </View>;
      })}
    </View>)}
    {groups.length === 0 && <View style={{ minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, borderRadius: 14 }}><Icon name="Search" size={26} color={c.foregroundMuted} /><Text style={{ color: c.foreground, fontSize: 15, fontWeight: '600' }}>没有匹配的任务</Text><Text style={{ color: c.foregroundMuted, fontSize: 13 }}>换个关键词试试。</Text></View>}
  </ScrollView>;
}

function InboxPanel({ c, entries, compact, busy, add, createTask, edit, remove }: { c: Colors; entries: InboxEntry[]; compact: boolean; busy: boolean; add?(input: AddInboxInput): Promise<boolean>; createTask(entry: InboxEntry): void; edit(input: PatchInboxInput): Promise<boolean>; remove(id: string): Promise<boolean> }) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editOriginalTitle, setEditOriginalTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editOriginalDescription, setEditOriginalDescription] = useState('');
  const [captureTitle, setCaptureTitle] = useState('');
  const [captureDescription, setCaptureDescription] = useState('');
  const [captureRequestId, setCaptureRequestId] = useState(clientUuid);
  const [capturing, setCapturing] = useState(false);
  const sorted = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  const beginEdit = (entry: InboxEntry) => { setConfirmDelete(null); setEditing(entry.id); setEditTitle(entry.title); setEditOriginalTitle(entry.title); setEditDescription(entry.description); setEditOriginalDescription(entry.description); };
  const cancelEdit = () => { setEditing(null); setEditTitle(''); setEditOriginalTitle(''); setEditDescription(''); setEditOriginalDescription(''); };
  const saveEdit = (entry: InboxEntry) => {
    const title = editTitle.trim();
    const description = editDescription.trim();
    const unchanged = title === editOriginalTitle && description === editOriginalDescription;
    if (!title || title.length > MAX_TITLE_LENGTH || description.length > MAX_DESCRIPTION_LENGTH || unchanged) { if (unchanged) cancelEdit(); return; }
    void edit({ id: entry.id, expectedTitle: editOriginalTitle, expectedDescription: editOriginalDescription, title, description }).then(ok => { if (ok) cancelEdit(); });
  };
  const capture = async () => {
    const title = captureTitle.trim();
    const description = captureDescription.trim();
    if (!add || !title || title.length > MAX_TITLE_LENGTH || description.length > MAX_DESCRIPTION_LENGTH || capturing) return;
    setCapturing(true);
    const ok = await add({ clientRequestId: captureRequestId, title, description, attachments: [] });
    if (ok) { setCaptureTitle(''); setCaptureDescription(''); setCaptureRequestId(clientUuid()); }
    setCapturing(false);
  };
  return <ScrollView testID="inbox-panel" style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ width: '100%', maxWidth: 820, alignSelf: 'center', padding: compact ? 16 : 24, paddingBottom: compact ? 28 : 24, gap: compact ? 12 : 10 }}>
    {compact && add && <View style={{ padding: 16, borderRadius: 14, backgroundColor: c.surface2 }}>
      <View style={{ ...row, gap: 9, marginBottom: 12 }}><Icon name="Sparkles" size={18} color={c.accent} /><Text style={{ color: c.foreground, fontSize: 16, fontWeight: '700' }}>快速记一笔</Text></View>
      <TextInput accessibilityLabel="Inbox 输入" autoFocus multiline maxLength={MAX_TITLE_LENGTH} editable={!busy && !capturing} value={captureTitle} onChangeText={setCaptureTitle} placeholder="想法标题" placeholderTextColor={c.foregroundMuted} style={{ minHeight: 72, color: c.foreground, backgroundColor: c.surface1, borderWidth: 1, borderColor: captureTitle ? c.accent : c.border, borderRadius: 11, padding: 13, fontSize: 16, lineHeight: 23, textAlignVertical: 'top' }} />
      <TextInput accessibilityLabel="Inbox 详细描述（可选）" multiline maxLength={MAX_DESCRIPTION_LENGTH} editable={!busy && !capturing} value={captureDescription} onChangeText={setCaptureDescription} placeholder="详细描述（可选）" placeholderTextColor={c.foregroundMuted} style={{ minHeight: 92, marginTop: 10, color: c.foreground, backgroundColor: c.surface1, borderWidth: 1, borderColor: captureDescription ? c.accent : c.border, borderRadius: 11, padding: 13, fontSize: 14, lineHeight: 21, textAlignVertical: 'top' }} />
      <View style={{ ...row, marginTop: 12, gap: 10 }}><Text style={{ flex: 1, color: c.foregroundMuted, fontSize: 12 }}>{captureTitle.trim().length}/{MAX_TITLE_LENGTH} · 稍后再补工作区和模型</Text><Button c={c} large primary icon="Inbox" disabled={busy || capturing || !captureTitle.trim()} onPress={() => void capture()}>{capturing ? '保存中…' : '存入 Inbox'}</Button></View>
    </View>}
    {!sorted.length ? <View style={{ minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, borderRadius: 12 }}>
      <Icon name="Inbox" size={28} color={c.foregroundMuted} />
      <Text style={{ color: c.foreground, fontSize: 14, fontWeight: '600' }}>Inbox 还是空的</Text>
      <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>{compact ? '想到事情时，直接在上方记下一项。' : '在 Paseo 任意位置按 Ctrl+Shift+I 快速记下一项。'}</Text>
    </View> : sorted.map(entry => <View key={entry.id} testID={`inbox-entry-${entry.id}`} style={{ flexDirection: compact ? 'column' : 'row', alignItems: compact ? 'stretch' : 'center', gap: compact ? 10 : 14, padding: 15, borderWidth: 1, borderColor: c.border, borderRadius: 10, backgroundColor: c.surface1 }}>
      <View style={{ ...row, flex: 1, minWidth: 0, gap: 14 }}>{(!compact || editing !== entry.id) && <View style={{ width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface2 }}><Icon name="Inbox" size={16} color={c.accent} /></View>}
      <View style={{ flex: 1, minWidth: 0 }}>{editing === entry.id ? <View style={{ gap: 8 }}><InboxEntryEditor c={c} label={`编辑 Inbox 条目 ${editOriginalTitle}`} value={editTitle} maxLength={MAX_TITLE_LENGTH} disabled={busy} onChange={setEditTitle} /><InboxEntryEditor c={c} label={`编辑 Inbox 详细描述 ${editOriginalTitle}`} value={editDescription} maxLength={MAX_DESCRIPTION_LENGTH} multiline disabled={busy} onChange={setEditDescription} /></View> : <><Text numberOfLines={4} style={{ color: c.foreground, fontSize: 13, fontWeight: '600', lineHeight: 20 }}>{entry.title}</Text>{entry.description ? <Text numberOfLines={compact ? 4 : 3} style={{ color: c.foregroundMuted, fontSize: 12, lineHeight: 19, marginTop: 6 }}>{entry.description}</Text> : null}</>}<Text style={{ color: c.foregroundMuted, fontSize: 10, marginTop: 4 }}>{relativeTime(entry.createdAt)}{entry.attachments.length ? ` · ${entry.attachments.length} 个附件` : ''}</Text></View></View>
      <View style={{ ...row, justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>{editing === entry.id ? <><Button c={c} large={compact} small={!compact} primary icon="Check" disabled={busy || !editTitle.trim() || editTitle.trim().length > MAX_TITLE_LENGTH || editDescription.trim().length > MAX_DESCRIPTION_LENGTH} onPress={() => saveEdit(entry)}>保存</Button><Button c={c} large={compact} small={!compact} disabled={busy} onPress={cancelEdit}>取消</Button></> : <><Button c={c} small icon="Pencil" disabled={busy} label={`编辑 Inbox 条目 ${entry.title}`} onPress={() => beginEdit(entry)}>编辑</Button><Button c={c} large={compact} small={!compact} primary icon="Plus" disabled={busy} onPress={() => createTask(entry)}>创建任务</Button><Button c={c} small icon="Trash2" disabled={busy} label={confirmDelete === entry.id ? `确认删除 Inbox 条目 ${entry.title}` : `删除 Inbox 条目 ${entry.title}`} onPress={() => {
        if (confirmDelete !== entry.id) { setConfirmDelete(entry.id); return; }
        void remove(entry.id).then(ok => { if (ok) setConfirmDelete(null); });
      }}>{confirmDelete === entry.id ? '确认删除' : undefined}</Button></>}</View>
    </View>)}
  </ScrollView>;
}

function InboxEntryEditor({ c, label, value, maxLength, multiline, disabled, onChange }: { c: Colors; label: string; value: string; maxLength: number; multiline?: boolean; disabled: boolean; onChange(value: string): void }) {
  return <TextInput accessibilityLabel={label} autoFocus={!multiline} value={value} editable={!disabled} maxLength={maxLength} multiline={multiline} onChangeText={onChange} style={{ width: '100%', color: c.foreground, borderColor: c.accent, backgroundColor: c.surface0, borderWidth: 1, borderRadius: 7, fontSize: 12, lineHeight: 19, paddingHorizontal: 10, paddingVertical: 8, minHeight: multiline ? 88 : 40, textAlignVertical: multiline ? 'top' : 'center' }} />;
}

function TaskCard({ card, c, selected, busy, onSelect, onFavorite }: { card: Card; c: Colors; selected: boolean; busy: boolean; onSelect(): void; onFavorite(): void }) {
  const runtime = card.agent?.pendingPermission ? '等待授权' : card.agent?.status === 'error' ? '执行出错' : card.agent && agentIsRunning(card.agent) ? (card.agent.status === 'initializing' ? '正在启动' : '正在执行') : card.agent ? '会话空闲' : '尚未启动';
  return <View testID={`card-${card.id}`} style={{ borderWidth: 1, borderColor: selected ? c.accent : c.border, borderRadius: 9, backgroundColor: c.surface1, overflow: 'hidden' }}>
    <View style={{ ...row, paddingHorizontal: 13, paddingTop: 11, gap: 7 }}><Text numberOfLines={1} style={{ color: c.foregroundMuted, fontSize: 10, flex: 1 }}>{card.project} <Text style={{ color: c.foregroundMuted }}> / {card.workspace}</Text></Text><Pressable accessibilityRole="button" accessibilityLabel={`${card.pinned ? '取消收藏会话' : '收藏会话'} ${card.title}`} accessibilityState={{ selected: card.pinned }} disabled={busy} onPress={onFavorite} style={{ padding: 4 }}><Icon name="Star" size={13} color={card.pinned ? c.accent : c.foregroundMuted} /></Pressable></View>
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

function Input({ c, label, value, onChangeText, multiline, maxLength, placeholder }: { c: Colors; label: string; value: string; onChangeText(text: string): void; multiline?: boolean; maxLength?: number; placeholder?: string }) {
  return <View style={{ marginBottom: 18 }}><Label c={c}>{label}</Label><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.foregroundMuted} multiline={multiline} maxLength={maxLength} style={{ color: c.foreground, borderColor: c.border, backgroundColor: c.surface0, borderWidth: 1, borderRadius: 7, fontSize: 12, lineHeight: 20, padding: 11, minHeight: multiline ? 130 : 40, textAlignVertical: multiline ? 'top' : 'center' }} /></View>;
}
const parseTags = (text: string) => [...new Set(text.split(/[,，]/).map(t => t.trim()).filter(Boolean))];
const formatBytes = (size: number) => size < 1024 ? `${size} B` : size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;

function WorkspacePicker({ c, workspaces, value, disabled, projectBaseDirectory = '', onCreateProject, onChange }: { c: Colors; workspaces: Workspace[]; value: string; disabled?: boolean; projectBaseDirectory?: string; onCreateProject?(name: string): Promise<Workspace>; onChange(id: string): void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchInput = useRef<TextInput>(null);
  const [view, setView] = useState<'existing' | 'new'>('existing');
  const [projectName, setProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [createError, setCreateError] = useState('');
  const selected = workspaces.find(workspace => workspace.id === value);
  const pickerDisabled = Boolean(disabled || (!workspaces.length && !onCreateProject));
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const filtered = workspaces.filter(workspace => words.every(word => [workspace.project, workspace.name, workspace.directory, workspace.id].join(' ').toLocaleLowerCase().includes(word)));
  const close = () => { if (creatingProject) return; setOpen(false); setQuery(''); setView('existing'); setProjectName(''); setCreateError(''); };
  const submitProject = async () => {
    if (!onCreateProject || creatingProject || !projectBaseDirectory.trim() || !projectName.trim()) return;
    setCreatingProject(true); setCreateError('');
    try {
      const workspace = await onCreateProject(projectName.trim());
      onChange(workspace.id);
      setOpen(false); setQuery(''); setView('existing'); setProjectName('');
    } catch (error) { setCreateError(errorText(error)); }
    finally { setCreatingProject(false); }
  };
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, creatingProject]);
  useEffect(() => {
    if (!open || view !== 'existing') return;
    const focus = () => searchInput.current?.focus();
    const frame = requestAnimationFrame(focus);
    const afterAnimation = setTimeout(focus, 400);
    return () => { cancelAnimationFrame(frame); clearTimeout(afterAnimation); };
  }, [open, view]);
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`选择工作区，当前 ${selected ? `${selected.project} / ${selected.name}` : '未选择'}`} accessibilityState={{ disabled: pickerDisabled }} disabled={pickerDisabled} onPress={() => setOpen(true)} style={({ pressed }) => ({ ...row, gap: 10, minHeight: 50, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 18, borderRadius: 8, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface0, opacity: pickerDisabled ? 0.65 : pressed ? 0.75 : 1 })}>
      <Icon name="FolderOpen" size={16} color={c.foregroundMuted} />
      <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: selected ? c.foreground : c.statusWarning, fontSize: 12, fontWeight: '600' }}>{selected ? `${selected.project} / ${selected.name}` : '请选择工作区'}</Text>{selected && <Text numberOfLines={1} style={{ color: c.foregroundMuted, fontSize: 10, marginTop: 4 }}>{selected.directory}</Text>}</View>
      {!disabled && (workspaces.length > 0 || onCreateProject) && <Icon name="ChevronRight" size={15} color={c.foregroundMuted} />}
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onShow={() => { if (view === 'existing') searchInput.current?.focus(); }} onRequestClose={close}>
      <View testID="workspace-subpanel" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', alignItems: 'center', justifyContent: 'flex-start', paddingHorizontal: 18, paddingTop: 48, paddingBottom: 18 }}>
        <View accessibilityLabel="选择工作区" style={{ width: '100%', maxWidth: 520, maxHeight: '82%', backgroundColor: c.surface1, borderWidth: 1, borderColor: c.border, borderRadius: 12, overflow: 'hidden' }}>
          <View style={{ ...row, gap: 9, padding: 18, borderBottomWidth: 1, borderBottomColor: c.border }}><Icon name="FolderOpen" size={17} color={c.accent} /><Text accessibilityRole="header" style={{ flex: 1, color: c.foreground, fontSize: 16, fontWeight: '600' }}>{view === 'new' ? '新建项目与工作区' : '选择工作区'}</Text><Button c={c} small icon="X" label="关闭工作区选择" disabled={creatingProject} onPress={close} /></View>
          {onCreateProject && <View style={{ ...row, gap: 8, paddingHorizontal: 14, paddingTop: 14 }}><Button c={c} small active={view === 'existing'} onPress={() => { setView('existing'); setCreateError(''); }}>已有工作区</Button><Button c={c} small active={view === 'new'} onPress={() => { setView('new'); setCreateError(''); }}>新建项目</Button></View>}
          {view === 'existing' ? <>
            <View style={{ ...row, gap: 8, margin: 14, marginBottom: 7, paddingHorizontal: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface0, borderRadius: 7 }}><Icon name="Search" size={14} color={c.foregroundMuted} /><TextInput ref={searchInput} accessibilityLabel="搜索工作区" autoFocus value={query} onChangeText={setQuery} placeholder="按项目、工作区或路径搜索…" placeholderTextColor={c.foregroundMuted} style={{ flex: 1, color: c.foreground, fontSize: 12, height: 40 }} />{query ? <Pressable accessibilityRole="button" accessibilityLabel="清除工作区搜索" onPress={() => setQuery('')}><Icon name="X" size={14} color={c.foregroundMuted} /></Pressable> : null}</View>
            <ScrollView contentContainerStyle={{ padding: 14, paddingTop: 7, gap: 7 }}>
              {filtered.map(workspace => <Pressable key={workspace.id} accessibilityRole="button" accessibilityLabel={`选择工作区 ${workspace.project} / ${workspace.name}`} accessibilityState={{ selected: workspace.id === value }} onPress={() => { onChange(workspace.id); close(); }} style={({ pressed }) => ({ ...row, gap: 10, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: workspace.id === value ? c.accent : c.border, backgroundColor: workspace.id === value ? c.surface2 : c.surface0, opacity: pressed ? 0.75 : 1 })}>
                <Icon name={workspace.id === value ? 'CircleCheck' : 'FolderGit2'} size={15} color={workspace.id === value ? c.accent : c.foregroundMuted} /><View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: c.foreground, fontSize: 12, fontWeight: '600' }}>{workspace.project} / {workspace.name}</Text><Text numberOfLines={1} style={{ color: c.foregroundMuted, fontSize: 10, marginTop: 4 }}>{workspace.directory}</Text></View>
              </Pressable>)}
              {filtered.length === 0 && <Text style={{ color: c.foregroundMuted, fontSize: 12, padding: 16, textAlign: 'center' }}>没有匹配的工作区</Text>}
            </ScrollView>
          </> : <View style={{ padding: 18 }}>
            <Label c={c}>项目名</Label>
            <TextInput accessibilityLabel="新项目名称" autoFocus value={projectName} editable={!creatingProject} onChangeText={value => { setProjectName(value); setCreateError(''); }} onSubmitEditing={() => void submitProject()} placeholder="例如：new-product" placeholderTextColor={c.foregroundMuted} style={{ color: c.foreground, borderColor: c.border, backgroundColor: c.surface0, borderWidth: 1, borderRadius: 7, fontSize: 12, padding: 11, minHeight: 40, marginBottom: 12 }} />
            {projectBaseDirectory.trim() ? <Text selectable style={{ color: c.foregroundMuted, fontSize: 11, lineHeight: 18, marginBottom: 14 }}>将在 {projectBaseDirectory.trim()} 下创建同名项目目录，并自动创建工作区。</Text> : <Text style={{ color: c.statusWarning, fontSize: 11, lineHeight: 18, marginBottom: 14 }}>请先在 Paseo 设置 → 插件 → 任务看板中配置项目基础目录。</Text>}
            {createError ? <Text accessibilityRole="alert" style={{ color: c.statusDanger, fontSize: 11, marginBottom: 12 }}>{createError}</Text> : null}
            <Button c={c} primary icon="Plus" disabled={creatingProject || !projectBaseDirectory.trim() || !projectName.trim()} onPress={() => void submitProject()}>{creatingProject ? '正在创建…' : '创建项目和工作区'}</Button>
          </View>}
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
  <View style={{ ...row, gap: 10 }}><Icon name="Paperclip" size={17} color={dragging ? c.accent : c.foregroundMuted} /><View style={{ flex: 1 }}><Text style={{ color: c.foreground, fontSize: 12, fontWeight: '600' }}>{reading ? '正在读取附件…' : dragging ? '松开即可添加' : '拖拽或粘贴图片、文件到这里'}</Text><Text style={{ color: c.foregroundMuted, fontSize: 10, marginTop: 4 }}>支持 Ctrl/⌘ + V · 最多 10 个，总计 50 MB</Text></View><Button c={c} small disabled={disabled || reading} onPress={() => input.current?.click()}>选择文件</Button></View>,
  attachments.length > 0 && <View style={{ gap: 7, marginTop: 12 }}>{attachments.map(attachment => <View key={attachment.id} style={{ ...row, gap: 8, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8 }}><Icon name="File" size={14} color={c.foregroundMuted} /><Text numberOfLines={1} style={{ flex: 1, color: c.foreground, fontSize: 11 }}>{attachment.fileName}</Text><Text style={{ color: c.foregroundMuted, fontSize: 10 }}>{formatBytes(attachment.size)}</Text><Button c={c} small icon="X" label={`移除附件 ${attachment.fileName}`} disabled={disabled || reading} onPress={() => onChange(attachments.filter(item => item.id !== attachment.id))} /></View>)}</View>);
}

function StoredAttachments({ c, attachments }: { c: Colors; attachments: TaskAttachment[] }) {
  return <View testID="task-attachments" style={{ gap: 7, marginBottom: 10 }}>{attachments.map(attachment => <View key={attachment.id} style={{ ...row, gap: 9, padding: 10, borderWidth: 1, borderColor: c.border, borderRadius: 7, backgroundColor: c.surface0 }}><Icon name={attachment.mimeType.startsWith('image/') ? 'Image' : 'File'} size={15} color={c.foregroundMuted} /><View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: c.foreground, fontSize: 11, fontWeight: '600' }}>{attachment.fileName}</Text><Text style={{ color: c.foregroundMuted, fontSize: 10, marginTop: 3 }}>{attachment.mimeType.startsWith('image/') ? '图片' : '文件'} · {formatBytes(attachment.size)}</Text></View><Text style={{ color: c.statusSuccess, fontSize: 10 }}>已上传</Text></View>)}</View>;
}

function Detail({ card, snapshot, c, busy, web, pasteEnabled, autoLaunch = false, navigation, notice, dismissNotice, onDirtyChange, onCloseBlockedChange, requestClose, close, move, save, launch, remove }: { card: Card; snapshot: Snapshot; c: Colors; busy: boolean; web: boolean; pasteEnabled: boolean; autoLaunch?: boolean; navigation: PluginSurfaceProps['navigation']; notice: Notice | null; dismissNotice(): void; onDirtyChange(dirty: boolean): void; onCloseBlockedChange(blocked: boolean): void; requestClose(): void; close(): void; move(stage: Stage): Promise<boolean>; save(patch: PatchInput['patch']): Promise<boolean>; launch(confirmedWorkspaceId?: string): Promise<LaunchResult | undefined>; remove(): Promise<boolean> }) {
  const [title, setTitle] = useState(card.title), [description, setDescription] = useState(card.description), [tags, setTags] = useState(card.tags.join(', '));
  const [priority, setPriority] = useState(card.priority);
  const [workspace, setWorkspace] = useState(card.workspaceId ?? '');
  const [attachmentAdditions, setAttachmentAdditions] = useState<CreateAttachmentInput[]>([]);
  const [readingAttachments, setReadingAttachments] = useState(false);
  const [formError, setFormError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launchConflict, setLaunchConflict] = useState<Extract<LaunchResult, { status: 'confirmation_required' }> | null>(null);
  const autoLaunchStarted = useRef(false);
  const canEditDraft = Boolean(card.task && !card.task.agentId && !card.task.launchState);
  const draftChanged = canEditDraft && (workspace !== card.workspaceId || attachmentAdditions.length > 0);
  const dirty = title !== card.title || description !== card.description || tags !== card.tags.join(', ') || priority !== card.priority || draftChanged;
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  const selectedWorkspace = snapshot.workspaces.find(item => item.id === workspace);
  const workspaceAvailable = Boolean(selectedWorkspace);
  const savedWorkspaceAvailable = snapshot.workspaces.some(item => item.id === card.workspaceId);
  const existingAttachmentSize = card.task?.attachments.reduce((sum, attachment) => sum + attachment.size, 0) ?? 0;
  const taskModeId = card.task?.modeId ?? defaultModeId(snapshot.modes.filter(mode => mode.provider === card.provider), card.provider);
  const taskModel = snapshot.models.find(model => model.id === card.task?.provider);
  const taskWasStarted = Boolean(card.task?.agentId || card.task?.launchState);
  const taskThinkingOptionId = card.task?.thinkingOptionId ?? (taskWasStarted ? undefined : defaultThinkingOptionId(taskModel?.thinkingOptions ?? [], taskModel?.defaultThinkingOptionId));
  const canLaunch = Boolean(card.task && !card.task.agentId);
  let launchHelp = '在此工作区新建会话，将任务说明发送给 Agent。';
  if (dirty) launchHelp = '请先保存修改，再启动任务。';
  else if (!workspaceAvailable) launchHelp = '工作区不可用，请先在 Paseo 恢复工作区。';
  else if (card.task?.launchState) launchHelp = '启动结果待确认，将检查是否已存在关联会话。';
  let launchLabel = card.task?.launchState ? '检查并关联会话' : '开始执行';
  if (launching) launchLabel = '正在启动…';
  const startLaunch = async (confirmedWorkspaceId?: string) => {
    if (launching) return;
    setLaunching(true);
    try {
      const result = await launch(confirmedWorkspaceId);
      if (result?.status === 'confirmation_required') setLaunchConflict(result);
      else if (result?.status === 'started') setLaunchConflict(null);
    }
    finally { setLaunching(false); }
  };
  useEffect(() => {
    if (!autoLaunch || autoLaunchStarted.current || busy || dirty || !workspaceAvailable || !canLaunch) return;
    autoLaunchStarted.current = true;
    void startLaunch();
  }, [autoLaunch, busy, canLaunch, dirty, workspaceAvailable]);
  return <>
    <View style={{ ...row, padding: 18, borderBottomWidth: 1, borderBottomColor: c.border, gap: 8 }}><Icon name="FileText" size={16} color={c.foregroundMuted} /><Text accessibilityRole="header" style={{ color: c.foreground, flex: 1, fontSize: 15, fontWeight: '600' }}>任务详情 {dirty ? <Text style={{ color: c.statusWarning, fontSize: 11, fontWeight: '400' }}>· 未保存</Text> : null}</Text><Button c={c} small icon="Star" active={card.pinned} disabled={busy} label={`${card.pinned ? '取消收藏会话' : '收藏会话'} ${card.title}`} onPress={() => void save({ pinned: !card.pinned })}>{card.pinned ? '已收藏' : '收藏'}</Button><Button c={c} small icon="X" label="关闭详情" onPress={requestClose} /></View>
    {notice && <View accessibilityRole="alert" style={{ ...row, gap: 9, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: c.surface2, borderBottomWidth: 1, borderBottomColor: c.border }}><Icon name={notice.error ? 'CircleAlert' : 'Check'} size={16} color={notice.error ? c.statusDanger : c.statusSuccess} /><Text style={{ flex: 1, color: notice.error ? c.statusDanger : c.foreground, fontSize: 12 }}>{notice.text}</Text><Button c={c} small onPress={dismissNotice}>{notice.retry ? '重试' : '关闭'}</Button></View>}
    {(canLaunch || (card.agent && navigation)) && <View testID="task-primary-action" style={{ paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface2 }}>
      {canLaunch ? <Button c={c} primary icon="Play" disabled={busy || dirty || !workspaceAvailable || launching} onPress={() => void startLaunch()}>{launchLabel}</Button> : <Button c={c} primary icon="ArrowUpRight" onPress={() => navigation!.openAgent({ agentId: card.agent!.id })}>打开 Paseo 会话</Button>}
      {canLaunch && <Text style={{ color: c.foregroundMuted, fontSize: 10, lineHeight: 18, marginTop: 8, textAlign: 'center' }}>{launchHelp}</Text>}
    </View>}
    <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ padding: 20 }}>
      <View style={{ ...row, gap: 7, marginBottom: 10 }}><Icon name={stageIcons[card.stage]} size={16} color={stageColor(card.stage, c)} /><Text style={{ color: stageColor(card.stage, c), fontSize: 12 }}>{stageNames[card.stage]}</Text><View style={{ flex: 1 }} /><Text selectable style={{ color: c.foregroundMuted, fontSize: 10 }}>{card.id.slice(-8)}</Text></View>
      <Text style={{ color: c.foregroundMuted, fontSize: 10, lineHeight: 17, marginBottom: 22 }}>{card.pinned ? '已标记为常用，可从“常用会话”快速找到。' : '经常使用这个会话？收藏后可从“常用会话”快速找到。'}</Text>
      <Input c={c} label="任务标题" value={title} onChangeText={setTitle} maxLength={MAX_TITLE_LENGTH} />
      <Input c={c} label="任务说明" value={description} onChangeText={setDescription} multiline maxLength={MAX_DESCRIPTION_LENGTH} placeholder="记录目标、上下文和验收标准…" />
      <Input c={c} label="标签（逗号分隔）" value={tags} onChangeText={setTags} placeholder="前端, 性能, 本周" />
      <Label c={c}>优先级</Label><View style={{ ...wrap, marginBottom: 18 }}>{(['high', 'medium', 'low'] as const).map(p => <Button key={p} c={c} small active={priority === p} onPress={() => setPriority(p)}>{priorityNames[p]}</Button>)}</View>
      {card.task && <>
        <Label c={c}>图片与文件 · {card.task.attachments.length + attachmentAdditions.length}</Label>
        {card.task.attachments.length > 0 && <StoredAttachments c={c} attachments={card.task.attachments} />}
        {canEditDraft && web ? <AttachmentPicker c={c} attachments={attachmentAdditions} pasteEnabled={pasteEnabled} existingCount={card.task.attachments.length} existingSize={existingAttachmentSize} disabled={busy} onChange={setAttachmentAdditions} onError={setFormError} onReadingChange={reading => { onCloseBlockedChange(reading); setReadingAttachments(reading); }} /> : card.task.attachments.length === 0 ? <Text style={{ color: c.foregroundMuted, fontSize: 11, marginBottom: 18 }}>无附件</Text> : <View style={{ marginBottom: 8 }} />}
        {canEditDraft && !web && <Text style={{ color: c.foregroundMuted, fontSize: 11, marginBottom: 18 }}>请在桌面端粘贴、拖拽或选择附件。</Text>}
      </>}
      {formError ? <Text accessibilityRole="alert" style={{ color: c.statusDanger, fontSize: 12, marginBottom: 10 }}>{formError}</Text> : null}
      <Button c={c} primary icon="Check" disabled={busy || readingAttachments || !dirty} onPress={() => { const parsed = parseTags(tags); if (!title.trim()) { setFormError('请填写任务标题。'); return; } if (title.length > MAX_TITLE_LENGTH || description.length > MAX_DESCRIPTION_LENGTH || parsed.length > 12 || parsed.some(t => t.length > 40)) { setFormError(`标题最多 ${MAX_TITLE_LENGTH} 字，说明最多 ${MAX_DESCRIPTION_LENGTH} 字，标签最多 12 个且各不超过 40 字。`); return; } setFormError(''); void save({ title: title.trim(), description, tags: parsed, priority, ...(canEditDraft && workspace !== card.workspaceId ? { workspaceId: workspace } : {}), ...(canEditDraft && attachmentAdditions.length ? { attachmentAdditions } : {}) }).then(ok => { if (ok) { setTitle(title.trim()); setTags(parsed.join(', ')); setAttachmentAdditions([]); } }); }}>保存修改</Button>
      <View style={{ height: 1, backgroundColor: c.border, marginVertical: 24 }} />
      <Label c={c}>移动到</Label><View style={{ ...wrap, marginBottom: 24 }}>{stages.map(stage => <Button key={stage} c={c} small icon={stageIcons[stage]} active={card.stage === stage} disabled={busy || dirty || stage === card.stage} onPress={() => void move(stage)}>{stageNames[stage]}</Button>)}</View>
      <Label c={c}>工作区</Label>
      {canEditDraft ? <WorkspacePicker c={c} workspaces={snapshot.workspaces} value={workspace} disabled={busy} onChange={setWorkspace} /> : <><Text style={{ color: c.foreground, fontSize: 12, marginBottom: 6 }}>{card.project} / {card.workspace}</Text><Text selectable style={{ color: c.foregroundMuted, fontSize: 10, lineHeight: 17, marginBottom: 16 }}>{card.cwd}</Text></>}
      <Label c={c}>执行 Agent</Label><Text style={{ color: c.foreground, fontSize: 12, marginBottom: 16 }}>{card.task?.provider ?? card.provider}</Text>
      {card.task && <><Label c={c}>运行模式</Label><Text testID="task-run-mode" style={{ color: c.foreground, fontSize: 12, marginBottom: 16 }}>{snapshot.modes.find(mode => mode.provider === card.provider && mode.id === taskModeId)?.label ?? taskModeId ?? 'Agent 默认'}</Text></>}
      {card.task && <><Label c={c}>Thinking Mode</Label><Text testID="task-thinking-mode" style={{ color: c.foreground, fontSize: 12, marginBottom: 16 }}>{taskModel?.thinkingOptions.find(option => option.id === taskThinkingOptionId)?.label ?? taskThinkingOptionId ?? (taskWasStarted ? '未记录（Agent 默认）' : 'Agent 默认')}</Text></>}
      {card.agent && <><Label c={c}>会话 ID</Label><Text selectable style={{ color: c.foregroundMuted, fontSize: 10, marginBottom: 18 }}>{card.agent.id}</Text></>}
      {card.task?.agentId && !card.agent && <Text style={{ color: c.statusWarning, fontSize: 11, lineHeight: 18 }}>关联会话已归档或不可用。任务记录仍然保留。</Text>}
      {savedWorkspaceAvailable && navigation && <View style={{ marginTop: 9 }}><Button c={c} icon="FolderOpen" disabled={dirty} onPress={() => navigation.openWorkspace({ workspaceId: card.workspaceId! })}>打开工作区</Button></View>}
      {card.task && !card.task.agentId && !card.task.launchState && <View style={{ marginTop: 24 }}><Button c={c} icon="Trash2" disabled={busy} onPress={() => { if (!confirmDelete) { setConfirmDelete(true); return; } void remove().then(ok => { if (ok) close(); }); }}>{confirmDelete ? '确认永久删除' : '删除未启动任务'}</Button><Text style={{ color: confirmDelete ? c.statusDanger : c.foregroundMuted, fontSize: 10, lineHeight: 18, marginTop: 8 }}>{confirmDelete ? '再次点击将删除任务及其附件，此操作无法撤销。' : '仅从未启动过的任务可以直接删除。'}</Text></View>}
      <View style={{ marginTop: 24 }}><Button c={c} icon={card.hidden ? 'ArchiveRestore' : 'Archive'} disabled={busy} onPress={() => void save({ hidden: !card.hidden }).then(ok => { if (ok) close(); })}>{card.hidden ? '恢复到看板' : '从看板收起'}</Button><Text style={{ color: c.foregroundMuted, fontSize: 10, lineHeight: 18, marginTop: 8 }}>收起仅整理看板，会话继续保留在 Paseo 中。</Text></View>
    </ScrollView>
    <Modal visible={Boolean(launchConflict)} transparent animationType="fade" onRequestClose={() => { if (!launching) setLaunchConflict(null); }}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <View accessibilityRole="alert" style={{ width: '100%', maxWidth: 430, backgroundColor: c.surface1, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 22 }}>
          <View style={{ ...row, gap: 9, marginBottom: 10 }}><Icon name="CircleAlert" size={18} color={c.statusWarning} /><Text style={{ flex: 1, color: c.foreground, fontSize: 16, fontWeight: '600' }}>这个工作区已有任务在执行</Text></View>
          <Text style={{ color: c.foregroundMuted, fontSize: 12, lineHeight: 19 }}>工作区“{launchConflict?.workspace.project} / {launchConflict?.workspace.name}”当前有 {launchConflict?.runningAgents.length ?? 0} 个任务正在执行：</Text>
          <View style={{ marginVertical: 12, gap: 7 }}>{launchConflict?.runningAgents.map(agent => <Text key={agent.id} numberOfLines={2} style={{ color: c.foreground, fontSize: 12 }}>• {agent.title}</Text>)}</View>
          <Text style={{ color: c.foregroundMuted, fontSize: 12, lineHeight: 19, marginBottom: 20 }}>同时执行可能修改相同文件。确定仍要开始当前任务吗？</Text>
          <View style={{ ...row, justifyContent: 'flex-end', gap: 9 }}><Button c={c} disabled={launching} onPress={() => setLaunchConflict(null)}>取消</Button><Button c={c} primary disabled={launching} onPress={() => void startLaunch(launchConflict?.workspace.id)}>{launching ? '正在启动…' : '仍要开始'}</Button></View>
        </View>
      </View>
    </Modal>
  </>;
}

function CreateForm({ c, snapshot, workspaceId, projectId, web, compact, shortcutEnabled, busy, defaultModel, projectBaseDirectory, initialTitle = '', initialDescription: inboxDescription = '', initialAttachments = [], inboxId, setDefaultModel, onDirtyChange, onCloseBlockedChange, close, createProject, create }: { c: Colors; snapshot?: Snapshot; workspaceId?: string; projectId: string; web: boolean; compact: boolean; shortcutEnabled: boolean; busy: boolean; defaultModel: string; projectBaseDirectory: string; initialTitle?: string; initialDescription?: string; initialAttachments?: TaskAttachment[]; inboxId?: string; setDefaultModel(model: string): void; onDirtyChange(dirty: boolean): void; onCloseBlockedChange(blocked: boolean): void; close(): void; createProject(input: CreateProjectWorkspaceInput): Promise<Workspace>; create(input: CreateInput, execute: boolean): Promise<boolean> }) {
  const [clientRequestId] = useState(clientUuid);
  const initialDescription = inboxId ? inboxDescription || initialTitle : '';
  const [title, setTitle] = useState(initialTitle), [description, setDescription] = useState(initialDescription), [tags, setTags] = useState('');
  const [attachments, setAttachments] = useState<CreateAttachmentInput[]>([]);
  const initialAttachmentSize = initialAttachments.reduce((sum, attachment) => sum + attachment.size, 0);
  const initialWorkspace = useRef(workspaceId ?? snapshot?.workspaces.find(w => !projectId || w.projectId === projectId)?.id ?? '').current;
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [createdWorkspaces, setCreatedWorkspaces] = useState<Workspace[]>([]);
  const availableModels = snapshot?.models ?? [];
  const initialProvider = useRef(availableModels.some(model => model.id === defaultModel) ? defaultModel : availableModels[0]?.id ?? '').current;
  const [provider, setProvider] = useState(initialProvider);
  const selectedModel = availableModels.find(model => model.id === provider);
  const selectableWorkspaces = [...new Map([...(snapshot?.workspaces ?? []), ...createdWorkspaces].map(w => [w.id, w])).values()];
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
  const presets = snapshot?.store.settings.modelPresets ?? [];
  const availableTaskTemplates = (snapshot?.store.settings.taskTemplates ?? []).map(template => ({ ...template, icon: 'FilePlus2' }));
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [priority, setPriority] = useState<CreateInput['priority']>('medium');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [readingAttachments, setReadingAttachments] = useState(false);
  const dirty = Boolean(title !== initialTitle || description !== initialDescription || tags || attachments.length || workspace !== initialWorkspace || provider !== initialProvider || modeId !== initialModeId || thinkingOptionId !== initialThinkingOptionId || priority !== 'medium');
  const submit = async (execute = false) => {
    if (busy || submitting || readingAttachments || !workspace || !provider) return;
    const parsed = parseTags(tags);
    if (!title.trim()) { setError('请填写任务标题。'); return; }
    if (title.length > MAX_TITLE_LENGTH || description.length > MAX_DESCRIPTION_LENGTH || parsed.length > 12 || parsed.some(t => t.length > 40)) { setError(`标题最多 ${MAX_TITLE_LENGTH} 字，说明最多 ${MAX_DESCRIPTION_LENGTH} 字，标签最多 12 个且各不超过 40 字。`); return; }
    onCloseBlockedChange(true); setSubmitting(true); setError('');
    const ok = await create({ clientRequestId, ...(inboxId ? { inboxId } : {}), title: title.trim(), description: description.trim(), tags: parsed, workspaceId: workspace, provider, modeId, thinkingOptionId, priority, attachments }, execute);
    if (!ok) { onCloseBlockedChange(false); setError('创建失败，任务尚未保存。请关闭弹窗查看错误详情后重试。'); setSubmitting(false); }
  };
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
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
    <View style={{ ...row, padding: compact ? 18 : 20, borderBottomWidth: 1, borderBottomColor: c.border }}><View style={{ flex: 1 }}><Text accessibilityRole="header" style={{ color: c.foreground, fontSize: compact ? 20 : 19, fontWeight: '700' }}>{inboxId ? compact ? '整理为任务' : '从 Inbox 创建任务' : '新建任务'}</Text><Text style={{ color: c.foregroundMuted, fontSize: compact ? 13 : 11, lineHeight: 19, marginTop: 6 }}>{inboxId ? '确认内容后创建待办。' : '写下目标，选择方案，即可创建。'}</Text></View><Button c={c} icon="X" label="关闭新建任务" onPress={close} disabled={submitting || readingAttachments} /></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: compact ? 18 : 22, paddingBottom: compact ? 28 : 22 }}>
      {!inboxId && <><View style={{ ...row, justifyContent: 'space-between', marginBottom: 8 }}><Label c={c}>常用任务模板</Label><Button c={c} small icon="Settings" label="管理任务模板" disabled={dirty || submitting || readingAttachments} onPress={openKanbanSettings}>管理模板</Button></View>{availableTaskTemplates.length ? <View accessibilityRole="radiogroup" accessibilityLabel="常用任务模板" style={{ ...wrap, marginBottom: 18 }}>
        {availableTaskTemplates.map(template => <Button key={template.id} c={c} small radio icon={template.icon} label={`任务模板 ${template.name}`} active={selectedTemplateId === template.id} onPress={() => { setSelectedTemplateId(template.id); setTitle(template.title); setDescription(template.description); setTags(template.tags.join(', ')); setPriority(template.priority); onDirtyChange(true); }}>{template.name}</Button>)}
      </View> : <Text style={{ color: c.foregroundMuted, fontSize: 12, lineHeight: 18, marginBottom: 18 }}>还没有自定义模板，可前往设置添加。</Text>}</>}
      <Input c={c} label="任务标题" value={title} onChangeText={value => { onDirtyChange(true); setTitle(value); }} maxLength={MAX_TITLE_LENGTH} placeholder="这次想完成什么？" />
      <Input c={c} label="任务说明" value={description} onChangeText={value => { onDirtyChange(true); setDescription(value); }} multiline maxLength={MAX_DESCRIPTION_LENGTH} placeholder="目标、涉及的文件，以及怎样才算完成…" />
      {(!compact || showAdvanced) && <><Label c={c}>图片与文件 · {initialAttachments.length + attachments.length}</Label>
        {initialAttachments.length > 0 && <StoredAttachments c={c} attachments={initialAttachments} />}
        {web ? <AttachmentPicker c={c} attachments={attachments} existingCount={initialAttachments.length} existingSize={initialAttachmentSize} disabled={busy || submitting} onChange={value => { onDirtyChange(true); setAttachments(value); }} onError={setError} onReadingChange={reading => { onCloseBlockedChange(reading || submitting); setReadingAttachments(reading); }} /> : <Text style={{ color: c.foregroundMuted, fontSize: 11, marginBottom: 18 }}>请在桌面端拖拽或选择附件。</Text>}</>}
      <Label c={c}>工作区</Label>
      <WorkspacePicker c={c} workspaces={selectableWorkspaces} value={workspace} disabled={busy || submitting} projectBaseDirectory={projectBaseDirectory} onCreateProject={async projectName => { const created = await createProject({ projectName }); setCreatedWorkspaces(current => [...current.filter(item => item.id !== created.id), created]); return created; }} onChange={id => { onDirtyChange(true); setWorkspace(id); }} />
      {!snapshot?.workspaces.length && !projectBaseDirectory && <Text style={{ color: c.statusWarning, fontSize: 12, marginBottom: 15 }}>请先在 Paseo 中创建工作区，或在插件设置中配置项目基础目录。</Text>}
      {presets.length > 0 && <><Label c={c}>执行方案</Label><View style={{ ...wrap, marginBottom: 18 }}>
        <Button c={c} small active={!selectedPresetId} onPress={() => setSelectedPresetId('')}>默认</Button>
        {presets.map(preset => { const available = availableModels.some(model => model.id === preset.provider && (!preset.thinkingOptionId || model.thinkingOptions.some(option => option.id === preset.thinkingOptionId))); return <Button key={preset.id} c={c} small active={selectedPresetId === preset.id} disabled={!available} onPress={() => { setSelectedPresetId(preset.id); setProvider(preset.provider); setThinkingSelection(preset.thinkingOptionId ? { model: preset.provider, id: preset.thinkingOptionId } : null); onDirtyChange(true); }}>{preset.name}</Button>; })}
      </View></>}
      {!snapshot?.models.length && <Text style={{ color: c.statusWarning, fontSize: 12, marginBottom: 15 }}>{snapshot?.providerError || '未发现可用模型，请先在 Paseo 配置提供商。'}</Text>}
      {compact && !showAdvanced && <Pressable accessibilityRole="button" accessibilityLabel="展开更多设置" onPress={() => setShowAdvanced(true)} style={({ pressed }) => ({ ...row, minHeight: 48, paddingHorizontal: 13, marginBottom: 20, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface0, opacity: pressed ? 0.72 : 1 })}><Icon name="SlidersHorizontal" size={16} color={c.foregroundMuted} /><Text style={{ flex: 1, color: c.foreground, fontSize: 14, fontWeight: '600', marginLeft: 10 }}>更多设置</Text><Text style={{ color: c.foregroundMuted, fontSize: 12 }}>权限、思考、标签</Text><Icon name="ChevronRight" size={16} color={c.foregroundMuted} /></Pressable>}
      {(!compact || showAdvanced) && <>
        <Label c={c}>Agent / 模型</Label><View style={{ ...wrap, marginBottom: 10 }}>{snapshot?.models.map(m => <Button key={m.id} c={c} small icon="Bot" active={provider === m.id} onPress={() => { onDirtyChange(true); setSelectedPresetId(''); setProvider(m.id); }}>{m.provider} / {m.label}</Button>)}</View>
        {provider && <View style={{ ...row, marginBottom: 20 }}><Button c={c} small icon={defaultModel === provider ? 'Star' : 'StarOff'} active={defaultModel === provider} onPress={() => setDefaultModel(provider)}>{defaultModel === provider ? '当前默认模型' : '设为默认模型'}</Button></View>}
        <Label c={c}>Thinking Mode</Label>
        <View accessibilityRole="radiogroup" accessibilityLabel="Thinking Mode" style={{ ...wrap, marginBottom: 20 }}>
          {thinkingOptions.map(option => <Button key={option.id} c={c} small radio label={`Thinking Mode ${option.label}`} active={thinkingOptionId === option.id} onPress={() => { onDirtyChange(true); setSelectedPresetId(''); setThinkingSelection({ model: provider, id: option.id }); }}>{option.label}</Button>)}
          {thinkingOptions.length === 0 && <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>当前模型不支持 Thinking Mode</Text>}
        </View>
        <Label c={c}>运行模式</Label>
        <View accessibilityRole="radiogroup" accessibilityLabel="运行模式" style={{ ...wrap, marginBottom: 20 }}>
          {modes.map(mode => <Button key={mode.id} c={c} small radio label={`运行模式 ${mode.label}`} active={modeId === mode.id} onPress={() => { onDirtyChange(true); setModeSelection({ provider: modeProvider, id: mode.id }); }}>{mode.label}</Button>)}
          {modes.length === 0 && <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>Agent 默认</Text>}
        </View>
        <Label c={c}>优先级</Label><View style={{ ...wrap, marginBottom: 20 }}>{(['high', 'medium', 'low'] as const).map(p => <Button key={p} c={c} small active={p === priority} onPress={() => { onDirtyChange(true); setPriority(p); }}>{priorityNames[p]}</Button>)}</View>
        <Input c={c} label="标签（逗号分隔）" value={tags} onChangeText={value => { onDirtyChange(true); setTags(value); }} placeholder="例如：体验优化, 本周" />
      </>}
      {error && <Text accessibilityRole="alert" style={{ color: c.statusDanger, marginBottom: 12, fontSize: 12 }}>{error}</Text>}
      <View style={{ ...row, gap: 8, flexWrap: 'wrap' }}><View style={{ flex: 1, minWidth: 140 }}><Button c={c} large={compact} icon="Plus" label="创建待办任务" disabled={busy || submitting || readingAttachments || !workspace || !provider} onPress={() => void submit()}>{submitting ? '正在保存…' : '创建任务'}</Button></View><View style={{ flex: 1, minWidth: 140 }}><Button c={c} large={compact} primary icon="Play" label="创建并执行任务" disabled={busy || submitting || readingAttachments || !workspace || !provider} onPress={() => void submit(true)}>{submitting ? '正在保存…' : '创建并执行'}</Button></View></View>
      {!compact && <Text style={{ color: c.foregroundMuted, fontSize: 10, marginTop: 8, textAlign: 'center' }}>快捷键：Ctrl+Enter</Text>}
    </ScrollView>
  </>;
}
