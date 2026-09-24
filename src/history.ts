import type { Point, Series } from './types.ts';

/** On-disk shape of the history file the action commits. */
export interface HistoryFile {
  /** Schema version, so later releases can migrate old files. */
  version: 1;
  plugins: Record<string, Point[]>;
}

export function emptyHistory(): HistoryFile {
  return { version: 1, plugins: {} };
}

export function parseHistory(text: string): HistoryFile {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null) return emptyHistory();

  const record = parsed as Record<string, unknown>;
  const plugins = record.plugins;
  if (typeof plugins !== 'object' || plugins === null) return emptyHistory();

  const result = emptyHistory();
  for (const [id, points] of Object.entries(plugins as Record<string, unknown>)) {
    if (!Array.isArray(points)) continue;
    result.plugins[id] = points.filter(
      (point): point is Point =>
        typeof point === 'object' &&
        point !== null &&
        typeof (point as Point).date === 'string' &&
        typeof (point as Point).downloads === 'number',
    );
  }
  return result;
}

/**
 * Merge new observations into stored history.
 *
 * Later observations win for a given date, so re-running on the same day corrects that day
 * rather than duplicating it.
 */
export function mergeSeries(existing: Point[], incoming: Point[]): Point[] {
  const byDate = new Map<string, number>();
  for (const point of existing) byDate.set(point.date, point.downloads);
  for (const point of incoming) byDate.set(point.date, point.downloads);

  return [...byDate.entries()]
    .map(([date, downloads]) => ({ date, downloads }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function mergeHistory(history: HistoryFile, series: Series[]): HistoryFile {
  const merged: HistoryFile = { version: 1, plugins: { ...history.plugins } };
  for (const entry of series) {
    merged.plugins[entry.id] = mergeSeries(merged.plugins[entry.id] ?? [], entry.points);
  }
  return merged;
}

/**
 * Day-over-day download counts.
 *
 * Totals normally rise, but a plugin that is delisted and relisted has its upstream count
 * reset, which would otherwise show up as a large negative day. Negative deltas are clamped
 * to zero: a reset is an artifact of the source, not downloads being returned.
 */
export function toDeltas(points: Point[]): Point[] {
  const deltas: Point[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const change = points[index].downloads - points[index - 1].downloads;
    deltas.push({ date: points[index].date, downloads: Math.max(0, change) });
  }
  return deltas;
}

/** Drop everything before the cutoff, keeping one point before it so lines start on-axis. */
export function clampToDays(points: Point[], days: number): Point[] {
  if (days <= 0 || points.length === 0) return points;

  const cutoff = new Date(points[points.length - 1].date);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const iso = cutoff.toISOString().slice(0, 10);

  const firstInRange = points.findIndex((point) => point.date >= iso);
  if (firstInRange <= 0) return points;
  return points.slice(firstInRange - 1);
}

export function toCsv(history: HistoryFile): string {
  const ids = Object.keys(history.plugins).sort();
  const dates = new Set<string>();
  for (const points of Object.values(history.plugins)) {
    for (const point of points) dates.add(point.date);
  }

  const lookup = new Map<string, Map<string, number>>();
  for (const [id, points] of Object.entries(history.plugins)) {
    lookup.set(id, new Map(points.map((point) => [point.date, point.downloads])));
  }

  const rows = [['date', ...ids].join(',')];
  for (const date of [...dates].sort()) {
    rows.push([date, ...ids.map((id) => lookup.get(id)?.get(date) ?? '')].join(','));
  }
  return `${rows.join('\n')}\n`;
}
