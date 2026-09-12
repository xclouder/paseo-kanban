import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyProjectAction, projectLayoutSchema, projectSections } from '../shared/projects';
import { storeSchema } from '../shared/model';

const projects = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }, { id: 'c', name: 'Gamma' }];
test('legacy boards gain an empty layout and new projects remain discoverable after sorting', () => {
  const layout = storeSchema.parse({ version: 1, tasks: {}, sessions: {} }).projectLayout;
  applyProjectAction(layout, { type: 'moveProject', id: 'b', groupId: null, beforeId: 'a' }, projects);
  assert.deepEqual(projectSections([...projects, { id: 'new', name: 'New' }], layout)[0].projects.map(project => project.id), ['b', 'a', 'c', 'new']);
});
test('group operations preserve membership, ordering and projects on group deletion', () => {
  const layout = projectLayoutSchema.parse({});
  for (const id of ['g1', 'g2']) applyProjectAction(layout, { type: 'createGroup', id, name: id }, projects);
  applyProjectAction(layout, { type: 'moveProject', id: 'a', groupId: 'g1' }, projects);
  applyProjectAction(layout, { type: 'moveProject', id: 'c', groupId: 'g1', beforeId: 'a' }, projects);
  applyProjectAction(layout, { type: 'renameGroup', id: 'g1', name: '  Work  ' }, projects);
  applyProjectAction(layout, { type: 'collapseGroup', id: 'g1', collapsed: true }, projects);
  applyProjectAction(layout, { type: 'moveGroup', id: 'g2', beforeId: 'g1' }, projects);
  const reloaded = projectLayoutSchema.parse(JSON.parse(JSON.stringify(layout)));
  const sections = projectSections(projects, reloaded);
  assert.deepEqual(sections.map(section => section.id), ['g2', 'g1', null]);
  assert.equal(sections[1].name, 'Work');
  assert.equal(sections[1].collapsed, true);
  assert.deepEqual(sections[1].projects.map(project => project.id), ['c', 'a']);
  applyProjectAction(reloaded, { type: 'deleteGroup', id: 'g1' }, projects);
  assert.deepEqual(reloaded.membership, {});
  assert.equal(projectSections(projects, reloaded).at(-1)!.projects.length, 3);
});
test('stale move destinations are rejected without changing saved layout', () => {
  const layout = projectLayoutSchema.parse({ groups: [{ id: 'group', name: 'Group' }], membership: { a: 'group' } });
  const before = structuredClone(layout);
  assert.throws(() => applyProjectAction(layout, { type: 'moveProject', id: 'b', groupId: 'missing' }, projects), /分组已不存在/);
  assert.throws(() => applyProjectAction(layout, { type: 'moveProject', id: 'b', groupId: null, beforeId: 'a' }, projects), /目标项目已移动/);
  assert.deepEqual(layout, before);
});
