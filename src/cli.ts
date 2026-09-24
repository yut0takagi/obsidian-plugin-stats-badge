import { parseArgs } from 'node:util';

import { run } from './run.ts';

const USAGE = `
obsidian-plugin-stats-badge — download badges and history charts for Obsidian plugins

Usage:
  npx obsidian-plugin-stats-badge <plugin-id...> [options]

Options:
  --out <dir>        Output directory (default: .github/stats)
  --days <n>         Chart only the last N days (default: all)
  --delta            Chart downloads per day instead of the running total
  --no-backfill      Skip reconstructing history from the upstream git log
  --csv              Also write history.csv
  --title <text>     Chart title (default: "Obsidian downloads")
  --label <text>     Badge label (default: "downloads")
  --color <hex>      Badge colour (default: #7c3aed)
  -h, --help         Show this message

The plugin id is the "id" field of your manifest.json, which is not always the
repository name.

Example:
  npx obsidian-plugin-stats-badge dataview templater-obsidian --days 90 --csv
`.trim();

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string', default: '.github/stats' },
    days: { type: 'string', default: '0' },
    delta: { type: 'boolean', default: false },
    backfill: { type: 'boolean', default: true },
    csv: { type: 'boolean', default: false },
    title: { type: 'string', default: 'Obsidian downloads' },
    label: { type: 'string', default: 'downloads' },
    color: { type: 'string', default: '#7c3aed' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help || positionals.length === 0) {
  console.log(USAGE);
  process.exit(values.help ? 0 : 1);
}

const days = Number.parseInt(values.days, 10);
if (Number.isNaN(days) || days < 0) {
  console.error(`--days must be a non-negative whole number, got "${values.days}".`);
  process.exit(1);
}

try {
  const result = await run({
    ids: positionals,
    outDir: values.out,
    backfill: values.backfill,
    days,
    delta: values.delta,
    chartTitle: values.title,
    badgeLabel: values.label,
    badgeColor: values.color,
    csv: values.csv,
    log: (message) => console.log(message),
  });

  console.log('');
  for (const [id, value] of Object.entries(result.totals)) {
    const tracked = result.history.plugins[id]?.length ?? 0;
    console.log(`  ${id.padEnd(24)} ${String(value).padStart(9)}  (${tracked} days)`);
  }
  if (Object.keys(result.totals).length > 1) {
    console.log(`  ${'total'.padEnd(24)} ${String(result.total).padStart(9)}`);
  }
  console.log('');
  for (const path of result.written) console.log(`  wrote ${path}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
