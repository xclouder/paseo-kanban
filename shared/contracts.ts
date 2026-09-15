import { defineRpc } from '@getpaseo/plugin';
import { z } from 'zod';
import { inboxEntrySchema, snapshotSchema, stages, taskSchema, workspaceSchema } from './model';
import { projectActionSchema } from './projects';
import { kanbanSettingsSchema } from './settings';

export const organizeProjects = defineRpc({ name: 'board.organize-projects', input: projectActionSchema, output: z.object({ ok: z.boolean() }) });

export const readBoard = defineRpc({ name: 'board.read', input: z.object({}), output: snapshotSchema });
export const moveInput = z.object({ id: z.string().min(1), stage: z.enum(stages), beforeId: z.string().optional() });
export const moveCard = defineRpc({ name: 'board.move', input: moveInput, output: z.object({ ok: z.boolean() }) });
export const completeReviewInput = z.object({ ids: z.array(z.string().min(1)).min(1) });
export const completeReviewCards = defineRpc({ name: 'board.complete-review', input: completeReviewInput, output: z.object({ ok: z.boolean(), count: z.number().int().nonnegative() }) });
export const MAX_ATTACHMENT_FILES = 10;
export const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;
export const MAX_ATTACHMENT_TOTAL_SIZE = 50 * 1024 * 1024;
const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
export const createAttachmentInput = z.object({
  id: z.string().uuid(),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(200),
  size: z.number().int().nonnegative().max(MAX_ATTACHMENT_SIZE),
  dataBase64: z.string().max(Math.ceil(MAX_ATTACHMENT_SIZE / 3) * 4 + 4).regex(base64Pattern, '附件内容不是有效的 Base64 数据'),
});
export const patchInput = z.object({ id: z.string().min(1), patch: z.object({
  title: z.string().trim().min(1).max(180).optional(),
  description: z.string().max(20000).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  priority: z.enum(['high', 'medium', 'low']).optional(),
  pinned: z.boolean().optional(), hidden: z.boolean().optional(),
  workspaceId: z.string().min(1).optional(),
  attachmentAdditions: z.array(createAttachmentInput).max(MAX_ATTACHMENT_FILES).optional(),
}) });
export const patchCard = defineRpc({ name: 'board.patch', input: patchInput, output: z.object({ ok: z.boolean() }) });
export const createInput = z.object({ clientRequestId: z.string().uuid(), inboxId: z.string().uuid().optional(), title: z.string().trim().min(1).max(180), description: z.string().trim().max(20000), workspaceId: z.string().min(1), provider: z.string().trim().regex(/^[^/]+\/.+$/, '请选择提供商和模型').max(200), modeId: taskSchema.shape.modeId, thinkingOptionId: taskSchema.shape.thinkingOptionId, priority: z.enum(['high', 'medium', 'low']), tags: z.array(z.string().trim().min(1).max(40)).max(12), attachments: z.array(createAttachmentInput).max(MAX_ATTACHMENT_FILES).default([]) });
export const createTask = defineRpc({ name: 'board.create', input: createInput, output: taskSchema });
const windowsReservedName = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
export const projectNameSchema = z.string().trim().min(1, '请填写项目名。').max(100, '项目名不能超过 100 个字符。')
  .refine(name => name !== '.' && name !== '..' && !/[\\/:*?"<>|\u0000-\u001f]/.test(name) && !/[. ]$/.test(name) && !windowsReservedName.test(name), '项目名包含不能用于目录的字符。');
export const createProjectWorkspaceInput = z.object({
  projectName: projectNameSchema,
});
export const createProjectWorkspace = defineRpc({ name: 'board.project.create-workspace', input: createProjectWorkspaceInput, output: workspaceSchema });
export const readKanbanSettings = defineRpc({ name: 'board.settings.read', input: z.object({}), output: kanbanSettingsSchema });
export const saveKanbanSettings = defineRpc({ name: 'board.settings.save', input: kanbanSettingsSchema, output: kanbanSettingsSchema });
export const addInboxInput = z.object({
  clientRequestId: z.string().uuid(),
  title: z.string().trim().min(1).max(180),
  attachments: z.array(createAttachmentInput).max(MAX_ATTACHMENT_FILES).default([]),
});
export const addInboxEntry = defineRpc({ name: 'board.inbox.add', input: addInboxInput, output: inboxEntrySchema });
export const patchInboxInput = z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(180) });
export const patchInboxEntry = defineRpc({ name: 'board.inbox.patch', input: patchInboxInput, output: inboxEntrySchema });
export const deleteInboxEntry = defineRpc({ name: 'board.inbox.delete', input: z.object({ id: z.string().uuid() }), output: z.object({ ok: z.boolean() }) });
export const launchTask = defineRpc({ name: 'board.launch', input: z.object({ id: z.string().min(1) }), output: z.object({ agentId: z.string() }) });
export const deleteTask = defineRpc({ name: 'board.delete', input: z.object({ id: z.string().min(1) }), output: z.object({ ok: z.boolean() }) });
export type PatchInput = z.infer<typeof patchInput>;
export type MoveInput = z.infer<typeof moveInput>;
export type CompleteReviewInput = z.infer<typeof completeReviewInput>;
export type CreateInput = z.input<typeof createInput>;
export type CreateProjectWorkspaceInput = z.infer<typeof createProjectWorkspaceInput>;
export type AddInboxInput = z.input<typeof addInboxInput>;
export type PatchInboxInput = z.infer<typeof patchInboxInput>;
export type CreateAttachmentInput = z.infer<typeof createAttachmentInput>;
