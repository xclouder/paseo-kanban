type BoardShortcutEvent = Pick<KeyboardEvent, 'altKey' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey'>;

export const BOARD_KEYBOARD_SCOPE_TEST_ID_PREFIX = 'paseo-kanban-keyboard-scope-';

const boardSurfacePath = /\/plugin\/paseo-kanban\/surface\/board\/?$/;

export function isOpenBoardShortcut(event: BoardShortcutEvent) {
  return event.code === 'KeyK'
    && event.shiftKey
    && !event.altKey
    && (event.ctrlKey || event.metaKey);
}

export function isBoardSurfacePath(pathname: string) {
  return boardSurfacePath.test(pathname);
}

export function openBoardSurfaceOnce(openBoard: () => void, pathname: string = globalThis.location?.pathname ?? '') {
  if (isBoardSurfacePath(pathname)) return false;
  openBoard();
  return true;
}

function isVisibleBoardScope(element: Element) {
  if (!(element instanceof HTMLElement) || !element.isConnected) return false;
  if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  const style = globalThis.getComputedStyle?.(element);
  if (style?.display === 'none' || style?.visibility === 'hidden') return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0
    && rect.height > 0
    && rect.right > 0
    && rect.bottom > 0
    && rect.left < globalThis.innerWidth
    && rect.top < globalThis.innerHeight;
}

export function isActiveBoardKeyboardScope(testId: string, root: ParentNode | undefined = typeof document === 'undefined' ? undefined : document) {
  if (!root) return false;
  const scopes = Array.from(root.querySelectorAll(`[data-testid^="${BOARD_KEYBOARD_SCOPE_TEST_ID_PREFIX}"]`)).filter(isVisibleBoardScope);
  return scopes.at(-1)?.getAttribute('data-testid') === testId;
}

export function registerOpenBoardShortcut(openBoard: () => void, target: EventTarget | undefined = typeof document === 'undefined' ? undefined : document, pathname: () => string = () => globalThis.location?.pathname ?? '') {
  if (!target) return () => {};
  const options = { capture: true };
  const onKeyDown = (event: Event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.repeat || keyboardEvent.isComposing || !isOpenBoardShortcut(keyboardEvent)) return;
    keyboardEvent.preventDefault();
    keyboardEvent.stopImmediatePropagation();
    openBoardSurfaceOnce(openBoard, pathname());
  };
  target.addEventListener('keydown', onKeyDown, options);
  return () => target.removeEventListener('keydown', onKeyDown, options);
}
