import { createElement, useState, type DragEvent, type MouseEvent, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import type { PluginTheme } from '@getpaseo/plugin';

type Colors = PluginTheme['colors'];
type MenuAnchor = { x: number; y: number };
const projectMime = 'application/x-paseo-sidebar-project';
const groupMime = 'application/x-paseo-sidebar-group';

/** Browser-only project drag/drop and context-menu trigger. Native always renders a plain View. */
export function WebSortTarget({ enabled, disabled, c, drag, onProject, onGroup, onContextMenu, children }: {
  enabled: boolean; disabled: boolean; c: Colors; drag?: { kind: 'project' | 'group'; id: string };
  onProject?(id: string): void; onGroup?(id: string): void; onContextMenu?(anchor: MenuAnchor): void; children: ReactNode;
}) {
  const [over, setOver] = useState<'insert' | 'group' | null>(null);
  if (Platform.OS !== 'web' || !enabled) return createElement(View, null, children);
  return createElement('div', {
    draggable: Boolean(drag && !disabled),
    style: { borderRadius: 6, boxShadow: over === 'group' ? `inset 0 0 0 2px ${c.accent}` : over === 'insert' ? `inset 0 2px ${c.accent}` : undefined },
    onContextMenu: (event: MouseEvent) => {
      if (!onContextMenu || disabled) return;
      event.preventDefault();
      onContextMenu({ x: event.clientX, y: event.clientY });
    },
    onDragStart: (event: DragEvent) => {
      if (!drag || disabled) return;
      event.stopPropagation();
      event.dataTransfer.setData(drag.kind === 'project' ? projectMime : groupMime, drag.id);
      event.dataTransfer.effectAllowed = 'move';
    },
    onDragOver: (event: DragEvent) => {
      if (disabled || !(onProject && event.dataTransfer.types.includes(projectMime) || onGroup && event.dataTransfer.types.includes(groupMime))) return;
      event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move';
      setOver(onGroup && event.dataTransfer.types.includes(projectMime) ? 'group' : 'insert');
    },
    onDragLeave: () => setOver(null),
    onDrop: (event: DragEvent) => {
      setOver(null);
      if (disabled) return;
      const project = event.dataTransfer.getData(projectMime), group = event.dataTransfer.getData(groupMime);
      if (project && onProject || group && onGroup) {
        event.preventDefault(); event.stopPropagation();
        if (project && onProject) onProject(project);
        else if (group && onGroup) onGroup(group);
      }
    },
  }, children);
}

/** Browser-only card drag source. Native always renders a plain View. */
export function WebDragItem({ id, enabled, children, onDrag }: { id: string; enabled: boolean; children: ReactNode; onDrag(id: string | null): void }) {
  if (Platform.OS !== 'web' || !enabled) return createElement(View, null, children);
  return createElement('div', {
    draggable: true,
    style: { minWidth: 0, width: '100%' },
    onDragStart: (event: DragEvent) => { event.dataTransfer.setData('application/x-paseo-kanban', id); event.dataTransfer.effectAllowed = 'move'; onDrag(id); },
    onDragEnd: () => onDrag(null),
  }, children);
}

/** Browser-only card drop target. Native always renders a plain View. */
export function WebDropZone({ enabled, onDrop, children, item = false }: { enabled: boolean; onDrop(id: string): void; children: ReactNode; item?: boolean }) {
  if (Platform.OS !== 'web' || !enabled) return createElement(View, { style: item ? { flexShrink: 0 } : { flex: 1 } }, children);
  return createElement('div', {
    style: { display: 'flex', flexDirection: 'column', width: '100%', flex: item ? '0 0 auto' : '1 1 0%', minHeight: item ? undefined : 100 },
    onDragOver: (event: DragEvent) => { if (event.dataTransfer.types.includes('application/x-paseo-kanban')) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } },
    onDrop: (event: DragEvent) => { const id = event.dataTransfer.getData('application/x-paseo-kanban'); if (id) { event.preventDefault(); event.stopPropagation(); onDrop(id); } },
  }, children);
}
