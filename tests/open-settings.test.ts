import assert from 'node:assert/strict';
import test from 'node:test';
import { installOpenKanbanSettings, openKanbanSettings } from '../client/open-settings';

test('settings navigation bridge opens the plugin settings and cleans up safely', () => {
  let opens = 0;
  const cleanup = installOpenKanbanSettings(() => { opens += 1; });
  openKanbanSettings();
  assert.equal(opens, 1);
  cleanup();
  openKanbanSettings();
  assert.equal(opens, 1);
});
