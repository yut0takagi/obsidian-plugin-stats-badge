import type { PluginStats } from './types.ts';

/**
 * Obsidian publishes plugin download counts here. The `releases.obsidian.md/stats/plugin`
 * endpoint that older tools use returns an empty object with HTTP 200 — using it silently
 * records zero downloads forever, so we never read from it.
 */
export const STATS_URL =
  'https://raw.githubusercontent.com/obsidianmd/obsidian-releases/HEAD/community-plugin-stats.json';

/** Keys in a plugin entry that hold metadata rather than a version count. */
const META_KEYS = new Set(['downloads', 'updated']);

/**
 * Release tags in the wild are far messier than semver. Measured against the full upstream
 * document (7,988 plugins), requiring strict `v?N.N.N` discards real releases: `V1.0.6`,
 * `0.2.7patched`, `3.0.0b` and `agent-llms-0.7.2` are all genuine versions. Treating any key
 * that contains `N.N` as a version reconciles 7,965 plugins exactly.
 *
 * The remaining 23 carry keys that really aren't versions — `publish`, `push`, `Obsidian`,
 * `build/main.js`, `Initial-Release`, a bare UUID — and those hold real download counts that
 * belong in the total but not in any version.
 */
const VERSION_RE = /\d+\.\d+/;

export function isVersionKey(key: string): boolean {
  return !META_KEYS.has(key) && VERSION_RE.test(key);
}

/** Strip a leading `v` or `V` so `1.0.0` and `v1.0.0` aren't reported as two releases. */
export function normalizeVersion(version: string): string {
  return /^[vV]\d/.test(version) ? version.slice(1) : version;
}

/**
 * Parse one plugin out of the raw stats document.
 * Returns undefined when the plugin is absent or its entry is unusable.
 */
export function parsePlugin(raw: unknown, id: string): PluginStats | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const entry = (raw as Record<string, unknown>)[id];
  if (typeof entry !== 'object' || entry === null) return undefined;

  const record = entry as Record<string, unknown>;
  const downloads = record.downloads;
  if (typeof downloads !== 'number' || !Number.isFinite(downloads)) return undefined;

  const versions: Record<string, number> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!isVersionKey(key) || typeof value !== 'number') continue;
    const name = normalizeVersion(key);
    // Merge `1.0.0` and `v1.0.0`, which both occur upstream for the same release.
    versions[name] = (versions[name] ?? 0) + value;
  }

  return {
    downloads,
    updated: typeof record.updated === 'number' ? record.updated : 0,
    versions,
  };
}

/** List every plugin id present in the document. */
export function listPluginIds(raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null) return [];
  return Object.keys(raw as Record<string, unknown>);
}

export async function fetchStats(url = STATS_URL): Promise<unknown> {
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'obsidian-plugin-stats-badge' },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch plugin stats: HTTP ${response.status} from ${url}`);
  }

  const document: unknown = await response.json();
  const count = listPluginIds(document).length;
  // A 200 carrying `{}` means the source moved or broke. Fail loudly rather than
  // writing a day of zeroes into the user's history.
  if (count === 0) {
    throw new Error(`Plugin stats at ${url} contained no plugins; refusing to record empty data.`);
  }
  return document;
}
