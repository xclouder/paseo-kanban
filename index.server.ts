import type { PluginServerContext } from '@getpaseo/plugin/server';
import { completeReviewCards, createTask, deleteTask, launchTask, moveCard, organizeProjects, patchCard, readBoard } from './shared/contracts';
import { completeReview, create, launch, move, organize, patch, read, remove } from './server/handlers';

export default function contribute(server: PluginServerContext) {
  server.handle(readBoard, read);
  server.handle(organizeProjects, organize);
  server.handle(patchCard, patch);
  server.handle(moveCard, move);
  server.handle(completeReviewCards, completeReview);
  server.handle(createTask, create);
  server.handle(launchTask, launch);
  server.handle(deleteTask, remove);
  return () => {};
}
