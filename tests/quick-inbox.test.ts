import assert from 'node:assert/strict';
import test from 'node:test';
import { isOpenInboxShortcut, registerOpenInboxShortcut } from '../client/quick-inbox';

const shortcut = (overrides: Partial<Parameters<typeof isOpenInboxShortcut>[0]> = {}) => ({
  altKey: false,
  code: 'KeyI',
  ctrlKey: true,
  metaKey: false,
  shiftKey: true,
  ...overrides,
});

test('opens Inbox for Ctrl+Shift+I only', () => {
  assert.equal(isOpenInboxShortcut(shortcut()), true);
  assert.equal(isOpenInboxShortcut(shortcut({ ctrlKey: false })), false);
  assert.equal(isOpenInboxShortcut(shortcut({ metaKey: true })), false);
  assert.equal(isOpenInboxShortcut(shortcut({ shiftKey: false })), false);
  assert.equal(isOpenInboxShortcut(shortcut({ altKey: true })), false);
  assert.equal(isOpenInboxShortcut(shortcut({ code: 'KeyK' })), false);
});

test('registers and removes the global Inbox shortcut', () => {
  const target = new EventTarget();
  let opened = 0;
  const cleanup = registerOpenInboxShortcut(() => { opened += 1; }, target);
  const keydown = () => Object.assign(new Event('keydown', { cancelable: true }), shortcut());
  const first = keydown();
  target.dispatchEvent(first);
  assert.equal(opened, 1);
  assert.equal(first.defaultPrevented, true);
  cleanup();
  target.dispatchEvent(keydown());
  assert.equal(opened, 1);
});

test('only one duplicate global listener opens the Inbox modal', () => {
  const target = new EventTarget();
  let opened = 0;
  const first = registerOpenInboxShortcut(() => { opened += 1; }, target);
  const second = registerOpenInboxShortcut(() => { opened += 1; }, target);
  target.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), shortcut()));
  assert.equal(opened, 1);
  second();
  first();
});
