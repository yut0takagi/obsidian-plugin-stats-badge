import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { backfill } from './backfill.ts';
import { renderBadge } from './badge.ts';
import { renderChart } from './chart.ts';
import {
  clampToDays,
  emptyHistory,
  mergeHistory,
  parseHistory,
  toCsv,
  toDeltas,
  type HistoryFile,
} from './history.ts';
import { fetchStats, parsePlugin } from './stats.ts';
import type { Series } from './types.ts';

export interface RunOptions {
  /** Plugin ids, as they appear in the community list. */
  ids: string[];
  /** Directory the generated files are written to. */
  outDir: string;
  /** Reconstruct history from the upstream git log when no history file exists. */
  backfill: boolean;
  /** Restrict the chart to the last N days. 0 charts everything. */
  days: number;
  /** Chart daily downloads rather than the running total. */
  delta: boolean;
  chartTitle: string;
  badgeLabel: string;
  badgeColor: string;
  /** Also emit history.csv. */
  csv: boolean;
  log?: (message: string) => void;
}

export interface RunResult {
  history: HistoryFile;
  totals: Record<string, number>;
  /** Combined downloads across every requested plugin. */
  total: number;
  written: string[];
}

const HISTORY_FILE = 'history.json';

async function writeFileEnsuringDir(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, 'utf8');
}

async function readHistory(path: string): Promise<HistoryFile> {
  try {
    return parseHistory(await readFile(path, 'utf8'));
  } catch {
    return emptyHistory();
  }
}

export async function run(options: RunOptions): Promise<RunResult> {
  const log = options.log ?? (() => {});
  const historyPath = join(options.outDir, HISTORY_FILE);
  let history = await readHistory(historyPath);

  const known = Object.keys(history.plugins);
  const missing = options.ids.filter((id) => !known.includes(id));

  // Only backfill plugins with no stored history: the git walk takes ~100s, and a plugin
  // already being tracked gains nothing from re-deriving days it has.
  if (options.backfill && missing.length > 0) {
    log(`Backfilling ${missing.length} plugin(s) from the upstream git history…`);
    const restored = await backfill({
      ids: missing,
      onProgress: (done, total) => {
        if (done % 250 === 0 || done === total) log(`  ${done}/${total} snapshots`);
      },
    });
    history = mergeHistory(history, restored);
    for (const entry of restored) {
      log(`  ${entry.id}: ${entry.points.length} days restored`);
    }
  }

  // Always record today from the live file, so a run is useful even without backfill.
  const document = await fetchStats();
  const today = new Date().toISOString().slice(0, 10);
  const totals: Record<string, number> = {};
  const todaySeries: Series[] = [];

  for (const id of options.ids) {
    const stats = parsePlugin(document, id);
    if (!stats) {
      log(`  ${id}: not found in the community plugin list (skipped)`);
      continue;
    }
    totals[id] = stats.downloads;
    todaySeries.push({ id, points: [{ date: today, downloads: stats.downloads }] });
  }

  if (todaySeries.length === 0) {
    throw new Error(
      `None of the requested plugins were found: ${options.ids.join(', ')}. ` +
        'Check the ids against the plugin id in your manifest.json.',
    );
  }

  history = mergeHistory(history, todaySeries);

  const total = Object.values(totals).reduce((sum, value) => sum + value, 0);
  const written: string[] = [];

  await writeFileEnsuringDir(historyPath, `${JSON.stringify(history, null, 1)}\n`);
  written.push(historyPath);

  if (options.csv) {
    const csvPath = join(options.outDir, 'history.csv');
    await writeFileEnsuringDir(csvPath, toCsv(history));
    written.push(csvPath);
  }

  const chartSeries: Series[] = options.ids
    .filter((id) => history.plugins[id]?.length)
    .map((id) => {
      let points = clampToDays(history.plugins[id], options.days);
      if (options.delta) points = toDeltas(points);
      return { id, points };
    })
    .filter((entry) => entry.points.length > 0);

  const chartPath = join(options.outDir, 'downloads.svg');
  await writeFileEnsuringDir(
    chartPath,
    renderChart(chartSeries, { title: options.chartTitle, delta: options.delta }),
  );
  written.push(chartPath);

  const badgePath = join(options.outDir, 'badge.svg');
  await writeFileEnsuringDir(
    badgePath,
    renderBadge(total, { label: options.badgeLabel, color: options.badgeColor }),
  );
  written.push(badgePath);

  // A per-plugin badge as well, so a multi-plugin run can badge each repository.
  if (options.ids.length > 1) {
    for (const [id, value] of Object.entries(totals)) {
      const path = join(options.outDir, `badge-${id}.svg`);
      await writeFileEnsuringDir(
        path,
        renderBadge(value, { label: options.badgeLabel, color: options.badgeColor }),
      );
      written.push(path);
    }
  }

  return { history, totals, total, written };
}
