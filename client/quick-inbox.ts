export const INBOX_CHANGED_EVENT = 'paseo-kanban:inbox-changed';
export const QUICK_INBOX_MODAL_TEST_ID = 'quick-inbox-modal';

export interface QuickInboxPalette {
  surface0: string;
  surface1: string;
  surface2: string;
  border: string;
  foreground: string;
  foregroundMuted: string;
  accent: string;
  accentForeground: string;
  statusDanger: string;
}

let hostPalette: QuickInboxPalette | undefined;
export function setQuickInboxPalette(palette: QuickInboxPalette) { hostPalette = palette; }

const paseoPalettes: QuickInboxPalette[] = [
  { surface0: '#ffffff', surface1: '#fafafa', surface2: '#f4f4f5', border: '#e4e4e7', foreground: '#1a1a1e', foregroundMuted: '#71717a', accent: '#20744a', accentForeground: '#ffffff', statusDanger: '#9d433b' },
  { surface0: '#181b1a', surface1: '#1e2120', surface2: '#272a29', border: '#252b2a', foreground: '#fafafa', foregroundMuted: '#a1a5a4', accent: '#20744a', accentForeground: '#ffffff', statusDanger: '#d8847b' },
  { surface0: '#18181b', surface1: '#1f1f22', surface2: '#27272a', border: '#27272a', foreground: '#fafafa', foregroundMuted: '#a1a1aa', accent: '#e4e4e7', accentForeground: '#18181b', statusDanger: '#d8847b' },
  { surface0: '#161820', surface1: '#1c1e27', surface2: '#252731', border: '#242636', foreground: '#fafafa', foregroundMuted: '#9a9db0', accent: '#3b6fcf', accentForeground: '#ffffff', statusDanger: '#d8847b' },
  { surface0: '#1f1f1e', surface1: '#262523', surface2: '#2f2d2b', border: '#2c2a27', foreground: '#fafafa', foregroundMuted: '#ada9a5', accent: '#d97757', accentForeground: '#ffffff', statusDanger: '#d8847b' },
  { surface0: '#282c34', surface1: '#2f333d', surface2: '#383c48', border: '#353a47', foreground: '#fafafa', foregroundMuted: '#c8ccd8', accent: '#89b4fa', accentForeground: '#ffffff', statusDanger: '#d8847b' },
  { surface0: '#000000', surface1: '#0a0a0a', surface2: '#111111', border: '#1c1c1c', foreground: '#fafafa', foregroundMuted: '#a1a1aa', accent: '#20744a', accentForeground: '#ffffff', statusDanger: '#d8847b' },
];

