/** A single plugin's entry in Obsidian's community-plugin-stats.json. */
export interface PluginStats {
  /** Total downloads. Equals the sum of all version counts. */
  downloads: number;
  /** Epoch milliseconds of the plugin's latest release (not of the stats file). */
  updated: number;
  /** Per-version download counts, keyed by version string. */
  versions: Record<string, number>;
}

/** One day's observation for one plugin. */
export interface Point {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  downloads: number;
}

/** A plugin's full history, oldest first. */
export interface Series {
  id: string;
  points: Point[];
}

export interface ChartOptions {
  title: string;
  width: number;
  /** Plot area height, excluding title, axis labels and legend. */
  plotHeight: number;
  /** Draw daily deltas instead of the cumulative total. */
  delta: boolean;
}

export interface BadgeOptions {
  label: string;
  /** Right-hand side text. Defaults to the formatted total. */
  message?: string;
  color: string;
  labelColor: string;
}
