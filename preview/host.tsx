import { createElement } from 'react';
import type { PluginIconProps } from '@getpaseo/plugin';

const paths: Record<string, string[]> = {
  Plus: ['M12 5v14', 'M5 12h14'], X: ['m6 6 12 12', 'M6 18 18 6'], Search: ['M21 21l-4.5-4.5', 'M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0'],
  Check: ['m5 12 4 4L19 6'], RefreshCw: ['M20 7v5h-5', 'M4 17v-5h5', 'M5.1 8A7 7 0 0 1 17 5l3 7', 'M4 12l3 7a7 7 0 0 0 11.9-3'],
  Pin: ['m16 3 5 5-4 1-3 5 1 3-8-8 3 1 5-3Z', 'm2 22 7-7'], ArrowUpRight: ['M7 17 17 7', 'M7 7h10v10'],
  Bot: ['M12 3v3', 'M8 3h4', 'M5 7h14v13H5Z', 'M9 12v2', 'M15 12v2', 'M2 11v5', 'M22 11v5'],
  PanelsTopLeft: ['M3 3h18v18H3Z', 'M3 8h18', 'M8 8v13'], PanelRight: ['M3 3h18v18H3Z', 'M15 3v18'],
  LayoutGrid: ['M3 3h7v7H3Z', 'M14 3h7v7h-7Z', 'M3 14h7v7H3Z', 'M14 14h7v7h-7Z'],
  FolderGit2: ['M3 20V4h6l2 3h10v13Z', 'M10 12v4h5', 'M15 12v5'], FolderOpen: ['M3 20V4h6l2 3h10v3', 'M3 20l4-9h15l-4 9Z'],
  Archive: ['M3 3h18v5H3Z', 'M5 8v13h14V8', 'M10 12h4'], ArchiveRestore: ['M3 3h18v5H3Z', 'M5 8v13h4', 'M19 8v13h-4', 'M12 12v10', 'm9 15 3-3 3 3'],
  Inbox: ['M4 4h16l2 10v6H2v-6Z', 'M2 14h6l2 3h4l2-3h6'], CircleAlert: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', 'M12 7v6', 'M12 16v.5'],
  CircleCheck: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', 'm8 12 3 3 5-6'], CircleDot: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', 'M13 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0'],
  CircleDashed: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0'], CirclePlay: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', 'm10 8 6 4-6 4Z'], Play: ['m7 4 14 8-14 8Z'],
  SignalHigh: ['M4 20v-4', 'M9 20v-8', 'M14 20V8', 'M19 20V4'], GripVertical: ['M9 5v1', 'M15 5v1', 'M9 11v1', 'M15 11v1', 'M9 17v1', 'M15 17v1'],
  FlaskConical: ['M9 3h6', 'M10 3v6L4 19q-1 2 2 2h12q3 0 2-2L14 9V3', 'M7 15h10'],
  Paperclip: ['m21.4 11.6-8.9 8.9a6 6 0 0 1-8.5-8.5l9.6-9.6a4 4 0 0 1 5.7 5.7l-9.6 9.6a2 2 0 1 1-2.8-2.8l8.9-8.9'],
  File: ['M6 2h9l5 5v15H6Z', 'M14 2v6h6'], Trash2: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 16H6L5 6', 'M10 11v6', 'M14 11v6'],
};
export function Icon({ name, size = 16, color }: PluginIconProps) {
  return createElement('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, style: { flexShrink: 0 } }, ...(paths[name] ?? paths.CircleDot).map((d, i) => createElement('path', { d, key: i })));
}
export function useRpc() { throw new Error('Preview must use the injected BoardApi.'); }
