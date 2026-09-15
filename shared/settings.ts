import { z } from 'zod';

export const kanbanSettingsSchema = z.object({
  projectBaseDirectory: z.string().trim().max(2000, '项目基础目录不能超过 2000 个字符。')
    .refine(path => !path || /^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+|\/)/.test(path), '项目基础目录必须是绝对路径。')
    .default(''),
});

export type KanbanSettings = z.infer<typeof kanbanSettingsSchema>;
