import { expect, test } from '@playwright/test';

test('capture a global Inbox item and convert it into a task', async ({ page }) => {
  await page.goto('/');
  const boardSurface = await page.getByTestId('card-task:preview-01').evaluate(element => getComputedStyle(element).backgroundColor);
  const boardAccent = await page.getByRole('button', { name: '新建任务', exact: true }).evaluate(element => getComputedStyle(element).backgroundColor);
  await page.keyboard.press('Control+Shift+I');
  const dialog = page.getByRole('dialog', { name: '快速添加到 Inbox' });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(boardSurface);
  expect(await dialog.getByRole('button', { name: '添加到 Inbox' }).evaluate(element => getComputedStyle(element).backgroundColor)).toBe(boardAccent);
  await dialog.getByLabel('任务名称').fill('全局收集的新想法');
  await dialog.getByRole('button', { name: '添加到 Inbox' }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByTestId('board-sidebar').getByRole('button', { name: /^Inbox/ }).click();
  const entry = page.getByTestId('inbox-panel').locator('[data-testid^="inbox-entry-"]').filter({ hasText: '全局收集的新想法' });
  await expect(entry).toBeVisible();
  await entry.getByRole('button', { name: '创建任务', exact: true }).click();
  await expect(page.getByRole('heading', { name: '从 Inbox 创建任务', exact: true })).toBeVisible();
  await expect(page.getByLabel('任务标题', { exact: true })).toHaveValue('全局收集的新想法');
  await page.getByRole('button', { name: '创建待办任务', exact: true }).click();

  await expect(page.getByRole('button', { name: '查看任务 全局收集的新想法', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();
  await page.getByTestId('board-sidebar').getByRole('button', { name: /^Inbox/ }).click();
  await expect(page.getByTestId('inbox-panel')).not.toContainText('全局收集的新想法');
});

test('create an Inbox idea with a pasted file and carry its defaults into the task', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('board-sidebar').getByRole('button', { name: /^Inbox/ }).click();
  const newIdea = page.getByRole('button', { name: '新建想法', exact: true });
  await expect(newIdea).toBeVisible();
  await expect(page.getByRole('button', { name: '新建任务', exact: true })).toHaveCount(0);
  await newIdea.click();

  const dialog = page.getByRole('dialog', { name: '快速添加到 Inbox' });
  await dialog.getByLabel('任务名称').fill('带附件的 Inbox 想法');
  await dialog.evaluate(element => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['idea file'], 'idea-notes.txt', { type: 'text/plain' }));
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
  });
  await expect(dialog.getByText('idea-notes.txt', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '添加到 Inbox' }).click();

  const entry = page.getByTestId('inbox-panel').locator('[data-testid^="inbox-entry-"]').filter({ hasText: '带附件的 Inbox 想法' });
  await expect(entry).toContainText('1 个附件');
  await entry.getByRole('button', { name: '创建任务', exact: true }).click();
  await expect(page.getByLabel('任务标题', { exact: true })).toHaveValue('带附件的 Inbox 想法');
  await expect(page.getByLabel('任务说明', { exact: true })).toHaveValue('带附件的 Inbox 想法');
  await expect(page.getByTestId('task-attachments').getByText('idea-notes.txt', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '创建待办任务', exact: true }).click();
  await expect(page.getByTestId('task-attachments').getByText('idea-notes.txt', { exact: true })).toBeVisible();
});

test('the task-board shortcut leaves the Inbox view', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('board-sidebar').getByRole('button', { name: /^Inbox/ }).click();
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
  await page.keyboard.press('Control+Shift+K');
  await expect(page.getByRole('heading', { name: '所有任务，一目了然', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '新建任务', exact: true })).toBeVisible();
});

