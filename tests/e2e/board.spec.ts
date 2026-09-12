import { expect, test } from '@playwright/test';

test('search across projects and clear to restore all sessions', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: '查看任务 登录流程增加 OAuth 回调处理', exact: true })).toBeVisible();
  await page.getByLabel('搜索任务', { exact: true }).fill('数据库');
  await expect(page.getByRole('button', { name: /^查看任务 / })).toHaveCount(1);
  await page.getByRole('button', { name: '清除搜索', exact: true }).click();
  await expect(page.getByRole('button', { name: /^查看任务 / })).toHaveCount(11);
  await page.keyboard.press('/');
  await expect(page.getByLabel('搜索任务', { exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});

test('resize the project sidebar and restore its width', async ({ page }) => {
  await page.goto('/');
  const sidebar = page.getByTestId('board-sidebar');
  const resizer = page.getByTestId('sidebar-resizer');
  const before = await sidebar.boundingBox();
  const handle = await resizer.boundingBox();
  expect(before).not.toBeNull(); expect(handle).not.toBeNull();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + 40);
  await page.mouse.down();
  await page.mouse.move(handle!.x + handle!.width / 2 + 72, handle!.y + 40);
  await page.mouse.up();
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeGreaterThan(before!.width + 60);
  const resized = (await sidebar.boundingBox())!.width;
  await page.reload();
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeCloseTo(resized, 0);
});

test('filter workspaces, paste an attachment, and remember the default model', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await page.getByLabel('搜索工作区', { exact: true }).fill('agent-service api');
  await expect(page.getByRole('button', { name: 'agent-service / feature/events', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'paseo-kanban / main', exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['clipboard image'], 'clipboard.png', { type: 'image/png' }));
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
  });
  await expect(page.getByText('clipboard.png', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'codex / 示例模型', exact: true }).click();
  await page.getByRole('button', { name: '设为默认模型', exact: true }).click();
  await expect(page.getByRole('button', { name: '当前默认模型', exact: true })).toBeVisible();
  await page.getByLabel('关闭新建任务', { exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await expect(page.getByRole('button', { name: '当前默认模型', exact: true })).toBeVisible();
});

test('create, save, launch and navigate with persisted task metadata', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await page.getByRole('button', { name: 'codex / 示例模型', exact: true }).click();
  await expect(page.getByRole('radio', { name: '运行模式 Full Access', exact: true })).toBeChecked();
  await page.getByLabel('任务标题', { exact: true }).fill('端到端验证任务');
  await page.getByLabel('任务说明', { exact: true }).fill('确认任务内容在启动前被保存');
  await page.getByLabel('标签（逗号分隔）', { exact: true }).fill('回归, 测试');
  await page.getByRole('button', { name: '创建待办任务', exact: true }).click();
  await expect(page.getByTestId('column-todo').getByRole('button', { name: '查看任务 端到端验证任务', exact: true })).toBeVisible();
  await expect(page.getByTestId('task-run-mode')).toHaveText('Full Access');
  await page.getByLabel('任务标题', { exact: true }).fill('修改后的验证任务');
  await expect(page.getByRole('button', { name: '开始执行', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByRole('button', { name: '开始执行', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '开始执行', exact: true }).click();
  await expect(page.getByTestId('column-running').getByRole('button', { name: '查看任务 修改后的验证任务', exact: true })).toBeVisible();
  await expect(page.locator('#preview-event')).toContainText('打开会话');
  await page.reload();
  await page.getByRole('button', { name: '查看任务 修改后的验证任务', exact: true }).click();
  await expect(page.getByLabel('任务说明', { exact: true })).toHaveValue('确认任务内容在启动前被保存');
  await expect(page.getByLabel('标签（逗号分隔）', { exact: true })).toHaveValue('回归, 测试');
  await expect(page.getByTestId('task-run-mode')).toHaveText('Full Access');
});

test('run modes follow provider selection and persist an explicit choice', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await page.getByRole('button', { name: 'codex / 示例模型', exact: true }).click();
  await expect(page.getByRole('radio', { name: '运行模式 Full Access', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: '运行模式 Auto-review', exact: true }).click();
  await page.getByRole('button', { name: 'claude / 示例模型', exact: true }).click();
  await expect(page.getByRole('radio', { name: '运行模式 Bypass', exact: true })).toBeChecked();
  await expect(page.getByRole('radio', { name: '运行模式 Auto-review', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'codex / 示例模型', exact: true }).click();
  await expect(page.getByRole('radio', { name: '运行模式 Auto-review', exact: true })).toBeChecked();
  await page.getByLabel('任务标题', { exact: true }).fill('选择运行模式验证');
  await page.getByRole('button', { name: '创建待办任务', exact: true }).click();
  await expect(page.getByTestId('task-run-mode')).toHaveText('Auto-review');
  await page.reload();
  await page.getByRole('button', { name: '查看任务 选择运行模式验证', exact: true }).click();
  await expect(page.getByTestId('task-run-mode')).toHaveText('Auto-review');
  await page.getByRole('button', { name: '开始执行', exact: true }).click();
  await expect(page.getByTestId('task-run-mode')).toHaveText('Auto-review');
});

test('legacy drafts show the Full Access mode that launch will migrate to', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '查看任务 设计任务通知与收件箱', exact: true }).click();
  await expect(page.getByTestId('task-run-mode')).toHaveText('Full Access');
});

