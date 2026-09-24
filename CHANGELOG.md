# Changelog

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The `v1`
tag tracks the newest `v1.x` release, so `@v1` picks up fixes without further changes.

## v0.1.0

First release.

### Added

- **Download badge** in the shields.io style, showing the current total.
- **History chart** as an SVG line graph, with one line per plugin.
- **Backfill from upstream git history.** Obsidian's stats file is committed daily to a
  public repository going back to October 2020, so the chart is complete on the first run
  rather than starting empty. Takes about two minutes, and only runs for plugins with no
  stored history.
- **Several plugins on shared axes**, plus a `badge-<id>.svg` for each so every repository
  can carry its own.
- **`history.json` and optional `history.csv`**, written into your repository so the data
  outlives this action and other tools can read it.
- A CLI (`npm run cli -- <plugin-id>`) that does the same thing locally.

### Notes on the numbers

The badge reports Obsidian's own published total, which counts `manifest.json` downloads.
A generic downloads badge sums every asset in a release — `main.js`, `manifest.json` and
`styles.css` — and so reports two to three times the real number of installs. For
`dataview` that is 15M against an actual 5.0M.

Version keys are matched loosely, because release tags in the wild are messier than
semver: `V1.0.6`, `0.2.7patched`, `3.0.0b` and `agent-llms-0.7.2` are all real releases.
Measured across all 7,988 plugins, treating any key containing `N.N` as a version
reconciles 7,965 of them exactly against the reported total.

Counts that fall (a plugin delisted and relisted has its upstream total reset) are clamped
to zero rather than drawn as a negative day.