test('edit an Inbox entry before creating its task', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByTestId('board-sidebar')).toHaveCount(0);
  await page.getByRole('button', { name: 'Inbox', exact: true }).click();
  const entry = page.getByTestId('inbox-entry-11111111-1111-4111-8111-111111111111');
  await entry.getByRole('button', { name: '编辑 Inbox 条目 整理下周迭代要处理的体验问题', exact: true }).click();
  let title = entry.getByRole('textbox', { name: '编辑 Inbox 条目 整理下周迭代要处理的体验问题', exact: true });
  expect((await title.boundingBox())!.width).toBeGreaterThan(200);
  await title.fill('不保存的临时标题');
  await entry.getByRole('button', { name: '取消', exact: true }).click();
  await expect(title).toHaveCount(0);
  await expect(entry).toContainText('整理下周迭代要处理的体验问题');

  await entry.getByRole('button', { name: '编辑 Inbox 条目 整理下周迭代要处理的体验问题', exact: true }).click();
  title = entry.getByRole('textbox', { name: '编辑 Inbox 条目 整理下周迭代要处理的体验问题', exact: true });
  await title.fill('整理本周 Inbox 体验问题');
  await entry.getByRole('button', { name: '保存', exact: true }).click();
  await expect(entry).toContainText('整理本周 Inbox 体验问题');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await entry.getByRole('button', { name: '创建任务', exact: true }).click();
  await expect(page.getByLabel('任务标题', { exact: true })).toHaveValue('整理本周 Inbox 体验问题');
  await expect(page.getByLabel('任务说明', { exact: true })).toHaveValue('整理本周 Inbox 体验问题');
});

test('global Inbox follows the Paseo light theme', async ({ page }) => {
  await page.goto('/?light');
  const boardSurface = await page.getByTestId('card-task:preview-01').evaluate(element => getComputedStyle(element).backgroundColor);
  const boardAccent = await page.getByRole('button', { name: '新建任务', exact: true }).evaluate(element => getComputedStyle(element).backgroundColor);
  await page.keyboard.press('Control+Shift+I');
  const dialog = page.getByRole('dialog', { name: '快速添加到 Inbox' });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(boardSurface);
  expect(await dialog.getByRole('button', { name: '添加到 Inbox' }).evaluate(element => getComputedStyle(element).backgroundColor)).toBe(boardAccent);
});

test('global Inbox resolves the host theme before the board ever mounts', async ({ page }) => {
  await page.goto('/?no-board');
  await expect(page.getByTestId('board-sidebar')).toHaveCount(0);
  const hostSurface = await page.getByTestId('host-card').evaluate(element => getComputedStyle(element).backgroundColor);
  const hostAccent = await page.getByTestId('host-primary').evaluate(element => getComputedStyle(element).backgroundColor);
  await page.keyboard.press('Control+Shift+I');
  const dialog = page.getByRole('dialog', { name: '快速添加到 Inbox' });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(hostSurface);
  expect(await dialog.getByRole('button', { name: '添加到 Inbox' }).evaluate(element => getComputedStyle(element).backgroundColor)).toBe(hostAccent);
});

