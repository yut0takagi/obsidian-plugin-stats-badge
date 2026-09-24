import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderBadge, formatDownloads } from '../src/badge.ts';
import { renderChart } from '../src/chart.ts';
import type { Series } from '../src/types.ts';

function series(id: string, values: number[]): Series {
  return {
    id,
    points: values.map((downloads, index) => ({
      date: `2026-01-${String(index + 1).padStart(2, '0')}`,
      downloads,
    })),
  };
}

/** Width and height as declared on the root element. */
function dimensions(svg: string): { width: number; height: number } {
  const width = /width="(\d+)"/.exec(svg);
  const height = /height="(\d+)"/.exec(svg);
  assert.ok(width && height);
  return { width: Number(width[1]), height: Number(height[1]) };
}

test('formatDownloads abbreviates large numbers', () => {
  assert.equal(formatDownloads(87), '87');
  assert.equal(formatDownloads(999), '999');
  assert.equal(formatDownloads(2053), '2.1k');
  assert.equal(formatDownloads(45_231), '45k');
  assert.equal(formatDownloads(5_021_682), '5.0M');
  assert.equal(formatDownloads(12_500_000), '13M');
});

test('a badge is well-formed and states its value accessibly', () => {
  const svg = renderBadge(2053);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /<\/svg>$/);
  assert.match(svg, /aria-label="downloads: 2\.1k"/);
  assert.match(svg, /<title>downloads: 2\.1k<\/title>/);
});

test('a badge grows to fit a long label instead of clipping it', () => {
  const narrow = dimensions(renderBadge(1, { label: 'dl' }));
  const wide = dimensions(renderBadge(1, { label: 'obsidian downloads total' }));
  assert.ok(wide.width > narrow.width + 80, `${wide.width} should be much wider than ${narrow.width}`);
});

test('badge text is escaped rather than breaking the document', () => {
  const svg = renderBadge(1, { label: 'a<b&c' });
  assert.match(svg, /a&lt;b&amp;c/);
  assert.doesNotMatch(svg, /a<b&c/);
});

test('a chart renders one path per plugin plus an end marker', () => {
  const svg = renderChart([series('alpha', [1, 5, 9]), series('beta', [2, 4, 6])]);
  assert.equal([...svg.matchAll(/<path /g)].length, 2);
  assert.equal([...svg.matchAll(/<circle /g)].length, 2);
  assert.match(svg, /alpha \(9\)/);
  assert.match(svg, /beta \(6\)/);
});

test('a chart carries no external references, which camo would strip', () => {
  const svg = renderChart([series('alpha', [1, 2, 3])]);
  for (const forbidden of ['<script', '<image', 'xlink:href', '@import', '<foreignObject', '<animate']) {
    assert.ok(!svg.includes(forbidden), `SVG must not contain ${forbidden}`);
  }
  // The only URL is the SVG namespace itself, which is a declaration, not a fetch.
  const urls = [...svg.matchAll(/https?:\/\/[^"'\s]+/g)].map((m) => m[0]);
  assert.deepEqual([...new Set(urls)], ['http://www.w3.org/2000/svg']);
});

test('a chart adapts to both GitHub themes in one file', () => {
  const svg = renderChart([series('alpha', [1, 2, 3])]);
  assert.match(svg, /@media\(prefers-color-scheme:dark\)/);
  assert.match(svg, /<rect class="bg"/);
});

test('the legend wraps onto more lines and the chart grows to fit it', () => {
  const few = renderChart([series('a', [1, 2])]);
  const many = renderChart(
    Array.from({ length: 8 }, (_, i) => series(`plugin-with-a-long-name-${i}`, [1, 2])),
  );
  assert.ok(
    dimensions(many).height > dimensions(few).height,
    'a wrapped legend must not overlap the axis',
  );
});

test('every drawn point stays inside the frame', () => {
  const svg = renderChart([series('alpha', [0, 500, 1000])]);
  const { width, height } = dimensions(svg);
  for (const match of svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)"/g)) {
    const cx = Number(match[1]);
    const cy = Number(match[2]);
    assert.ok(cx >= 0 && cx <= width, `cx ${cx} outside 0..${width}`);
    assert.ok(cy >= 0 && cy <= height, `cy ${cy} outside 0..${height}`);
  }
});

test('a single observation still renders', () => {
  const svg = renderChart([series('alpha', [42])]);
  assert.match(svg, /<path /);
  assert.match(svg, /alpha \(42\)/);
});

test('no data produces a readable placeholder rather than a broken chart', () => {
  const svg = renderChart([]);
  assert.match(svg, /No download data yet/);
  assert.match(svg, /<\/svg>$/);
});

test('plugin ids are escaped in the legend', () => {
  const svg = renderChart([{ id: 'a<b', points: [{ date: '2026-01-01', downloads: 1 }] }]);
  assert.match(svg, /a&lt;b/);
});
