import { expect, test } from '@playwright/test';

test('create form keeps preset management out and applies a configured preset', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /取消收藏会话 登录流程增加 OAuth 回调处理/ }).click();
  await page.evaluate(() => {
    const key = 'paseo-kanban-preview-v1';
    const data = JSON.parse(localStorage.getItem(key)!);
    data.store.settings.modelPresets = [{
      id: '11111111-1111-4111-8111-111111111111',
      name: '代码和思考',
      provider: 'codex/preview-model',
      thinkingOptionId: 'high',
    }];
    localStorage.setItem(key, JSON.stringify(data));
  });
  await page.reload();
  await expect(page.getByRole('button', { name: '方案管理', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await expect(page.getByRole('button', { name: '代码和思考', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '代码和思考', exact: true }).click();
  await page.getByLabel('任务标题', { exact: true }).fill('按方案创建任务');
  await page.getByRole('button', { name: '创建待办任务', exact: true }).click();
  await expect(page.getByTestId('task-thinking-mode')).toHaveText('High');
});

test('create form applies a persisted custom task template as an editable instance', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /取消收藏会话 登录流程增加 OAuth 回调处理/ }).click();
  await page.evaluate(() => {
    const key = 'paseo-kanban-preview-v1';
    const data = JSON.parse(localStorage.getItem(key)!);
    data.store.settings.taskTemplates = [{ id: '77777777-7777-4777-8777-777777777777', name: '我的发布流程', title: '准备版本发布：', description: '检查变更记录和回滚方案。', priority: 'high', tags: ['发布', '检查'] }];
    localStorage.setItem(key, JSON.stringify(data));
  });
  await page.reload();
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await page.getByRole('radio', { name: '任务模板 我的发布流程', exact: true }).click();
  await expect(page.getByLabel('任务标题', { exact: true })).toHaveValue('准备版本发布：');
  await expect(page.getByLabel('任务说明', { exact: true })).toHaveValue('检查变更记录和回滚方案。');
  await page.getByLabel('任务标题', { exact: true }).fill('准备 v2.0 发布');
  await page.getByRole('button', { name: '创建待办任务', exact: true }).click();
  await expect(page.getByLabel('任务标题', { exact: true })).toHaveValue('准备 v2.0 发布');
});

test('create form has no hard-coded templates and offers a settings shortcut', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await expect(page.getByText('还没有自定义模板，可前往设置添加。', { exact: true })).toBeVisible();
  const manage = page.getByRole('button', { name: '管理任务模板', exact: true });
  await expect(manage).toBeEnabled();
  await expect(page.getByRole('radio', { name: /^任务模板 / })).toHaveCount(0);
  await page.getByLabel('任务标题', { exact: true }).fill('尚未保存的任务');
  await expect(manage).toBeDisabled();
});
