import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setContent(readFileSync('output/goal-panel-redesign.html', 'utf8'));
  const app = page.locator('.g-app').first();
  await app.getByRole('button', { name: '新建', exact: true }).click();
  await app.getByRole('textbox', { name: '目标名称', exact: true }).fill('测试目标');
  await app.getByRole('button', { name: '创建目标', exact: true }).click();
  await app.getByRole('heading', { name: '测试目标', exact: true }).waitFor();
  await app.getByRole('button', { name: '标记完成', exact: true }).click();
  await app.getByRole('button', { name: '重新打开', exact: true }).click();
  await app.getByRole('button', { name: '添加任务', exact: true }).click();
  await app.getByRole('button', { name: '关联已有任务', exact: true }).click();
  await app.getByRole('button', { name: /补充边界场景测试/ }).click();
  await app.getByRole('button', { name: /补充边界场景测试/ }).waitFor();
  await app.locator('[data-goal="release"]').click();
  await page.screenshot({ path: 'output/goal-panel-redesign.png' });
  await page.setViewportSize({ width: 390, height: 1100 });
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  await page.evaluate(() => {
    const sections = document.querySelectorAll('[data-variant]');
    sections[0].hidden = true; sections[1].hidden = false;
  });
  const overview = page.locator('.g-app').last();
  await overview.locator('[data-goal="release"]').click();
  await overview.getByRole('button', { name: '标记完成', exact: true }).click();
  await overview.getByRole('button', { name: '更多目标操作', exact: true }).click();
  await overview.getByRole('button', { name: '编辑目标', exact: true }).click();
  await overview.getByRole('textbox', { name: '目标名称', exact: true }).fill('更新名称');
  await overview.getByRole('button', { name: '保存修改', exact: true }).click();
  await overview.getByRole('heading', { name: '更新名称', exact: true }).waitFor();
  console.log(JSON.stringify({ errors, mobileOverflow }));
  if (errors.length || mobileOverflow) process.exitCode = 1;
} finally { await browser.close(); }
