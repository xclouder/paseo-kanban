import { createElement, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import type { PluginTheme } from '@getpaseo/plugin';

export function InboxDialog({ colors, title, close, children }: { colors: PluginTheme['colors']; title: string; close(): void; children: ReactNode }) {
  const heading = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const drag = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const [size, setSize] = useState({ width: 540, height: 480 });
  useLayoutEffect(() => {
    const panel = dialog.current;
    if (!panel) return;
    panel.showModal();
    return () => panel.close();
  }, []);

  const resize = (width: number, height: number) => setSize({
    width: Math.min(innerWidth - 32, Math.max(360, width)),
    height: Math.min(innerHeight - 32, Math.max(320, height)),
  });
  return createElement('dialog', {
    ref: dialog, 'data-kanban-inbox-editor': '', 'aria-labelledby': heading,
    onCancel: (event: Event) => { event.preventDefault(); close(); },
    style: { ...size, position: 'fixed', inset: 0, margin: 'auto', boxSizing: 'border-box', maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 32px)', padding: 0, borderRadius: 12, border: `1px solid ${colors.border}`, background: colors.surface1, color: colors.foreground },
  }, createElement('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box', padding: '18px 20px 26px', gap: 12 } },
    createElement('h2', { id: heading, style: { fontSize: 16, margin: 0 } }, title),
    createElement('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'auto', padding: 2 } }, children),
    createElement('button', {
      type: 'button', 'aria-label': '调整窗口大小', 'aria-description': '使用方向键调整宽度和高度',
      style: { position: 'absolute', right: 0, bottom: 0, width: 24, height: 24, color: colors.foregroundMuted, background: 'transparent', border: 0, cursor: 'nwse-resize', touchAction: 'none' },
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0 || !dialog.current) return;
        const { width, height } = dialog.current.getBoundingClientRect();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { width, height, x: event.clientX, y: event.clientY };
      },
      onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
        const start = drag.current;
        if (start) resize(start.width + 2 * (event.clientX - start.x), start.height + 2 * (event.clientY - start.y));
      },
      onLostPointerCapture: () => { drag.current = null; },
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
        if (!dialog.current) return;
        const { width, height } = dialog.current.getBoundingClientRect();
        switch (event.key) {
          case 'ArrowLeft': resize(width - 24, height); break;
          case 'ArrowRight': resize(width + 24, height); break;
          case 'ArrowUp': resize(width, height - 24); break;
          case 'ArrowDown': resize(width, height + 24); break;
          default: return;
        }
        event.preventDefault();
      },
    }, '◢'),
  ));
}
