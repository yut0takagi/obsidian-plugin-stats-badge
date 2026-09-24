import * as core from '@actions/core';

import { run } from './run.ts';

function parseIds(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function parseBoolean(raw: string, fallback: boolean): boolean {
  if (raw === '') return fallback;
  return raw.toLowerCase() === 'true';
}

async function main(): Promise<void> {
  const ids = parseIds(core.getInput('plugin-id'));
  if (ids.length === 0) {
    core.setFailed('plugin-id is required (one plugin id, or several separated by commas or newlines).');
    return;
  }

  const days = Number.parseInt(core.getInput('days') || '0', 10);
  if (Number.isNaN(days) || days < 0) {
    core.setFailed(`days must be a non-negative whole number, got "${core.getInput('days')}".`);
    return;
  }

  try {
    const result = await run({
      ids,
      outDir: core.getInput('output-dir') || '.github/stats',
      backfill: parseBoolean(core.getInput('backfill'), true),
      days,
      delta: parseBoolean(core.getInput('delta'), false),
      chartTitle: core.getInput('chart-title') || 'Obsidian downloads',
      badgeLabel: core.getInput('badge-label') || 'downloads',
      badgeColor: core.getInput('badge-color') || '#7c3aed',
      csv: parseBoolean(core.getInput('csv'), false),
      log: (message) => core.info(message),
    });

    core.setOutput('total', String(result.total));
    core.setOutput('totals', JSON.stringify(result.totals));
    core.setOutput('files', result.written.join('\n'));

    // The job summary is decoration. It is unavailable outside Actions and can fail on
    // its own, which must never fail a run whose files were written correctly.
    try {
      core.summary.addHeading('Obsidian plugin downloads', 3);
      core.summary.addTable([
        [
          { data: 'Plugin', header: true },
          { data: 'Downloads', header: true },
          { data: 'Days tracked', header: true },
        ],
        ...Object.entries(result.totals).map(([id, value]) => [
          id,
          value.toLocaleString('en-US'),
          String(result.history.plugins[id]?.length ?? 0),
        ]),
      ]);
      await core.summary.write();
    } catch (error) {
      core.debug(`Could not write the job summary: ${error instanceof Error ? error.message : error}`);
    }
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

await main();
