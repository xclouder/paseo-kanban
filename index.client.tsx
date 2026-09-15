import type { PluginClientContext } from '@getpaseo/plugin/client';
import { KanbanSurface, KanbanWorkspace } from './client/board';
import { registerOpenBoardShortcut } from './client/board-shortcut';

export default function contribute(client: PluginClientContext) {
  const cleanups = [
    client.addSurface('board', KanbanSurface),
    client.addSidebarItem({ id: 'board', title: '任务看板', icon: 'PanelsTopLeft', surface: 'board' }),
    client.addWorkspacePanel({ id: 'workspace-board', title: '任务看板', icon: 'PanelsTopLeft', context: 'workspace', locations: ['workspace', 'explorer'], Component: KanbanWorkspace }),
    client.addCommandCenterItem({ id: 'open-board', title: '打开全局任务看板', icon: 'PanelsTopLeft', keywords: ['kanban', 'board', '任务', '会话'], context: 'global', onSelect({ openSurface }) { openSurface('board'); } }),
    client.addCommandCenterItem({ id: 'open-workspace-board', title: '打开工作区看板', icon: 'PanelsTopLeft', keywords: ['kanban', '任务'], context: 'workspace', onSelect({ openPanel }) { openPanel('workspace-board'); } }),
    registerOpenBoardShortcut(() => client.openSurface('board')),
  ];
  return () => {
    for (let index = cleanups.length - 1; index >= 0; index -= 1) cleanups[index]();
  };
}
