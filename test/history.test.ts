import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  clampToDays,
  emptyHistory,
  mergeHistory,
  mergeSeries,
  parseHistory,
  toCsv,
  toDeltas,
} from '../src/history.ts';

const point = (date: string, downloads: number) => ({ date, downloads });

test('mergeSeries sorts by date and keeps history in order', () => {
  const merged = mergeSeries(
    [point('2026-01-02', 20), point('2026-01-01', 10)],
    [point('2026-01-03', 30)],
  );
  assert.deepEqual(merged.map((p) => p.date), ['2026-01-01', '2026-01-02', '2026-01-03']);
});

test('re-running on the same day corrects that day instead of duplicating it', () => {
  const merged = mergeSeries([point('2026-01-01', 10)], [point('2026-01-01', 12)]);
  assert.deepEqual(merged, [point('2026-01-01', 12)]);
});

test('mergeHistory leaves untouched plugins alone', () => {
  const history = {
    version: 1 as const,
    plugins: { a: [point('2026-01-01', 1)], b: [point('2026-01-01', 5)] },
  };
  const merged = mergeHistory(history, [{ id: 'a', points: [point('2026-01-02', 2)] }]);
  assert.equal(merged.plugins.a.length, 2);
  assert.deepEqual(merged.plugins.b, [point('2026-01-01', 5)]);
});

test('toDeltas reports day-over-day downloads', () => {
  const deltas = toDeltas([point('2026-01-01', 10), point('2026-01-02', 18), point('2026-01-03', 20)]);
  assert.deepEqual(deltas, [point('2026-01-02', 8), point('2026-01-03', 2)]);
});

test('a delist resetting the upstream count does not produce a negative day', () => {
  // A plugin removed and relisted has its count reset; that is a source artifact, not
  // downloads being returned.
  const deltas = toDeltas([point('2026-01-01', 900), point('2026-01-02', 5), point('2026-01-03', 9)]);
  assert.deepEqual(deltas, [point('2026-01-02', 0), point('2026-01-03', 4)]);
});

test('toDeltas on a single point yields nothing to draw', () => {
  assert.deepEqual(toDeltas([point('2026-01-01', 10)]), []);
  assert.deepEqual(toDeltas([]), []);
});

test('clampToDays keeps one point before the cutoff so the line starts on-axis', () => {
  const points = [
    point('2026-01-01', 1), point('2026-01-05', 5),
    point('2026-01-09', 9), point('2026-01-10', 10),
  ];
  const clamped = clampToDays(points, 3);
  assert.equal(clamped[0].date, '2026-01-05');
  assert.equal(clamped[clamped.length - 1].date, '2026-01-10');
});

test('clampToDays returns everything when the window covers the history', () => {
  const points = [point('2026-01-01', 1), point('2026-01-02', 2)];
  assert.deepEqual(clampToDays(points, 365), points);
  assert.deepEqual(clampToDays(points, 0), points);
});

test('parseHistory survives a corrupt or hand-edited file', () => {
  assert.deepEqual(parseHistory('{}'), emptyHistory());
  assert.deepEqual(parseHistory('null'), emptyHistory());
  assert.deepEqual(parseHistory('{"plugins":"nope"}'), emptyHistory());
  // Malformed rows are dropped, valid ones survive.
  const partial = parseHistory('{"version":1,"plugins":{"a":[{"date":"2026-01-01","downloads":3},7]}}');
  assert.deepEqual(partial.plugins.a, [point('2026-01-01', 3)]);
});

test('csv aligns plugins into columns and leaves gaps empty', () => {
  const csv = toCsv({
    version: 1,
    plugins: {
      b: [point('2026-01-02', 7)],
      a: [point('2026-01-01', 1), point('2026-01-02', 2)],
    },
  });
  assert.equal(csv, 'date,a,b\n2026-01-01,1,\n2026-01-02,2,7\n');
});
