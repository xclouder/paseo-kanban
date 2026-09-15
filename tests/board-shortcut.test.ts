import assert from 'node:assert/strict';
import test from 'node:test';
import { isBoardSurfacePath, isOpenBoardShortcut, openBoardSurfaceOnce, registerOpenBoardShortcut } from '../client/board-shortcut';

const shortcut = (overrides: Partial<Parameters<typeof isOpenBoardShortcut>[0]> = {}) => ({
  altKey: false,
  code: 'KeyK',
  ctrlKey: true,
  metaKey: false,
  shiftKey: true,
  ...overrides,
});

test('opens the board for Ctrl/Command+Shift+K only', () => {
  assert.equal(isOpenBoardShortcut(shortcut()), true);
  assert.equal(isOpenBoardShortcut(shortcut({ ctrlKey: false, metaKey: true })), true);
  assert.equal(isOpenBoardShortcut(shortcut({ shiftKey: false })), false);
  assert.equal(isOpenBoardShortcut(shortcut({ altKey: true })), false);
  assert.equal(isOpenBoardShortcut(shortcut({ code: 'Period' })), false);
});

test('registers and removes the global board shortcut', () => {
  const target = new EventTarget();
  let opened = 0;
  const cleanup = registerOpenBoardShortcut(() => { opened += 1; }, target);
  const keydown = () => Object.assign(new Event('keydown', { cancelable: true }), shortcut());

  const first = keydown();
  target.dispatchEvent(first);
  assert.equal(opened, 1);
  assert.equal(first.defaultPrevented, true);

  cleanup();
  target.dispatchEvent(keydown());
  assert.equal(opened, 1);
});

test('does not push another board surface when the board is already active', () => {
  let opened = 0;
  assert.equal(isBoardSurfacePath('/h/local/plugin/paseo-kanban/surface/board'), true);
  assert.equal(isBoardSurfacePath('/h/local/plugin/paseo-kanban/surface/board/'), true);
  assert.equal(isBoardSurfacePath('/h/local/plugin/paseo-kanban-copy/surface/board'), false);
  assert.equal(isBoardSurfacePath('/h/local/plugin/paseo-kanban/surface/board-copy'), false);
  assert.equal(isBoardSurfacePath('/h/local/workspace/main'), false);
  assert.equal(openBoardSurfaceOnce(() => { opened += 1; }, '/h/local/plugin/paseo-kanban/surface/board'), false);
  assert.equal(openBoardSurfaceOnce(() => { opened += 1; }, '/h/local/workspace/main'), true);
  assert.equal(opened, 1);
});

test('only one duplicate global listener handles the same shortcut event', () => {
  const target = new EventTarget();
  let opened = 0;
  const cleanupFirst = registerOpenBoardShortcut(() => { opened += 1; }, target, () => '/h/local/workspace/main');
  const cleanupSecond = registerOpenBoardShortcut(() => { opened += 1; }, target, () => '/h/local/workspace/main');

  target.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), shortcut()));
  assert.equal(opened, 1);

  cleanupSecond();
  cleanupFirst();
});
