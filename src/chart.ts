import type { ChartOptions, Series } from './types.ts';

/**
 * GitHub proxies README images through camo, which strips scripts, external fonts, external
 * <image> and SMIL animation. Everything here is paths, text and inline style with a system
 * font stack, so the chart renders identically in a README and in a browser.
 */
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

/** Distinguishable in light and dark, and holding up for viewers with colour blindness. */
const COLORS = [
  '#7c3aed', '#0891b2', '#db2777', '#ea580c',
  '#16a34a', '#4f46e5', '#b45309', '#0f766e',
];

/** Approximate advance width of the 11px system font, for laying out the legend. */
const CHAR_WIDTH = 6.2;
const LEGEND_LINE_HEIGHT = 17;

const PADDING = { top: 52, right: 64, bottom: 34, left: 56 };

export const DEFAULT_CHART: ChartOptions = {
  title: 'Obsidian downloads',
  width: 800,
  plotHeight: 190,
  delta: false,
};

function escapeXml(text: string): string {
  return text.replace(/[<>&'"]/g, (char) => {
    switch (char) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case "'": return '&apos;';
      default: return '&quot;';
    }
  });
}

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(value));
}

/** Round an axis maximum up to 1, 2, 2.5 or 5 times a power of ten. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (magnitude * step >= value) return magnitude * step;
  }
  return magnitude * 10;
}

function daysBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / 86_400_000;
}

interface LegendEntry {
  label: string;
  color: string;
  width: number;
}

/**
 * Lay the legend out across as many lines as it needs.
 *
 * A single line silently truncates the last entries once a few plugins are charted, and the
 * chart's height has to account for the wrapped lines or the legend collides with the axis.
 */
function layoutLegend(entries: LegendEntry[], available: number): LegendEntry[][] {
  const lines: LegendEntry[][] = [];
  let current: LegendEntry[] = [];
  let used = 0;

  for (const entry of entries) {
    if (current.length > 0 && used + entry.width > available) {
      lines.push(current);
      current = [];
      used = 0;
    }
    current.push(entry);
    used += entry.width;
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

export function renderChart(series: Series[], options: Partial<ChartOptions> = {}): string {
  const config = { ...DEFAULT_CHART, ...options };
  const drawable = series.filter((entry) => entry.points.length > 0);
  const width = config.width;

  if (drawable.length === 0) {
    return emptyChart(config.title, width);
  }

  const entries: LegendEntry[] = drawable.map((entry, index) => {
    const latest = entry.points[entry.points.length - 1];
    const label = `${entry.id} (${formatCount(latest.downloads)})`;
    return {
      label,
      color: COLORS[index % COLORS.length],
      width: 15 + label.length * CHAR_WIDTH + 14,
    };
  });

  const inner = width - PADDING.left - PADDING.right;
  const legendLines = layoutLegend(entries, inner);
  const legendHeight = legendLines.length * LEGEND_LINE_HEIGHT;
  const height = PADDING.top + config.plotHeight + PADDING.bottom + legendHeight;
  const plot = config.plotHeight;

  const dates = drawable.flatMap((entry) => entry.points.map((point) => point.date)).sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  const span = Math.max(daysBetween(first, last), 1);

  const peak = Math.max(
    ...drawable.flatMap((entry) => entry.points.map((point) => point.downloads)),
  );
  const axisMax = niceMax(peak);

  const x = (date: string) => PADDING.left + (daysBetween(first, date) / span) * inner;
  const y = (value: number) => PADDING.top + plot - (value / axisMax) * plot;

  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
      `viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(config.title)}">`,
  );

  // Inline media query rather than two files: GitHub serves one image to both themes.
  out.push(
    '<style>:root{color-scheme:light dark}' +
      '.bg{fill:#ffffff}.fg{fill:#1f2328}.mut{fill:#59636e}.grid{stroke:#d1d9e0}' +
      '@media(prefers-color-scheme:dark){' +
      '.bg{fill:#0d1117}.fg{fill:#e6edf3}.mut{fill:#9198a1}.grid{stroke:#30363d}}' +
      '</style>',
  );
  out.push(`<rect class="bg" width="${width}" height="${height}" rx="6"/>`);
  out.push(
    `<text class="fg" x="${PADDING.left}" y="26" font-family="${FONT}" font-size="14" ` +
      `font-weight="600">${escapeXml(config.title)}</text>`,
  );

  for (let tick = 0; tick <= 4; tick += 1) {
    const value = (axisMax * tick) / 4;
    const ty = y(value);
    out.push(
      `<line class="grid" x1="${PADDING.left}" y1="${ty.toFixed(1)}" ` +
        `x2="${PADDING.left + inner}" y2="${ty.toFixed(1)}" stroke-width="1" stroke-dasharray="3 3"/>`,
    );
    out.push(
      `<text class="mut" x="${PADDING.left - 8}" y="${(ty + 4).toFixed(1)}" ` +
        `font-family="${FONT}" font-size="11" text-anchor="end">${formatCount(value)}</text>`,
    );
  }

  const axisY = PADDING.top + plot + 20;
  out.push(
    `<text class="mut" x="${PADDING.left}" y="${axisY}" font-family="${FONT}" ` +
      `font-size="11">${first}</text>`,
  );
  out.push(
    `<text class="mut" x="${PADDING.left + inner}" y="${axisY}" font-family="${FONT}" ` +
      `font-size="11" text-anchor="end">${last}</text>`,
  );

  for (const [index, entry] of drawable.entries()) {
    const color = COLORS[index % COLORS.length];
    const path = entry.points
      .map((point, i) => `${i === 0 ? 'M' : 'L'}${x(point.date).toFixed(1)} ${y(point.downloads).toFixed(1)}`)
      .join(' ');
    out.push(
      `<path d="${path}" fill="none" stroke="${color}" stroke-width="2" ` +
        'stroke-linejoin="round" stroke-linecap="round"/>',
    );
    const latest = entry.points[entry.points.length - 1];
    out.push(
      `<circle cx="${x(latest.date).toFixed(1)}" cy="${y(latest.downloads).toFixed(1)}" ` +
        `r="3" fill="${color}"/>`,
    );
  }

  let legendY = PADDING.top + plot + 34;
  for (const line of legendLines) {
    let legendX = PADDING.left;
    for (const entry of line) {
      out.push(
        `<rect x="${legendX}" y="${legendY - 4}" width="10" height="3" rx="1.5" fill="${entry.color}"/>`,
      );
      out.push(
        `<text class="mut" x="${legendX + 15}" y="${legendY}" font-family="${FONT}" ` +
          `font-size="11">${escapeXml(entry.label)}</text>`,
      );
      legendX += entry.width;
    }
    legendY += LEGEND_LINE_HEIGHT;
  }

  out.push('</svg>');
  return out.join('');
}

function emptyChart(title: string, width: number): string {
  const height = 120;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">` +
    '<style>:root{color-scheme:light dark}.bg{fill:#ffffff}.mut{fill:#59636e}' +
    '@media(prefers-color-scheme:dark){.bg{fill:#0d1117}.mut{fill:#9198a1}}</style>' +
    `<rect class="bg" width="${width}" height="${height}" rx="6"/>` +
    `<text class="mut" x="${width / 2}" y="${height / 2}" font-family="${FONT}" font-size="12" ` +
    'text-anchor="middle">No download data yet</text></svg>'
  );
}
