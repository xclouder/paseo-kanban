import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from '../preview/fixture';
import { readCachedBoard, saveCachedBoard, readWithTimeout } from '../client/board-cache';

test('snapshot cache is host scoped, validated, age bounded, and tolerates unavailable storage', () => {
  const entries = new Map<string, string>();
  const storage = { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); } };
  const snapshot = fixture(); snapshot.fetchedAt = new Date().toISOString();
  saveCachedBoard('one', snapshot, storage);
  assert.equal(readCachedBoard('one', storage)?.agents.length, snapshot.agents.length);
  assert.equal(readCachedBoard('two', storage), undefined);
  assert.equal(readCachedBoard('one', storage, Date.now() + 25 * 3600000), undefined);
  assert.equal(readCachedBoard('one', storage, Date.now() - 3600000), undefined);
  entries.forEach((_, key) => entries.set(key, '{broken'));
  assert.equal(readCachedBoard('one', storage), undefined);
  const unavailable = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
  assert.equal(readCachedBoard('one', unavailable), undefined);
  assert.doesNotThrow(() => saveCachedBoard('one', snapshot, unavailable));
});

test('a stalled board read ends with a retryable error', async () => {
  await assert.rejects(readWithTimeout(() => new Promise<never>(() => {}), 10), /超时/);
  assert.equal(await readWithTimeout(async () => 'ready', 100), 'ready');
});
