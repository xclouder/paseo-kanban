type BoardShortcutEvent = Pick<KeyboardEvent, 'altKey' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey'>;

export function isOpenBoardShortcut(event: BoardShortcutEvent) {
  return event.code === 'KeyK'
    && event.shiftKey
    && !event.altKey
    && (event.ctrlKey || event.metaKey);
}

export function registerOpenBoardShortcut(openBoard: () => void, target: EventTarget | undefined = typeof document === 'undefined' ? undefined : document) {
  if (!target) return () => {};
  const options = { capture: true };
  const onKeyDown = (event: Event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.repeat || keyboardEvent.isComposing || !isOpenBoardShortcut(keyboardEvent)) return;
    keyboardEvent.preventDefault();
    keyboardEvent.stopPropagation();
    openBoard();
  };
  target.addEventListener('keydown', onKeyDown, options);
  return () => target.removeEventListener('keydown', onKeyDown, options);
}
