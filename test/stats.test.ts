import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { isVersionKey, listPluginIds, normalizeVersion, parsePlugin } from '../src/stats.ts';

const FIXTURE = new URL('./fixtures/stats-sample.json', import.meta.url);

test('version keys accept the messy release names that occur upstream', () => {
  const real = [
    '1.0.0', '0.1.0', 'v1.2.3', '2.28.0-beta.3', '1.0', '10.4.1',
    'V1.0.6',              // uppercase prefix (ai-idea-capture)
    '0.2.7patched',        // suffixed (obsidian-annotator)
    '3.0.0b',              // suffixed (continuous-mode)
    'agent-llms-0.7.2',    // plugin name prefixed (agent-llms)
    'cli-v0.1.1-beta',     // tool prefixed (base-board)
  ];
  for (const key of real) {
    assert.equal(isVersionKey(key), true, `${key} should be a version`);
  }
});

test('version keys reject keys that carry no version number', () => {
  // All of these are real keys in community-plugin-stats.json.
  const junk = [
    'build/main.js', 'publish', 'push', 'Obsidian', 'Obsidian-Timeline',
    '全功能支持', 'Initial-Release', 'public', 'downloads', 'updated',
  ];
  for (const key of junk) {
    assert.equal(isVersionKey(key), false, `${key} should not be a version`);
  }
});

test('a leading v or V is stripped so one release is not counted twice', () => {
  assert.equal(normalizeVersion('v1.0.0'), '1.0.0');
  assert.equal(normalizeVersion('V1.0.6'), '1.0.6');
  assert.equal(normalizeVersion('1.0.0'), '1.0.0');
  // Not a prefix: the v belongs to the name.
  assert.equal(normalizeVersion('version-2.0'), 'version-2.0');
});

test('parsePlugin merges v-prefixed duplicates of the same release', () => {
  const raw = { demo: { downloads: 11, updated: 1, '1.0.0': 7, 'v1.0.0': 4 } };
  const stats = parsePlugin(raw, 'demo');
  assert.ok(stats);
  assert.deepEqual(stats.versions, { '1.0.0': 11 });
});

test('parsePlugin drops junk keys from the version breakdown', () => {
  const raw = { demo: { downloads: 5, updated: 1, '1.0.0': 5, 'build/main.js': 99 } };
  const stats = parsePlugin(raw, 'demo');
  assert.ok(stats);
  assert.deepEqual(Object.keys(stats.versions), ['1.0.0']);
});

test('parsePlugin keeps the reported total even when junk keys hold downloads', () => {
  // first-timeline really does have 19 downloads filed under `Obsidian-Timeline`.
  const raw = { demo: { downloads: 100, updated: 1, '1.0.0': 81, 'Obsidian-Timeline': 19 } };
  const stats = parsePlugin(raw, 'demo');
  assert.ok(stats);
  // The badge shows the upstream total, never a recomputed sum of the versions.
  assert.equal(stats.downloads, 100);
  assert.equal(Object.values(stats.versions).reduce((a, b) => a + b, 0), 81);
});

test('parsePlugin returns undefined for unknown or malformed entries', () => {
  assert.equal(parsePlugin({}, 'missing'), undefined);
  assert.equal(parsePlugin({ demo: null }, 'demo'), undefined);
  assert.equal(parsePlugin({ demo: { updated: 1 } }, 'demo'), undefined);
  assert.equal(parsePlugin(null, 'demo'), undefined);
});

test('every plugin in the real fixture parses', () => {
  const document: unknown = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  const ids = listPluginIds(document);
  assert.ok(ids.length > 0);

  for (const id of ids) {
    const stats = parsePlugin(document, id);
    assert.ok(stats, `${id} should parse`);
    assert.ok(stats.downloads > 0, `${id} should report downloads`);
    assert.ok(Object.keys(stats.versions).length > 0, `${id} should have versions`);
  }
});

test('version counts reconcile with the total, except for true junk keys', () => {
  const document: unknown = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  // Measured upstream: 7,965 of 7,988 plugins reconcile exactly. The rest file some
  // downloads under keys with no version number, so the sum is short but never over.
  const shortfalls: Record<string, number> = {};

  for (const id of listPluginIds(document)) {
    const stats = parsePlugin(document, id)!;
    const sum = Object.values(stats.versions).reduce((total, count) => total + count, 0);
    assert.ok(sum <= stats.downloads, `${id}: versions must not exceed the total`);
    if (sum !== stats.downloads) shortfalls[id] = stats.downloads - sum;
  }

  // Exactly the fixture's known-junk plugins, and no others.
  assert.deepEqual(shortfalls, {
    dataview: 17,              // "build/main.js"
    'obsidian-admonition': 7,  // "publish"
    'first-timeline': 19,      // "Obsidian-Timeline"
    'favorite-note': 17,       // "push"
  });
});
