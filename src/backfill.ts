import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { parsePlugin } from './stats.ts';
import type { Point, Series } from './types.ts';

const run = promisify(execFile);

const RELEASES_REPO = 'https://github.com/obsidianmd/obsidian-releases.git';
const STATS_FILE = 'community-plugin-stats.json';

/** git writes the whole 2.3 MB blob to stdout; the default 1 MB buffer truncates it. */
const MAX_BUFFER = 64 * 1024 * 1024;

export interface BackfillOptions {
  /** Plugin ids to extract. */
  ids: string[];
  /** Stop after this many daily snapshots, newest first. 0 means every snapshot. */
  limit?: number;
  /** Reuse an existing clone instead of making one. */
  repoDir?: string;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Clone the obsidian-releases repository.
 *
 * A full clone is deliberate. `--filter=blob:none` looks cheaper but fetches each historical
 * blob on demand, and walking the history then costs one round trip per commit: measured at
 * ~23s for 30 commits (~25 min for the full history) versus ~19s to clone outright and ~98s
 * to walk all 2,016 commits locally.
 */
export async function cloneReleases(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'obsidian-releases-'));
  await run('git', ['clone', '--quiet', '--single-branch', RELEASES_REPO, dir], {
    maxBuffer: MAX_BUFFER,
  });
  return dir;
}

interface Snapshot {
  sha: string;
  date: string;
}

/** Every commit that touched the stats file, newest first, one per day. */
export async function listSnapshots(repoDir: string): Promise<Snapshot[]> {
  const { stdout } = await run(
    'git',
    ['log', '--format=%H %cI', '--', STATS_FILE],
    { cwd: repoDir, maxBuffer: MAX_BUFFER },
  );

  const seen = new Set<string>();
  const snapshots: Snapshot[] = [];
  for (const line of stdout.trim().split('\n')) {
    if (!line) continue;
    const separator = line.indexOf(' ');
    if (separator === -1) continue;
    const sha = line.slice(0, separator);
    const date = line.slice(separator + 1, separator + 11);
    // The bot commits once a day, but keep the newest if a day ever gets two.
    if (seen.has(date)) continue;
    seen.add(date);
    snapshots.push({ sha, date });
  }
  return snapshots;
}

async function readSnapshot(repoDir: string, sha: string): Promise<unknown> {
  try {
    const { stdout } = await run('git', ['show', `${sha}:${STATS_FILE}`], {
      cwd: repoDir,
      maxBuffer: MAX_BUFFER,
    });
    return JSON.parse(stdout);
  } catch {
    // Some early commits predate the file or leave it malformed. Skip that day.
    return undefined;
  }
}

/**
 * Reconstruct download history from the upstream repository's git log.
 *
 * The stats file has no time axis of its own: each commit is one daily snapshot, so the
 * history is the series. This means a chart is complete from the first run rather than
 * starting empty and filling in over months.
 */
export async function backfill(options: BackfillOptions): Promise<Series[]> {
  const { ids, limit = 0, onProgress } = options;
  const repoDir = options.repoDir ?? (await cloneReleases());
  const owned = options.repoDir === undefined;

  try {
    let snapshots = await listSnapshots(repoDir);
    if (limit > 0) snapshots = snapshots.slice(0, limit);

    const points = new Map<string, Point[]>(ids.map((id) => [id, []]));

    for (const [index, snapshot] of snapshots.entries()) {
      const document = await readSnapshot(repoDir, snapshot.sha);
      if (document !== undefined) {
        for (const id of ids) {
          const stats = parsePlugin(document, id);
          if (stats) points.get(id)!.push({ date: snapshot.date, downloads: stats.downloads });
        }
      }
      onProgress?.(index + 1, snapshots.length);
    }

    // git log is newest-first; charts read oldest-first.
    return ids
      .map((id) => ({ id, points: points.get(id)!.reverse() }))
      .filter((series) => series.points.length > 0);
  } finally {
    if (owned) await rm(repoDir, { recursive: true, force: true });
  }
}