function colorKey(color: string) {
  const hex = color.match(/^#([\da-f]{6})$/i)?.[1];
  if (hex) return `${parseInt(hex.slice(0, 2), 16)},${parseInt(hex.slice(2, 4), 16)},${parseInt(hex.slice(4, 6), 16)}`;
  const channels = color.match(/[\d.]+/g)?.map(Number);
  if (!channels || channels.length < 3 || (channels.length > 3 && channels[3] < 1)) return undefined;
  return `${channels[0]},${channels[1]},${channels[2]}`;
}

function visibleHostColors(ownerDocument: Document) {
  const view = ownerDocument.defaultView;
  const elements = new Set<Element>([ownerDocument.documentElement, ownerDocument.body]);
  if (view) {
    for (const x of [1, view.innerWidth / 4, view.innerWidth / 2, view.innerWidth * 3 / 4, view.innerWidth - 1]) {
      for (const y of [1, view.innerHeight / 4, view.innerHeight / 2, view.innerHeight * 3 / 4, view.innerHeight - 1]) {
        for (const element of ownerDocument.elementsFromPoint(x, y)) elements.add(element);
      }
    }
    for (const element of Array.from(ownerDocument.querySelectorAll('button, [role="button"], input')).slice(0, 100)) elements.add(element);
  }
  const backgrounds = new Set<string>();
  const borders = new Set<string>();
  const foregrounds = new Set<string>();
  for (const element of elements) {
    if (!view || (!(element === ownerDocument.body || element === ownerDocument.documentElement) && !element.getClientRects().length)) continue;
    const style = view.getComputedStyle(element);
    const background = colorKey(style.backgroundColor);
    const border = colorKey(style.borderTopColor);
    const foreground = colorKey(style.color);
    if (background) backgrounds.add(background);
    if (border) borders.add(border);
    if (foreground) foregrounds.add(foreground);
  }
  return { backgrounds, borders, foregrounds };
}

function paletteScore(palette: QuickInboxPalette, colors: ReturnType<typeof visibleHostColors>) {
  const background = (color: string) => colors.backgrounds.has(colorKey(color) ?? '');
  return (background(palette.surface0) ? 8 : 0)
    + (background(palette.surface1) ? 6 : 0)
    + (background(palette.surface2) ? 4 : 0)
    + (background(palette.accent) ? 7 : 0)
    + (colors.borders.has(colorKey(palette.border) ?? '') ? 3 : 0)
    + (colors.foregrounds.has(colorKey(palette.foreground) ?? '') ? 2 : 0)
    + (colors.foregrounds.has(colorKey(palette.foregroundMuted) ?? '') ? 1 : 0);
}

function resolvePalette(ownerDocument: Document): QuickInboxPalette {
  const colors = visibleHostColors(ownerDocument);
  const candidates = hostPalette ? [hostPalette, ...paseoPalettes] : paseoPalettes;
  const ranked = candidates.map(palette => ({ palette, score: paletteScore(palette, colors) })).sort((a, b) => b.score - a.score);
  if (ranked[0]?.score) return ranked[0].palette;

  // A host with no painted surface is unusual, but preserving the last theme is
  // more consistent than inventing a second, unrelated light/dark color system.
  return hostPalette ?? paseoPalettes[ownerDocument.defaultView?.matchMedia('(prefers-color-scheme: dark)').matches ? 1 : 0];
}

type InboxShortcutEvent = Pick<KeyboardEvent, 'altKey' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey'>;

export function isOpenInboxShortcut(event: InboxShortcutEvent) {
  return event.code === 'KeyI'
    && event.ctrlKey
    && event.shiftKey
    && !event.altKey
    && !event.metaKey;
}

export function registerOpenInboxShortcut(openInbox: () => void, target: EventTarget | undefined = typeof document === 'undefined' ? undefined : document) {
  if (!target) return () => {};
  const options = { capture: true };
  const onKeyDown = (event: Event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.repeat || keyboardEvent.isComposing || !isOpenInboxShortcut(keyboardEvent)) return;
    keyboardEvent.preventDefault();
    keyboardEvent.stopImmediatePropagation();
    openInbox();
  };
  target.addEventListener('keydown', onKeyDown, options);
  return () => target.removeEventListener('keydown', onKeyDown, options);
}

