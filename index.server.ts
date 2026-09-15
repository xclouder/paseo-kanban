import type { PluginServerContext } from '@getpaseo/plugin/server';
import { addInboxEntry, archiveDoneCards, completeReviewCards, createProjectWorkspace, createTask, deleteInboxEntry, deleteTask, launchTask, moveCard, organizeProjects, patchCard, patchInboxEntry, readBoard, readKanbanSettings, saveKanbanSettings } from './shared/contracts';
import { addInbox, archiveDone, completeReview, create, createProjectWorkspace as createProjectWorkspaceHandler, deleteInbox, launch, move, organize, patch, patchInbox, read, readSettings, remove, saveSettings } from './server/handlers';

export default function contribute(server: PluginServerContext) {
  server.handle(readBoard, read);
  server.handle(readKanbanSettings, readSettings);
  server.handle(saveKanbanSettings, saveSettings);
  server.handle(organizeProjects, organize);
  server.handle(patchCard, patch);
  server.handle(moveCard, move);
  server.handle(completeReviewCards, completeReview);
  server.handle(archiveDoneCards, archiveDone);
  server.handle(addInboxEntry, addInbox);
  server.handle(patchInboxEntry, patchInbox);
  server.handle(deleteInboxEntry, deleteInbox);
  server.handle(createTask, create);
  server.handle(createProjectWorkspace, createProjectWorkspaceHandler);
  server.handle(launchTask, launch);
  server.handle(deleteTask, remove);
  return () => {};
}
