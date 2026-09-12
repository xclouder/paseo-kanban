import { z } from 'zod';

const id = z.string().min(1).max(300);
const name = z.string().trim().min(1, '请填写分组名称。').max(60, '分组名称最多 60 字。');
export const projectLayoutSchema = z.object({
  groups: z.array(z.object({ id, name, collapsed: z.boolean().default(false) })).default([]),
  order: z.array(id).default([]),
  membership: z.record(z.string(), id).default({}),
});
export type ProjectLayout = z.infer<typeof projectLayoutSchema>;
export const projectActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('createGroup'), id, name }),
  z.object({ type: z.literal('renameGroup'), id, name }),
  z.object({ type: z.literal('deleteGroup'), id }),
  z.object({ type: z.literal('collapseGroup'), id, collapsed: z.boolean() }),
  z.object({ type: z.literal('moveGroup'), id, beforeId: id.optional() }),
  z.object({ type: z.literal('moveProject'), id, groupId: id.nullable(), beforeId: id.optional() }),
]);
export type ProjectAction = z.infer<typeof projectActionSchema>;
export type SidebarProject = { id: string; name: string };

export function projectSections(projects: SidebarProject[], layout: ProjectLayout) {
  const rank = new Map(layout.order.map((id, index) => [id, index]));
  const sorted = [...projects].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
  const groups = new Set(layout.groups.map(group => group.id));
  return [
    ...layout.groups.map(group => ({ ...group, projects: sorted.filter(project => layout.membership[project.id] === group.id) })),
    { id: null, name: '未分组', collapsed: false, projects: sorted.filter(project => !groups.has(layout.membership[project.id])) },
  ];
}

/** Apply one operation to the latest layout under the store's writer lock. */
export function applyProjectAction(layout: ProjectLayout, raw: ProjectAction, projects: SidebarProject[]) {
  const action = projectActionSchema.parse(raw);
  const group = layout.groups.find(group => group.id === action.id);
  if (action.type === 'createGroup') {
    if (group) return;
    layout.groups.push({ id: action.id, name: action.name, collapsed: false });
    return;
  }
  if (action.type === 'moveProject') {
    if (!projects.some(project => project.id === action.id)) throw new Error('项目已不可用，请刷新后重试。');
    if (action.groupId && !layout.groups.some(group => group.id === action.groupId)) throw new Error('分组已不存在，请刷新后重试。');
    if (action.beforeId === action.id) return;
    if (action.beforeId && (!projects.some(project => project.id === action.beforeId) || (layout.membership[action.beforeId] ?? null) !== action.groupId)) throw new Error('目标项目已移动，请刷新后重试。');
    const order = [...new Set([...layout.order, ...projects.map(project => project.id)])].filter(id => id !== action.id);
    const before = action.beforeId ? order.indexOf(action.beforeId) : -1;
    order.splice(before < 0 ? order.length : before, 0, action.id);
    layout.order = order;
    // Define a data property even for project IDs such as __proto__.
    if (action.groupId) Object.defineProperty(layout.membership, action.id, { value: action.groupId, enumerable: true, writable: true, configurable: true });
    else delete layout.membership[action.id];
    return;
  }
  if (!group) throw new Error('分组已不存在，请刷新后重试。');
  if (action.type === 'renameGroup') group.name = action.name;
  if (action.type === 'collapseGroup') group.collapsed = action.collapsed;
  if (action.type === 'deleteGroup') {
    layout.groups = layout.groups.filter(group => group.id !== action.id);
    for (const [projectId, groupId] of Object.entries(layout.membership)) if (groupId === action.id) delete layout.membership[projectId];
  }
  if (action.type === 'moveGroup' && action.beforeId !== action.id) {
    if (action.beforeId && !layout.groups.some(group => group.id === action.beforeId)) throw new Error('目标分组已不存在，请刷新后重试。');
    layout.groups = layout.groups.filter(group => group.id !== action.id);
    const before = action.beforeId ? layout.groups.findIndex(group => group.id === action.beforeId) : -1;
    layout.groups.splice(before < 0 ? layout.groups.length : before, 0, group);
  }
}
