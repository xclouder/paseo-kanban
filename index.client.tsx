import type { PluginClientContext } from '@getpaseo/plugin/client';
import { Platform } from 'react-native';
import { KanbanSurface, KanbanWorkspace } from './client/board';
import { openBoardSurfaceOnce, registerOpenBoardShortcut } from './client/board-shortcut';
import { installQuickInbox } from './client/quick-inbox';
import { addInboxEntry } from './shared/contracts';
import { KanbanSettings } from './client/settings';
import { installOpenKanbanSettings } from './client/open-settings';

export default function contribute(client: PluginClientContext) {
  const openBoard = () => openBoardSurfaceOnce(() => client.openSurface('board'));
  const cleanups: Array<() => void> = [];
  try {
    cleanups.push(installOpenKanbanSettings(() => client.openSettings('paseo-kanban')));
    cleanups.push(client.addSettingsScreen({ id: 'paseo-kanban', title: '任务看板设置', icon: 'Settings', Component: KanbanSettings }));
    cleanups.push(client.addSurface('board', KanbanSurface));
    cleanups.push(client.addSidebarItem({ id: 'board', title: '任务看板', icon: 'PanelsTopLeft', surface: 'board' }));
    cleanups.push(client.addWorkspacePanel({ id: 'workspace-board', title: '任务看板', icon: 'PanelsTopLeft', context: 'workspace', locations: ['workspace', 'explorer'], Component: KanbanWorkspace }));
    cleanups.push(client.addCommandCenterItem({ id: 'open-board', title: '打开全局任务看板', icon: 'PanelsTopLeft', keywords: ['kanban', 'board', '任务', '会话'], context: 'global', onSelect({ openSurface }) { openBoardSurfaceOnce(() => openSurface('board')); } }));
    cleanups.push(client.addCommandCenterItem({ id: 'open-workspace-board', title: '打开工作区看板', icon: 'PanelsTopLeft', keywords: ['kanban', '任务'], context: 'workspace', onSelect({ openPanel }) { openPanel('workspace-board'); } }));
    if (Platform.OS === 'web') {
      cleanups.push(registerOpenBoardShortcut(openBoard));
      cleanups.push(installQuickInbox(input => client.rpc(addInboxEntry, input)));
    }
  } catch (cause) {
    for (let index = cleanups.length - 1; index >= 0; index -= 1) cleanups[index]();
    throw cause;
  }
  return () => {
    for (let index = cleanups.length - 1; index >= 0; index -= 1) cleanups[index]();
  };
}
