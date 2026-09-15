import { expect, test } from '@playwright/test';

test('sidebar project drag sorting persists and selection still filters the board', async ({ page }) => {
  await page.goto('/');
  const sidebar = page.getByTestId('project-sidebar');
  await sidebar.getByRole('button', { name: '整理项目', exact: true }).click();
  await sidebar.getByTestId('sidebar-project-project-api').locator('..').dragTo(sidebar.getByTestId('sidebar-project-project-kanban'));
  await expect(sidebar.getByRole('button', { name: /^筛选项目 / }).first()).toHaveAccessibleName('筛选项目 agent-service');
  await page.reload();
  await expect(sidebar.getByRole('button', { name: /^筛选项目 / }).first()).toHaveAccessibleName('筛选项目 agent-service');
  await sidebar.getByRole('button', { name: '筛选项目 agent-service', exact: true }).click();
  await expect(page.getByRole('button', { name: /^查看任务 / })).toHaveCount(3);
});

test('create, assign, rename, collapse and delete project groups without losing projects', async ({ page }) => {
  await page.goto('/');
  const sidebar = page.getByTestId('project-sidebar');
  await sidebar.getByRole('button', { name: '整理项目', exact: true }).click();
  await sidebar.getByLabel('新分组名称', { exact: true }).fill('工作');
  await sidebar.getByRole('button', { name: '新建项目分组', exact: true }).click();
  await expect(sidebar.getByRole('button', { name: '折叠分组 工作', exact: true })).toBeVisible();
  await sidebar.getByTestId('sidebar-project-project-kanban').locator('..').dragTo(sidebar.getByRole('button', { name: '折叠分组 工作', exact: true }));
  await expect(sidebar.getByTestId('project-section-ungrouped').getByTestId('sidebar-project-project-kanban')).toHaveCount(0);
  await sidebar.getByRole('button', { name: '重命名分组 工作', exact: true }).click();
  await sidebar.getByLabel('修改分组名称', { exact: true }).fill('常用项目');
  await sidebar.getByRole('button', { name: '保存分组名称', exact: true }).click();
  await sidebar.getByRole('button', { name: '折叠分组 常用项目', exact: true }).click();
  await expect(sidebar.getByTestId('sidebar-project-project-kanban')).toHaveCount(0);
  await page.reload();
  await sidebar.getByRole('button', { name: '展开分组 常用项目', exact: true }).click();
  await expect(sidebar.getByTestId('sidebar-project-project-kanban')).toBeVisible();
  await sidebar.getByRole('button', { name: '整理项目', exact: true }).click();
  await sidebar.getByLabel('新分组名称', { exact: true }).fill('其他');
  await sidebar.getByRole('button', { name: '新建项目分组', exact: true }).click();
  await sidebar.getByRole('button', { name: '上移分组 其他', exact: true }).click();
  await expect(sidebar.getByRole('button', { name: /^折叠分组 / }).first()).toHaveAccessibleName('折叠分组 其他');
  await sidebar.getByRole('button', { name: '折叠分组 常用项目', exact: true }).locator('xpath=ancestor::div[@draggable="true"][1]').dragTo(sidebar.getByRole('button', { name: '折叠分组 其他', exact: true }));
  await expect(sidebar.getByRole('button', { name: /^折叠分组 / }).first()).toHaveAccessibleName('折叠分组 常用项目');
  const otherSection = sidebar.locator('[data-testid^="project-section-"]').filter({ has: page.getByRole('button', { name: '折叠分组 其他', exact: true }) });
  await sidebar.getByTestId('sidebar-project-project-kanban').locator('..').dragTo(sidebar.getByRole('button', { name: '折叠分组 其他', exact: true }));
  await expect(otherSection.getByTestId('sidebar-project-project-kanban')).toBeVisible();
  await sidebar.getByTestId('sidebar-project-project-kanban').locator('..').dragTo(sidebar.getByRole('button', { name: '折叠分组 常用项目', exact: true }));
  await expect(otherSection.getByTestId('sidebar-project-project-kanban')).toHaveCount(0);
  await sidebar.getByRole('button', { name: '设置项目分组 agent-service', exact: true }).click();
  await sidebar.getByRole('button', { name: '将 agent-service 移至 常用项目', exact: true }).click();
  await sidebar.getByRole('button', { name: '上移项目 agent-service', exact: true }).click();
  await expect(sidebar.getByRole('button', { name: /^筛选项目 / }).first()).toHaveAccessibleName('筛选项目 agent-service');
  await sidebar.getByRole('button', { name: '删除分组 常用项目，项目移回未分组', exact: true }).click();
  await expect(sidebar.getByTestId('project-section-ungrouped').getByRole('button', { name: /^筛选项目 / })).toHaveCount(2);
  await page.reload();
  await expect(sidebar.getByRole('button', { name: /^筛选项目 / })).toHaveCount(2);
  await expect(sidebar.getByRole('button', { name: '折叠分组 常用项目', exact: true })).toHaveCount(0);
});

test('assign a project to a group from its right-click menu', async ({ page }) => {
  await page.goto('/');
  const sidebar = page.getByTestId('project-sidebar');
  await sidebar.getByRole('button', { name: '整理项目', exact: true }).click();
  await sidebar.getByLabel('新分组名称', { exact: true }).fill('右键分组');
  await sidebar.getByRole('button', { name: '新建项目分组', exact: true }).click();
  await sidebar.getByRole('button', { name: '完成项目整理', exact: true }).click();

  const project = sidebar.getByTestId('sidebar-project-project-kanban');
  const cursor = { x: 31, y: 11 };
  await project.click({ button: 'right', position: cursor });
  const menu = page.getByRole('dialog', { name: 'paseo-kanban 项目菜单', exact: true });
  await expect(menu).toBeVisible();
  const [projectBox, menuBox] = await Promise.all([project.boundingBox(), menu.boundingBox()]);
  expect(projectBox).not.toBeNull(); expect(menuBox).not.toBeNull();
  expect(Math.abs(menuBox!.x - projectBox!.x - cursor.x)).toBeLessThan(2);
  expect(Math.abs(menuBox!.y - projectBox!.y - cursor.y)).toBeLessThan(2);
  await expect(sidebar.getByTestId('sidebar-project-project-kanban')).toHaveCSS('background-color', 'rgb(36, 38, 43)');
  await page.setViewportSize({ width: 1680, height: 1000 });
  await expect(menu).toHaveCount(0);
  await project.click({ button: 'right', position: cursor });
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await project.click({ button: 'right', position: cursor });
  await menu.getByRole('button', { name: '移动到分组', exact: true }).hover();
  await page.getByRole('group', { name: '将 paseo-kanban 移动到分组', exact: true }).getByRole('button', { name: '右键分组', exact: true }).click();

  const group = sidebar.locator('[data-testid^="project-section-"]').filter({ has: page.getByRole('button', { name: '折叠分组 右键分组', exact: true }) });
  await expect(group.getByTestId('sidebar-project-project-kanban')).toBeVisible();
});
