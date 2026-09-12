import type { PluginContext } from '@getpaseo/plugin';
import { KanbanSurface, KanbanWorkspace } from './src/board.client';
import { readBoard, patchCard, moveCard, completeReviewCards, createTask, launchTask, deleteTask } from './src/contracts.shared';
import { read, patch, move, completeReview, create, launch, remove } from './src/handlers.server';
import { organizeProjects } from './src/contracts.shared';
import { organize } from './src/handlers.server';

export default function contribute(plugin: PluginContext) {
  plugin.addSurface('board', KanbanSurface);
  plugin.addSidebarItem({ id: 'board', title: '任务看板', icon: 'PanelsTopLeft', surface: 'board' });
  plugin.addWorkspacePanel({ id: 'workspace-board', title: '任务看板', icon: 'PanelsTopLeft', context: 'workspace', locations: ['workspace', 'explorer'], Component: KanbanWorkspace });
  plugin.addCommandCenterItem({ id: 'open-board', title: '打开全局任务看板', icon: 'PanelsTopLeft', keywords: ['kanban', 'board', '任务', '会话'], context: 'global', onSelect({ openSurface }) { openSurface('board'); } });
  plugin.addCommandCenterItem({ id: 'open-workspace-board', title: '打开工作区看板', icon: 'PanelsTopLeft', keywords: ['kanban', '任务'], context: 'workspace', onSelect({ openPanel }) { openPanel('workspace-board'); } });
  plugin.handle(readBoard, read);
  plugin.handle(organizeProjects, organize);
  plugin.handle(patchCard, patch);
  plugin.handle(moveCard, move);
  plugin.handle(completeReviewCards, completeReview);
  plugin.handle(createTask, create);
  plugin.handle(launchTask, launch);
  plugin.handle(deleteTask, remove);
  return () => {};
}