test('global Inbox owns Escape and focus above a task dialog', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  const taskTitle = page.getByLabel('任务标题', { exact: true });
  await taskTitle.fill('底层未保存的任务');
  await page.keyboard.press('Control+Shift+I');
  const inbox = page.getByRole('dialog', { name: '快速添加到 Inbox' });
  const inboxTitle = inbox.getByLabel('任务名称');
  await expect(inboxTitle).toBeFocused();

  await page.keyboard.press('Control+Enter');
  await expect(inbox).toBeVisible();
  await expect(page.getByRole('heading', { name: '新建任务', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '查看任务 底层未保存的任务', exact: true })).toHaveCount(0);

  await page.keyboard.press('Shift+Tab');
  await expect(inbox.getByRole('button', { name: '添加到 Inbox' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(inboxTitle).toBeFocused();
  await page.keyboard.press('Escape');

  await expect(inbox).toHaveCount(0);
  await expect(taskTitle).toBeFocused();
  await expect(page.getByRole('heading', { name: '新建任务', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('only the active board opens a new-task dialog when stacked routes remain mounted', async ({ page }) => {
  await page.goto('/?stacked-board');
  await page.keyboard.press('/');
  await expect(page.locator('[aria-label="搜索任务"]:visible')).toBeFocused();
  await page.locator('[aria-label="搜索任务"]:visible').blur();
  await page.keyboard.press('n');
  await expect(page.getByRole('heading', { name: '新建任务', exact: true })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: '新建任务', exact: true })).toHaveCount(0);
});

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

test('open task details in a centered modal without narrowing the board', async ({ page }) => {
  await page.goto('/');
  const column = page.getByTestId('column-todo');
  const before = await column.boundingBox();
  await page.getByRole('button', { name: '查看任务 设计任务通知与收件箱', exact: true }).click();

  const detail = page.getByTestId('task-detail-dialog');
  await expect(detail).toBeVisible();
  await expect(page.getByRole('dialog', { name: '任务详情：设计任务通知与收件箱', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  const dialogBox = await detail.boundingBox();
  const viewport = page.viewportSize()!;
  expect(Math.abs(dialogBox!.x + dialogBox!.width / 2 - viewport.width / 2)).toBeLessThan(2);
  expect(Math.abs(dialogBox!.y + dialogBox!.height / 2 - viewport.height / 2)).toBeLessThan(2);
  expect((await column.boundingBox())!.width).toBeCloseTo(before!.width, 0);
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

test('auto-hide and toggle the Paseo host sidebar without hiding the board sidebar', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const hostSidebar = page.getByTestId('left-sidebar-resize-handle');
  await expect(hostSidebar).toBeHidden();
  await expect(page.getByTestId('board-sidebar')).toBeVisible();
  const toggle = page.getByRole('button', { name: '显示 Paseo 主侧栏', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(hostSidebar).toBeVisible();
  const hide = page.getByRole('button', { name: '隐藏 Paseo 主侧栏', exact: true });
  await expect(hide).toHaveAttribute('aria-expanded', 'true');
  await hide.click();
  await expect(hostSidebar).toBeHidden();
  await expect(page.getByTestId('board-sidebar')).toBeVisible();
  await page.keyboard.press('Control+Period');
  await expect(hostSidebar).toBeVisible();
  await expect(page.getByRole('button', { name: '隐藏 Paseo 主侧栏', exact: true })).toBeVisible();
  await page.keyboard.press('Control+Period');
  await expect(hostSidebar).toBeHidden();

  await page.goto('/?sidebar=hidden');
  await expect(page.getByTestId('left-sidebar-resize-handle')).toBeHidden();
  await expect(page.getByRole('button', { name: '显示 Paseo 主侧栏', exact: true })).toBeVisible();

  await page.goto('/?sidebar=late');
  await expect(page.getByTestId('left-sidebar-resize-handle')).toHaveCount(1);
  await expect(page.getByTestId('left-sidebar-resize-handle')).toBeHidden();
  await expect(page.getByTestId('board-sidebar')).toBeVisible();

  await page.goto('/?sidebar-button=broken');
  await expect(page.getByTestId('left-sidebar-resize-handle')).toBeHidden();
  await expect(page.getByRole('button', { name: '显示 Paseo 主侧栏', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('present the full-screen board exit as a return action instead of a second close icon', async ({ page }) => {
  const addHostCloseButton = () => page.evaluate(() => {
    const button = document.createElement('div');
    button.dataset.testid = 'plugin-surface-close';
    button.setAttribute('role', 'button');
    button.tabIndex = 0;
    button.setAttribute('aria-label', 'Close plugin');
    button.title = 'Close';
    button.innerHTML = '<svg aria-hidden="true"></svg>';
    button.addEventListener('click', () => {
      document.body.dataset.returnedToPaseo = String(Number(document.body.dataset.returnedToPaseo ?? '0') + 1);
    });
    document.body.appendChild(button);
  });
  await page.goto('/');
  await addHostCloseButton();

  const button = page.getByRole('button', { name: '返回 Paseo 主界面', exact: true });
  await expect(button).toHaveAttribute('title', '返回 Paseo 主界面');
  await expect(button).toHaveAttribute('data-paseo-kanban-return', '');
  await expect(button).toHaveText('返回 Paseo');
  await expect(page.getByTestId('plugin-surface-close')).toBeHidden();
  await button.click();
  await expect(page.locator('body')).toHaveAttribute('data-returned-to-paseo', '1');
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-returned-to-paseo', '2');
  await page.keyboard.press('Space');
  await expect(page.locator('body')).toHaveAttribute('data-returned-to-paseo', '3');

  await page.getByTestId('plugin-surface-close').evaluate(element => element.remove());
  await expect(page.getByTestId('paseo-kanban-surface-return')).toHaveCount(0);

  await page.setViewportSize({ width: 700, height: 800 });
  await page.reload();
  await addHostCloseButton();
  await expect(page.getByTestId('paseo-kanban-surface-return')).toBeVisible();
  await expect(page.getByTestId('board-sidebar')).toHaveCount(0);
});

test('filter workspaces, paste an attachment, and remember the default model', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await expect(page.getByLabel('搜索工作区', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '选择工作区，当前 paseo-kanban / main', exact: true }).click();
  const pickerTop = (await page.getByTestId('workspace-subpanel').getByLabel('选择工作区', { exact: true }).boundingBox())!.y;
  await page.getByLabel('搜索工作区', { exact: true }).fill('agent-service api');
  expect((await page.getByTestId('workspace-subpanel').getByLabel('选择工作区', { exact: true }).boundingBox())!.y).toBe(pickerTop);
  await expect(page.getByRole('button', { name: '选择工作区 agent-service / feature/events', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '选择工作区 paseo-kanban / main', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '选择工作区 agent-service / feature/events', exact: true }).click();
  await expect(page.getByTestId('workspace-subpanel')).toHaveCount(0);
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

test('create a project workspace while creating a task', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await page.getByLabel('任务标题', { exact: true }).fill('初始化新产品');
  await page.getByRole('button', { name: '选择工作区，当前 paseo-kanban / main', exact: true }).click();
  await page.getByRole('button', { name: '新建项目', exact: true }).click();
  await expect(page.getByText('将在 J:\\ai-ideas 下创建同名项目目录，并自动创建工作区。')).toBeVisible();
  await page.getByLabel('新项目名称', { exact: true }).fill('brand-new-product');
  await page.getByRole('button', { name: '创建项目和工作区', exact: true }).click();
  await expect(page.getByRole('button', { name: '选择工作区，当前 brand-new-product / brand-new-product', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '创建待办任务', exact: true }).click();
  await expect(page.getByRole('button', { name: '查看任务 初始化新产品', exact: true })).toBeVisible();
  await expect(page.getByTestId(/card-task:/).filter({ hasText: '初始化新产品' })).toContainText('brand-new-product');
});

test('show an actionable error when a new project cannot be created', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await page.getByRole('button', { name: '选择工作区，当前 paseo-kanban / main', exact: true }).click();
  await page.getByRole('button', { name: '新建项目', exact: true }).click();
  await page.getByLabel('新项目名称', { exact: true }).fill('paseo-kanban');
  await page.getByRole('button', { name: '创建项目和工作区', exact: true }).click();
  await expect(page.getByTestId('workspace-subpanel').getByRole('alert')).toContainText('项目目录已存在');
  await expect(page.getByLabel('新项目名称', { exact: true })).toBeVisible();
});

test('workspace board can target another existing workspace or a new project', async ({ page }) => {
  await page.goto('/?workspace-board');
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  const picker = page.getByRole('button', { name: '选择工作区，当前 paseo-kanban / main', exact: true });
  await expect(picker).toBeEnabled();
  await picker.click();
  await expect(page.getByRole('button', { name: '选择工作区 agent-service / feature/events', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '新建项目', exact: true })).toBeVisible();
});

test('change workspace and paste another attachment before a task starts', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await page.getByLabel('任务标题', { exact: true }).fill('可调整工作区的任务');
  await page.getByRole('button', { name: '创建待办任务', exact: true }).click();

  await page.getByRole('button', { name: '选择工作区，当前 paseo-kanban / main', exact: true }).click();
  await page.getByRole('button', { name: '选择工作区 agent-service / feature/events', exact: true }).click();
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['detail paste'], 'detail-paste.png', { type: 'image/png' }));
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
  });
  await expect(page.getByText('detail-paste.png', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByTestId('task-attachments').getByText('detail-paste.png', { exact: true })).toBeVisible();
  await expect(page.getByTestId(/card-task:/).filter({ hasText: '可调整工作区的任务' })).toContainText('agent-service');

  await page.reload();
  await page.getByRole('button', { name: '查看任务 可调整工作区的任务', exact: true }).click();
  await expect(page.getByRole('button', { name: '选择工作区，当前 agent-service / feature/events', exact: true })).toBeVisible();
  await expect(page.getByTestId('task-attachments').getByText('detail-paste.png', { exact: true })).toBeVisible();
});

test('paste goes only to the visible new-task attachment picker', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '查看任务 设计任务通知与收件箱', exact: true }).click();
  await page.keyboard.press('n');
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['single target'], 'only-new-task.png', { type: 'image/png' }));
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
  });
  await expect(page.getByText('only-new-task.png', { exact: true })).toHaveCount(1);
  await page.getByLabel('关闭新建任务', { exact: true }).click();
  await page.getByRole('button', { name: '放弃修改', exact: true }).click();
  await expect(page.getByText('only-new-task.png', { exact: true })).toHaveCount(0);
});

test('confirm before discarding a changed new task with Escape', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  const title = page.getByLabel('任务标题', { exact: true });
  await title.fill('不能意外丢失的草稿');
  await page.keyboard.press('Escape');
  const confirmation = page.getByRole('alert');
  await expect(confirmation).toContainText('放弃未保存的修改？');
  await page.keyboard.press('Tab');
  await expect(confirmation.locator('button:focus')).toHaveCount(1);
  await page.keyboard.down('Escape');
  await expect(confirmation).toHaveCount(0);
  await page.keyboard.up('Escape');
  await expect(confirmation).toHaveCount(0);
  await expect(title).toHaveValue('不能意外丢失的草稿');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '继续编辑', exact: true }).click();
  await expect(title).toHaveValue('不能意外丢失的草稿');
  await page.getByLabel('关闭新建任务', { exact: true }).click();
  await page.getByRole('button', { name: '放弃修改', exact: true }).click();
  await expect(page.getByRole('heading', { name: '新建任务', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: '新建任务', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: /^查看任务 / }).first().click();
  await expect(page.getByLabel('关闭详情', { exact: true })).toHaveCount(1);
  await page.keyboard.press('n');
  await page.keyboard.down('Escape');
  await expect(page.getByRole('heading', { name: '新建任务', exact: true })).toHaveCount(0);
  await page.keyboard.up('Escape');
  await expect(page.getByLabel('关闭详情', { exact: true })).toHaveCount(1);
});

test('create a new task with Ctrl+Enter', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await page.getByLabel('任务标题', { exact: true }).fill('快捷键创建任务');
  await page.keyboard.press('Control+Enter');
  await expect(page.getByRole('heading', { name: '新建任务', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /查看任务 快捷键创建任务/ })).toBeVisible();
});

test('do not submit with Ctrl+Enter while discard confirmation is open', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await page.getByLabel('任务标题', { exact: true }).fill('确认框后的任务');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alert')).toContainText('放弃未保存的修改？');
  await page.keyboard.press('Control+Enter');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: /查看任务 确认框后的任务/ })).toHaveCount(0);
});