export function installQuickInbox(
  save: (input: { clientRequestId: string; title: string }) => Promise<unknown>,
  ownerDocument: Document | undefined = typeof document === 'undefined' ? undefined : document,
) {
  if (!ownerDocument) return () => {};
  let overlay: HTMLDivElement | null = null;
  let saving = false;
  let restoreFocus: HTMLElement | null = null;
  let inertBackground: Array<{ element: HTMLElement; inert: boolean }> = [];

  const dismiss = () => {
    overlay?.remove();
    overlay = null;
    for (const { element, inert } of inertBackground) element.inert = inert;
    inertBackground = [];
    if (restoreFocus?.isConnected) restoreFocus.focus();
    restoreFocus = null;
  };
  const close = () => { if (!saving) dismiss(); };
  const open = () => {
    if (overlay) {
      overlay.querySelector<HTMLInputElement>('input')?.focus();
      return;
    }
    const requestId = crypto.randomUUID();
    const palette = resolvePalette(ownerDocument);
    restoreFocus = ownerDocument.activeElement instanceof HTMLElement ? ownerDocument.activeElement : null;
    overlay = ownerDocument.createElement('div');
    overlay.dataset.testid = QUICK_INBOX_MODAL_TEST_ID;
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:flex;align-items:flex-start;justify-content:center;padding:18vh 20px 20px;background:rgba(0,0,0,.58);font-family:inherit;';
    const dialog = ownerDocument.createElement('form');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'paseo-kanban-quick-inbox-title');
    dialog.style.cssText = `box-sizing:border-box;width:min(560px,100%);padding:20px;border:1px solid ${palette.border};border-radius:14px;background:${palette.surface1};color:${palette.foreground};box-shadow:0 22px 70px rgba(0,0,0,.42);`;
    dialog.innerHTML = `
      <div data-role="header" style="display:flex;align-items:center;gap:12px">
        <div data-role="icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16l2 10v6H2v-6Z"/><path d="M2 14h6l2 3h4l2-3h6"/></svg></div>
        <div style="flex:1;min-width:0"><h2 id="paseo-kanban-quick-inbox-title" style="margin:0;font-size:18px;line-height:1.4;font-weight:600">快速添加到 Inbox</h2><p data-role="subtitle" style="margin:5px 0 0;font-size:11px;line-height:17px">先记下任务名称，稍后在看板中补充工作区和执行设置。</p></div>
        <kbd data-role="shortcut">Ctrl+Shift+I</kbd>
      </div>
      <label for="paseo-kanban-quick-inbox-input" style="display:block;margin:18px 0 8px;font-size:11px;font-weight:600">任务名称</label>
      <input id="paseo-kanban-quick-inbox-input" maxlength="180" autocomplete="off" placeholder="需要完成什么？" />
      <div data-role="error" role="alert" style="display:none;margin-top:9px;font-size:11px"></div>
      <div style="display:flex;justify-content:flex-end;align-items:center;gap:9px;margin-top:18px">
        <button data-role="cancel" type="button">取消</button>
        <button data-role="save" type="submit">添加到 Inbox</button>
      </div>`;
    const input = dialog.querySelector<HTMLInputElement>('input')!;
    const cancel = dialog.querySelector<HTMLButtonElement>('[data-role="cancel"]')!;
    const submit = dialog.querySelector<HTMLButtonElement>('[data-role="save"]')!;
    const error = dialog.querySelector<HTMLDivElement>('[data-role="error"]')!;
    const icon = dialog.querySelector<HTMLDivElement>('[data-role="icon"]')!;
    const shortcut = dialog.querySelector<HTMLElement>('[data-role="shortcut"]')!;
    const subtitle = dialog.querySelector<HTMLElement>('[data-role="subtitle"]')!;
    input.style.cssText = `box-sizing:border-box;width:100%;height:42px;padding:0 11px;border:1px solid ${palette.border};border-radius:7px;background:${palette.surface0};color:${palette.foreground};font:12px inherit;outline:none;`;
    cancel.style.cssText = `height:36px;padding:0 13px;border:1px solid ${palette.border};border-radius:7px;background:${palette.surface1};color:${palette.foreground};font:600 12px inherit;cursor:pointer;`;
    submit.style.cssText = `height:36px;padding:0 15px;border:1px solid ${palette.accent};border-radius:7px;background:${palette.accent};color:${palette.accentForeground};font:600 12px inherit;cursor:pointer;`;
    icon.style.cssText = `box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:36px;height:36px;flex:0 0 36px;border:1px solid ${palette.border};border-radius:8px;background:${palette.surface2};color:${palette.accent};`;
    shortcut.style.cssText = `padding:5px 7px;border:1px solid ${palette.border};border-radius:5px;background:${palette.surface0};color:${palette.foregroundMuted};font:10px ui-monospace,monospace;white-space:nowrap;`;
    subtitle.style.color = palette.foregroundMuted;
    error.style.color = palette.statusDanger;
    input.addEventListener('focus', () => { input.style.borderColor = palette.accent; });
    input.addEventListener('blur', () => { input.style.borderColor = palette.border; });
    overlay.appendChild(dialog);
    ownerDocument.body.appendChild(overlay);
    inertBackground = Array.from(ownerDocument.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlay)
      .map(element => ({ element, inert: element.inert }));
    for (const { element } of inertBackground) element.inert = true;
    cancel.addEventListener('click', close);
    overlay.addEventListener('mousedown', event => { if (event.target === overlay) close(); });
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') {
        const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled])'));
        if (!focusable.length) { event.preventDefault(); return; }
        const index = focusable.indexOf(ownerDocument.activeElement as HTMLElement);
        const next = event.shiftKey ? (index <= 0 ? focusable.length - 1 : index - 1) : (index < 0 || index === focusable.length - 1 ? 0 : index + 1);
        event.preventDefault();
        focusable[next].focus();
      }
    });
    dialog.addEventListener('submit', async event => {
      event.preventDefault();
      const title = input.value.trim();
      if (!title) {
        error.textContent = '请输入任务名称。';
        error.style.display = 'block';
        input.focus();
        return;
      }
      if (saving) return;
      saving = true;
      input.disabled = cancel.disabled = submit.disabled = true;
      dialog.tabIndex = -1;
      dialog.focus();
      submit.textContent = '正在保存…';
      error.style.display = 'none';
      try {
        await save({ clientRequestId: requestId, title });
        saving = false;
        dismiss();
        ownerDocument.dispatchEvent(new Event(INBOX_CHANGED_EVENT));
      } catch (cause) {
        saving = false;
        input.disabled = cancel.disabled = submit.disabled = false;
        submit.textContent = '添加到 Inbox';
        error.textContent = cause instanceof Error ? cause.message : String(cause);
        error.style.display = 'block';
        input.focus();
      }
    });
    input.focus();
  };
  const unregister = registerOpenInboxShortcut(open, ownerDocument);
  return () => {
    unregister();
    saving = false;
    dismiss();
  };
}
