import { expect, test } from '@playwright/test';

test('failed task completes and watch later can be saved, opened, searched and removed', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '切换目标视图', exact: true })).toHaveCount(0);
  const card = page.getByTestId('card-agent:session-03');
  await card.click({ button: 'right' });
  await page.getByRole('button', { name: '加入稍后再看', exact: true }).click();
  await page.getByRole('button', { name: '切换稍后再看', exact: true }).click();
  const panel = page.getByTestId('watch-later-panel');
  await expect(panel.getByTestId('later-agent:session-03')).toBeVisible();
  await page.getByLabel('搜索任务', { exact: true }).fill('no-matching-task');
  await expect(panel.getByTestId('later-agent:session-03')).toHaveCount(0);
  await page.getByLabel('搜索任务', { exact: true }).fill('');
  await expect(panel.getByTestId('later-agent:session-03')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '切换稍后再看', exact: true }).click();
  await panel.getByRole('button', { name: '查看详情', exact: true }).click();
  await page.getByRole('button', { name: '直接完成', exact: true }).click();
  await expect(page.getByTestId('task-detail-dialog')).toHaveCount(0);
  await expect(panel).toContainText('已完成');
  await panel.getByRole('button', { name: '查看详情', exact: true }).click();
  await expect(page.getByTestId('task-detail-dialog').getByRole('button', { name: '移出稍后再看', exact: true })).toBeVisible();
  await page.getByTestId('task-detail-dialog').getByRole('button', { name: '移出稍后再看', exact: true }).click();
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();
  await expect(panel.getByTestId('later-agent:session-03')).toHaveCount(0);
});

test('mobile watch later preserves task progress and fits the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: /查看任务详情.*数据库迁移/ }).click();
  await page.getByTestId('task-detail-dialog').getByRole('button', { name: '加入稍后再看', exact: true }).click();
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();
  await page.getByRole('button', { name: '切换稍后再看', exact: true }).click();
  await expect(page.getByTestId('watch-later-panel')).toContainText('需关注');
  await expect(page.getByTestId('mobile-bottom-nav').getByRole('button', { name: '执行', exact: true })).not.toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: '需处理', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'output/watch-later-mobile.png' });
});
