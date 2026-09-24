# obsidian-plugin-stats-badge

Download badges and history charts for Obsidian community plugins, as a GitHub Action.

Obsidian publishes a download count per plugin, but nothing that lets you put the *trend* in
your README. This action writes both: a badge with the current total, and an SVG line chart
of downloads over time.

**The chart is complete on the first run.** Obsidian's stats file is committed daily to a
public repository, and that git history goes back to October 2020 — so the history is
reconstructed from it rather than starting empty and filling in over the following months.

![Downloads](https://raw.githubusercontent.com/yut0takagi/obsidian-plugin-stats-badge/main/.github/stats/badge.svg)

![Download history](https://raw.githubusercontent.com/yut0takagi/obsidian-plugin-stats-badge/main/.github/stats/downloads.svg)

*Real output, regenerated daily by [this repository's own workflow](.github/workflows/stats.yml).*

Add it to your README with:

```markdown
![Downloads](https://raw.githubusercontent.com/<you>/<repo>/main/.github/stats/badge.svg)
![Download history](https://raw.githubusercontent.com/<you>/<repo>/main/.github/stats/downloads.svg)
```

## Usage

```yaml
name: Update download stats

on:
  schedule:
    - cron: '0 3 * * *'
  workflow_dispatch:

permissions:
  contents: write   # required to commit the refreshed SVGs

jobs:
  stats:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: yut0takagi/obsidian-plugin-stats-badge@v1
        with:
          plugin-id: your-plugin-id
      - run: |
          git config user.name  'github-actions[bot]'
          git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
          git add .github/stats
          git diff --staged --quiet || git commit -m 'chore: update download stats [skip ci]'
          git push
```

`plugin-id` is the `id` field from your `manifest.json`, which is **not always the repository
name** — `obsidian-recording-notify` publishes as `meeting-detector`.

### Charting several plugins together

Pass more than one id to compare them on shared axes, which no existing tool does:

```yaml
- uses: yut0takagi/obsidian-plugin-stats-badge@v1
  with:
    plugin-id: |
      my-first-plugin
      my-second-plugin
    chart-title: My plugins
```

You get a combined chart, a combined badge, and one `badge-<id>.svg` per plugin so each
repository can carry its own.

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `plugin-id` | *required* | Plugin id from `manifest.json`. Several may be given, comma- or newline-separated. |
| `output-dir` | `.github/stats` | Where the generated files are written. |
| `backfill` | `true` | Reconstruct history from the upstream git log. Takes about two minutes, and only runs for plugins with no stored history. |
| `days` | `0` | Chart only the last N days. `0` charts everything. |
| `delta` | `false` | Chart downloads per day instead of the running total. |
| `chart-title` | `Obsidian downloads` | Title drawn on the chart. |
| `badge-label` | `downloads` | Left-hand text on the badge. |
| `badge-color` | `#7c3aed` | Right-hand plate colour. |
| `csv` | `false` | Also write `history.csv`. |

## Outputs

| Output | Description |
| --- | --- |
| `total` | Combined downloads across every requested plugin. |
| `totals` | JSON object of downloads per plugin id. |
| `files` | Newline-separated list of files written. |

## Generated files

```text
.github/stats/
├── badge.svg          # downloads | 2.1k
├── downloads.svg      # the history chart
├── history.json       # { "plugins": { "<id>": [{ date, downloads }] } }
├── history.csv        # optional, one column per plugin
└── badge-<id>.svg     # per plugin, when charting several
```

`history.json` is yours. It accumulates in your repository, so the data survives this action
being unavailable, and anything else can read it.

## Why not a generic downloads badge?

A badge built on GitHub's release API sums `download_count` across a release's assets. An
Obsidian install fetches `main.js`, `manifest.json` and `styles.css`, so that counts every
install two or three times — `dataview` reads as 15M against an actual 5.0M.

This action reads Obsidian's own published total, which counts `manifest.json` alone. The
number matches what obsidian.md shows.

## A note on stale images

GitHub serves README images through its camo proxy, which caches them. A refreshed chart can
take a while to appear, and the cache is not something a repository can reliably purge.

Two ways around it, both supported:

- **Commit the SVGs** (the default). The file changes on every update, which usually gets
  through. Simple, no extra setup.
- **Publish to GitHub Pages** and reference the Pages URL, where you control the caching
  headers. Point `output-dir` at your Pages directory and reference it as an absolute URL.

Neither makes updates instant. Downloads move slowly enough that a few hours' lag doesn't
matter much.

## Data source

[`obsidianmd/obsidian-releases`](https://github.com/obsidianmd/obsidian-releases) →
`community-plugin-stats.json`, refreshed daily by Obsidian.

The `releases.obsidian.md/stats/plugin` endpoint some older tools use now returns an empty
object with HTTP 200. This action fails loudly rather than silently recording a day of zeroes.

## Development

Requires Node 22.6 or newer, which is what runs the tests directly from TypeScript.

```bash
npm install
npm test                      # typecheck + unit tests
npm run cli -- <plugin-id>    # run it locally
npm run bundle                # rebuild dist/ (committed; a Node action runs dist/, not src/)
```

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md), which covers the one
thing that catches everyone: `dist/` is committed, and CI fails if it is stale.

Release notes are in [CHANGELOG.md](CHANGELOG.md).

## Licence

MIT
