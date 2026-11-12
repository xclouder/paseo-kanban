import { expect, test } from '@playwright/test';

test('slow model discovery does not block task cards or browsing', async ({ page }) => {
  await page.goto('/?slow-providers');
  await expect(page.getByTestId('card-agent:session-03')).toBeVisible({ timeout: 4000 });
  await expect(page.getByText('正在加载看板…', { exact: true })).toHaveCount(0);
  await page.getByTestId('card-agent:session-03').click();
  await expect(page.getByTestId('task-detail-dialog')).toBeVisible();
});

test('cached cards appear during a slow reload and stay visible on sync failure', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('card-agent:session-03')).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem('paseo-kanban:snapshot:v1:preview')))).toBe(true);
  await page.goto('/?slow-board');
  await expect(page.getByTestId('card-agent:session-03')).toBeVisible({ timeout: 4000 });
  await expect(page.getByText(/正在显示上次数据/)).toBeVisible();
  await expect(page.getByRole('button', { name: '新建任务', exact: true })).toBeDisabled();
  await page.goto('/?board-error');
  await expect(page.getByTestId('card-agent:session-03')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('同步失败');
  await expect(page.getByRole('button', { name: '重试', exact: true })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('button', { name: '新建任务', exact: true })).toBeEnabled();
});

test('cold slow loads explain the wait and end with a retry action', async ({ page }) => {
  await page.goto('/?board-error');
  await expect(page.getByRole('alert')).toContainText('同步失败');
  await expect(page.getByRole('button', { name: '重试', exact: true })).toBeVisible();
  await page.goto('/?slow-board');
  await expect(page.getByText('正在加载看板…', { exact: true })).toBeVisible();
  await expect(page.getByText('正在等待 Paseo 返回会话或工作区，连接较慢…', { exact: true })).toBeVisible({ timeout: 5000 });
});
