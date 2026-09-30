import { z } from 'zod';

export const modelPresetSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, '请填写方案别名。').max(40),
  provider: z.string().trim().regex(/^[^/]+\/.+$/).max(200),
  thinkingOptionId: z.string().min(1).max(200).optional(),
});
export type ModelPreset = z.infer<typeof modelPresetSchema>;

export const customTaskTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, '请填写模板名称。').max(40),
  title: z.string().trim().min(1, '请填写任务标题。').max(1000),
  description: z.string().max(20000).default(''),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
});
export type CustomTaskTemplate = z.infer<typeof customTaskTemplateSchema>;

export const kanbanSettingsSchema = z.object({
  modelPresets: z.array(modelPresetSchema).max(100).refine(items => new Set(items.map(item => item.id)).size === items.length && new Set(items.map(item => item.name.toLocaleLowerCase())).size === items.length, '方案别名不能重复。').optional(),
  taskTemplates: z.array(customTaskTemplateSchema).max(100).refine(items => new Set(items.map(item => item.id)).size === items.length && new Set(items.map(item => item.name.toLocaleLowerCase())).size === items.length, '模板名称不能重复。').optional(),
  projectBaseDirectory: z.string().trim().max(2000, '项目基础目录不能超过 2000 个字符。')
    .refine(path => !path || /^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+|\/)/.test(path), '项目基础目录必须是绝对路径。')
    .default(''),
});

export type KanbanSettings = z.infer<typeof kanbanSettingsSchema>;

// Do not apply full-settings defaults when saving only one settings section.
export const kanbanSettingsPatchSchema = kanbanSettingsSchema.partial().extend({
  expectedModelPresets: z.array(modelPresetSchema).optional(),
  expectedTaskTemplates: z.array(customTaskTemplateSchema).optional(),
  projectBaseDirectory: kanbanSettingsSchema.shape.projectBaseDirectory.removeDefault().optional(),
});

export type KanbanSettingsPatch = z.infer<typeof kanbanSettingsPatchSchema>;
