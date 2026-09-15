import { homedir } from 'node:os';
import { join } from 'node:path';
import type { PluginHandlerContext } from '@getpaseo/plugin/server';
import { BoardService } from './service';
import { Store } from './store';
import type { ProjectAction } from '../shared/projects';
import type { AddInboxInput, CompleteReviewInput, CreateInput, MoveInput, PatchInput } from '../shared/contracts';

const service = new BoardService(new Store(join(process.env.PASEO_HOME || join(homedir(), '.paseo'), 'paseo-kanban', 'board.json')));
export const read = (_: object, { paseo }: PluginHandlerContext) => service.read(paseo);
export const organize = (input: ProjectAction, { paseo }: PluginHandlerContext) => service.organizeProjects(input, paseo);
export const patch = (input: PatchInput, { paseo }: PluginHandlerContext) => service.patch(input, paseo);
export const move = (input: MoveInput, { paseo }: PluginHandlerContext) => service.move(input, paseo);
export const completeReview = (input: CompleteReviewInput, { paseo }: PluginHandlerContext) => service.completeReview(input, paseo);
export const addInbox = (input: AddInboxInput) => service.addInbox(input);
export const deleteInbox = ({ id }: { id: string }) => service.deleteInbox(id);
export const create = (input: CreateInput, { paseo }: PluginHandlerContext) => service.create(input, paseo);
export const launch = ({ id }: { id: string }, { paseo }: PluginHandlerContext) => service.launch(id, paseo);
export const remove = ({ id }: { id: string }) => service.delete(id);
