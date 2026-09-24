# Contributing

Thanks for taking a look. Bug reports, plugin ids that don't resolve, and pull requests are
all welcome.

## Getting set up

Node 22.6 or newer is required: the tests run straight from TypeScript, which needs
`--experimental-strip-types`.

```bash
git clone https://github.com/yut0takagi/obsidian-plugin-stats-badge.git
cd obsidian-plugin-stats-badge
npm install
npm test
```

To try it against a real plugin:

```bash
npm run cli -- dataview --out /tmp/stats --days 90
```

Backfilling clones the upstream repository (about 270 MB) into a temporary directory and
walks its history, which takes roughly two minutes. `--no-backfill` skips it while you are
iterating on rendering.

## The one thing that will trip you up

**`dist/` is committed, and CI fails if it is stale.**

A GitHub Action runs the bundled `dist/index.js`, not `src/`. If you change `src/` without
rebuilding, the published action keeps the old behaviour while the source looks correct —
so run the bundler before you commit:

```bash
npm run bundle
git add dist
```

The `bundle-is-current` job rebuilds and fails if the result differs from what you
committed.

## Before opening a pull request

```bash
npm test          # typecheck + 31 tests
npm run bundle    # and commit dist/ if it changed
```

## How this codebase likes to be changed

**Measure instead of assuming.** Several design decisions here came out of measurements
that contradicted the obvious answer, and they are commented where they live:

- A full clone beats `--filter=blob:none` for the backfill — the blobless version refetches
  each historical blob and takes about 25 minutes against 2.
- Version keys need a loose match. Strict semver throws away real releases such as `V1.0.6`
  and `0.2.7patched`.
- Summing a release's assets on the GitHub API overcounts installs two- to threefold.

If you are changing one of these, please include the measurement that says the new way is
better. If you are adding something similar, a comment saying why saves the next person
from "fixing" it back.

**Test against real data where it matters.** `test/fixtures/stats-sample.json` is a real
excerpt from the upstream file and deliberately includes the messy cases — junk keys,
uppercase version prefixes, plugin-name-prefixed tags. Hand-written fixtures agree with
whatever you assumed; real ones don't.

**Look at the SVG.** Three layout bugs in the chart — a truncated legend, the legend
colliding with the axis, a clipped right edge — were invisible in the markup and obvious in
the rendered image. If you change rendering, render it and look:

```bash
npm run cli -- dataview --out /tmp/stats
qlmanage -t -s 1400 -o /tmp/stats /tmp/stats/downloads.svg   # macOS
```

**Keep the SVG camo-safe.** GitHub proxies README images and strips scripts, external
fonts, external `<image>` and SMIL animation. Paths, text and inline style only — there is
a test that enforces this.

## Reporting a plugin that doesn't resolve

Include the plugin id from your `manifest.json` (not the repository name, which is often
different) and what the run printed. This check is usually enough to tell us where the
problem is:

```bash
curl -s https://raw.githubusercontent.com/obsidianmd/obsidian-releases/HEAD/community-plugin-stats.json \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('YOUR-PLUGIN-ID','not found'))"
```

If that prints `not found`, the plugin isn't in Obsidian's community list yet and no tool
can chart it. Newly accepted plugins appear the next day.

## Releasing

Maintainers only.

1. Update `CHANGELOG.md`.
2. Bump the version in `package.json`.
3. `npm run bundle` and commit.
4. Tag `vX.Y.Z`, and move the `v1` tag to the same commit so `@v1` picks it up.
5. Create the GitHub release.