test('do not close a new task while a pasted attachment is still loading', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await page.evaluate(() => {
    const original = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function(blob) { setTimeout(() => original.call(this, blob), 500); };
    const transfer = new DataTransfer();
    transfer.items.add(new File(['clipboard image'], 'slow-clipboard.png', { type: 'image/png' }));
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
  });
  await expect(page.getByText('正在读取附件…', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: '新建任务', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('slow-clipboard.png', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alert')).toContainText('放弃未保存的修改？');
});

test('create, save, launch and navigate with persisted task metadata', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Thinking Mode Medium', exact: true })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Thinking Mode High', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'codex / 示例模型', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Thinking Mode High', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'codex / 无 Thinking 模型', exact: true }).click();
  await expect(page.getByText('当前模型不支持 Thinking Mode', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'codex / 示例模型', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Thinking Mode High', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: 'Thinking Mode Low', exact: true }).click();
  await expect(page.getByRole('radio', { name: '运行模式 Full Access', exact: true })).toBeChecked();
  await page.getByLabel('任务标题', { exact: true }).fill('端到端验证任务');
  await page.getByLabel('任务说明', { exact: true }).fill('确认任务内容在启动前被保存');
  await page.getByLabel('标签（逗号分隔）', { exact: true }).fill('回归, 测试');
  await page.getByRole('button', { name: '创建待办任务', exact: true }).click();
  await expect(page.getByTestId('column-todo').getByRole('button', { name: '查看任务 端到端验证任务', exact: true })).toBeVisible();
  const detail = page.getByTestId('task-detail-dialog');
  const startButton = detail.getByRole('button', { name: '开始执行', exact: true });
  expect((await startButton.boundingBox())!.y).toBeLessThan((await detail.getByLabel('任务标题', { exact: true }).boundingBox())!.y);
  await expect(page.getByTestId('task-run-mode')).toHaveText('Full Access');
  await expect(page.getByTestId('task-thinking-mode')).toHaveText('Low');
  await page.getByLabel('任务标题', { exact: true }).fill('修改后的验证任务');
  await expect(page.getByRole('button', { name: '开始执行', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByRole('button', { name: '开始执行', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '开始执行', exact: true }).click();
  await expect(page.getByTestId('column-running').getByRole('button', { name: '查看任务 修改后的验证任务', exact: true })).toBeVisible();
  await expect(page.locator('#preview-event')).toHaveText('');
  const openConversation = detail.getByRole('button', { name: '打开 Paseo 会话', exact: true });
  await expect(openConversation).toBeVisible();
  expect((await openConversation.boundingBox())!.y).toBeLessThan((await detail.getByLabel('任务标题', { exact: true }).boundingBox())!.y);
  await openConversation.click();
  await expect(page.locator('#preview-event')).toContainText('打开会话');
  await page.reload();
  await page.getByRole('button', { name: '查看任务 修改后的验证任务', exact: true }).click();
  await expect(page.getByLabel('任务说明', { exact: true })).toHaveValue('确认任务内容在启动前被保存');
  await expect(page.getByLabel('标签（逗号分隔）', { exact: true })).toHaveValue('回归, 测试');
  await expect(page.getByTestId('task-run-mode')).toHaveText('Full Access');
});

test('show launch failures inside the task modal and keep the task ready to retry', async ({ page }) => {
  await page.goto('/?launch-error');
  await page.getByRole('button', { name: '查看任务 设计任务通知与收件箱', exact: true }).click();
  const detail = page.getByTestId('task-detail-dialog');
  await detail.getByRole('button', { name: '开始执行', exact: true }).click();

  await expect(detail.getByRole('alert')).toContainText('Agent 启动失败，请稍后重试。');
  await expect(detail.getByRole('button', { name: '开始执行', exact: true })).toBeEnabled();
  await expect(detail.getByRole('button', { name: '打开 Paseo 会话', exact: true })).toHaveCount(0);
  await expect(page.locator('#preview-event')).toHaveText('');
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
  await expect(page.getByTestId('task-thinking-mode')).toHaveText('High');
});

test('launched legacy tasks do not guess an unrecorded thinking mode', async ({ page }) => {
  await page.goto('/');
  const taskCard = () => page.getByTestId('card-task:preview-02').getByRole('button', { name: '查看任务 设计任务通知与收件箱', exact: true });
  await taskCard().click();
  await page.getByRole('button', { name: '开始执行', exact: true }).click();
  await page.evaluate(() => {
    const key = 'paseo-kanban-preview-v1';
    const snapshot = JSON.parse(localStorage.getItem(key)!);
    delete snapshot.store.tasks['task:preview-02'].thinkingOptionId;
    localStorage.setItem(key, JSON.stringify(snapshot));
  });
  await page.reload();
  await taskCard().click();
  await expect(page.getByTestId('task-thinking-mode')).toHaveText('未记录（Agent 默认）');

  await page.evaluate(() => {
    const key = 'paseo-kanban-preview-v1';
    const snapshot = JSON.parse(localStorage.getItem(key)!);
    delete snapshot.store.tasks['task:preview-02'].agentId;
    snapshot.store.tasks['task:preview-02'].launchState = 'uncertain';
    localStorage.setItem(key, JSON.stringify(snapshot));
  });
  await page.reload();
  await taskCard().click();
  await expect(page.getByTestId('task-thinking-mode')).toHaveText('未记录（Agent 默认）');
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
  const detail = page.getByTestId('task-detail-dialog');
  const detailBox = await detail.boundingBox();
  expect(detailBox!.width).toBeLessThanOrEqual(366);
  expect(detailBox!.height).toBeLessThanOrEqual(820);
  await expect(detail.getByRole('button', { name: '开始执行', exact: true })).toBeVisible();
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
