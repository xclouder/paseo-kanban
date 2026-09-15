import { metadataSchema, taskSchema, type Snapshot } from '../shared/model';

export function fixture(): Snapshot {
  const time = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();
  const specs = [
    ['session-01', '登录流程增加 OAuth 回调处理', 'codex', 'running', 'workspace-web', 4, ['认证', '后端']],
    ['session-02', '优化长列表渲染，减少滚动卡顿', 'claude', 'running', 'workspace-web', 12, ['性能', '前端']],
    ['session-03', '数据库迁移：补齐索引与回滚脚本', 'codex', 'error', 'workspace-api', 21, ['数据库']],
    ['session-04', '接入 GitHub Webhook 事件处理', 'claude', 'idle', 'workspace-api', 36, ['集成', '需授权']],
    ['session-05', '审核工作区导航与搜索交互', 'claude', 'idle', 'workspace-web', 52, ['体验优化']],
    ['session-06', '补全 API 错误处理测试', 'codex', 'idle', 'workspace-api', 78, ['测试', '后端']],
    ['session-07', '更新组件库的暗色模式样式', 'claude', 'idle', 'workspace-design', 144, ['设计系统']],
    ['session-08', '修复移动端键盘遮挡输入框', 'codex', 'idle', 'workspace-web', 240, ['移动端', 'Bug']],
  ] as const;
  const agents = specs.map(([id, title, provider, status, workspaceId, minutes]) => ({ id, title, provider, status, activeTurn: status === 'running', workspaceId, cwd: `/projects/${workspaceId}`, updatedAt: time(minutes), createdAt: time(minutes + 60), lastUserMessageAt: time(minutes + 30), attentionReason: id === 'session-04' ? 'permission' : status === 'idle' ? 'finished' : null, pendingPermission: id === 'session-04', archived: false, labels: {} }));
  return {
    agents,
    workspaces: [
      { id: 'workspace-web', name: 'main', project: 'paseo-kanban', projectId: 'project-kanban', directory: 'J:\\ai-ideas\\paseo-kanban' },
      { id: 'workspace-api', name: 'feature/events', project: 'agent-service', projectId: 'project-api', directory: 'J:\\projects\\agent-service' },
      { id: 'workspace-design', name: 'design-system', project: 'paseo-kanban', projectId: 'project-kanban', directory: 'J:\\projects\\design-system' },
    ],
    providers: ['claude', 'codex'], models: [
      { id: 'claude/preview-model', provider: 'claude', label: '示例模型', thinkingOptions: [{ id: 'low', label: 'Low' }, { id: 'medium', label: 'Medium', isDefault: true }], defaultThinkingOptionId: 'medium' },
      { id: 'codex/preview-model', provider: 'codex', label: '示例模型', thinkingOptions: [{ id: 'low', label: 'Low' }, { id: 'medium', label: 'Medium', isDefault: true }, { id: 'high', label: 'High' }, { id: 'xhigh', label: 'Extra High' }] },
      { id: 'codex/basic-model', provider: 'codex', label: '无 Thinking 模型', thinkingOptions: [] },
    ], fetchedAt: time(0),
    modes: [
      { provider: 'claude', id: 'plan', label: 'Plan Mode' },
      { provider: 'claude', id: 'default', label: 'Always Ask' },
      { provider: 'claude', id: 'bypassPermissions', label: 'Bypass' },
      { provider: 'codex', id: 'auto', label: 'Default Permissions' },
      { provider: 'codex', id: 'auto-review', label: 'Auto-review' },
      { provider: 'codex', id: 'full-access', label: 'Full Access' },
    ],
    store: {
      version: 1,
      inbox: {
        '11111111-1111-4111-8111-111111111111': { id: '11111111-1111-4111-8111-111111111111', title: '整理下周迭代要处理的体验问题', createdAt: time(18) },
      },
      projectLayout: { groups: [], order: [], membership: {} },
      sessions: Object.fromEntries(specs.map(([id, , , , , , tags], i) => [id, metadataSchema.parse({ tags: [...tags], pinned: i === 0, priority: i === 2 ? 'high' : 'medium', stage: i >= 6 ? 'done' : undefined, stageTurn: agents[i].lastUserMessageAt, description: ['完成登录后正确恢复来源页面，并覆盖 token 过期的边界情况。', '分析会话列表的渲染开销，给出优化前后的性能对比。', '迁移脚本在测试环境执行失败，需要确认数据库连接配置。', '等待授权后，继续验证签名与事件去重逻辑。', '交互改动已完成，请检查搜索、快捷键和窄屏布局。', '主要异常路径已覆盖，等待审核测试结果。', '统一卡片、表单与浮层的主题色。', '修正安全区域，已在窄屏完成回归。'][i] })])),
      tasks: Object.fromEntries([
        { id: 'task:preview-01', title: '为会话增加标签和快捷筛选', description: '按项目、优先级和标签快速找到正在推进的工作。', workspaceId: 'workspace-web', provider: 'claude', tags: ['体验优化', '本周'], priority: 'high' },
        { id: 'task:preview-02', title: '设计任务通知与收件箱', description: '集中显示需要人工处理的授权、问题和待审核结果。', workspaceId: 'workspace-web', provider: 'codex', tags: ['产品'] },
        { id: 'task:preview-03', title: '整理插件安装与使用文档', description: '提供 Windows 和 macOS 的安装说明。', workspaceId: 'workspace-design', provider: 'claude', tags: ['文档'] },
      ].map((task, i) => [task.id, taskSchema.parse({ ...task, provider: `${task.provider}/preview-model`, stage: 'todo', createdAt: time(100 + i * 50), updatedAt: time(100 + i * 50) })])),
    },
  };
}