test('drag attachments into a new task and delete it before it runs', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  const transfer = await page.evaluateHandle(() => {
    const value = new DataTransfer();
    value.items.add(new File(['image bytes'], 'wireframe.png', { type: 'image/png' }));
    value.items.add(new File(['acceptance criteria'], 'notes.txt', { type: 'text/plain' }));
    return value;
  });
  await page.getByTestId('attachment-dropzone').dispatchEvent('drop', { dataTransfer: transfer });
  await expect(page.getByText('wireframe.png', { exact: true })).toBeVisible();
  await expect(page.getByText('notes.txt', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'codex / 示例模型', exact: true }).click();
  await page.getByLabel('任务标题', { exact: true }).fill('带附件的待办任务');
  await page.getByRole('button', { name: '创建待办任务', exact: true }).click();
  await expect(page.getByText('2 个附件', { exact: true })).toBeVisible();
  await expect(page.getByText('wireframe.png', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '删除未启动任务', exact: true }).click();
  await page.getByRole('button', { name: '确认永久删除', exact: true }).click();
  await expect(page.getByRole('button', { name: '查看任务 带附件的待办任务', exact: true })).toHaveCount(0);
});

test('drag reviewed task to done, persist, hide and restore', async ({ page }) => {
  await page.goto('/');
  const card = page.getByTestId('card-agent:session-05');
  await card.locator('..').dragTo(page.getByTestId('column-done'));
  await expect(page.getByTestId('column-done').getByTestId('card-agent:session-05')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('column-done').getByTestId('card-agent:session-05')).toBeVisible();
  await page.getByRole('button', { name: '查看任务 审核工作区导航与搜索交互', exact: true }).click();
  await page.getByRole('button', { name: '从看板收起', exact: true }).click();
  await expect(page.getByTestId('card-agent:session-05')).toHaveCount(0);
  await page.getByRole('button', { name: '查看已收起任务', exact: true }).click();
  await page.getByRole('button', { name: '查看任务 审核工作区导航与搜索交互', exact: true }).click();
  await page.getByRole('button', { name: '恢复到看板', exact: true }).click();
  await page.getByRole('button', { name: '返回活动任务', exact: true }).click();
  await expect(page.getByTestId('card-agent:session-05')).toBeVisible();
});

test('complete all visible reviewed tasks in one action', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('搜索任务', { exact: true }).fill('审核工作区导航');
  const review = page.getByTestId('column-review');
  await expect(review.getByRole('button', { name: /^查看任务 / })).toHaveCount(1);
  await review.getByRole('button', { name: '完成当前筛选的 1 个待审核任务', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('已将 1 个待审核任务标记为完成');
  await expect(review.getByRole('button', { name: /^查看任务 / })).toHaveCount(0);
  await expect(page.getByTestId('column-done').getByTestId('card-agent:session-05')).toBeVisible();
  await page.getByRole('button', { name: '清除搜索', exact: true }).click();
  await expect(review.getByTestId('card-agent:session-06')).toBeVisible();
  await expect(page.getByTestId('column-done').getByTestId('card-agent:session-06')).toHaveCount(0);
});

test('mobile uses explicit move controls and light theme renders', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?light');
  await page.getByRole('button', { name: '查看任务 为会话增加标签和快捷筛选', exact: true }).click();
  await page.getByRole('button', { name: '已完成', exact: true }).click();
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();
  await page.getByLabel('搜索任务', { exact: true }).fill('为会话增加标签');
  const done = page.getByTestId('column-done').getByRole('button', { name: /^查看任务 / });
  await done.scrollIntoViewIfNeeded();
  await expect(done).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('running sessions cannot be marked done', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '查看任务 登录流程增加 OAuth 回调处理', exact: true }).click();
  await page.getByRole('button', { name: '已完成', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('会话仍在运行');
  await expect(page.getByTestId('column-running').getByTestId('card-agent:session-01')).toBeVisible();
});
