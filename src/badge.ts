import type { BadgeOptions } from './types.ts';

const FONT = 'Verdana,Geneva,DejaVu Sans,sans-serif';

export const DEFAULT_BADGE: BadgeOptions = {
  label: 'downloads',
  color: '#7c3aed',
  labelColor: '#555555',
};

/**
 * Per-character advance widths for 11px Verdana, the font shields.io badges are measured
 * against. Text in a badge is not laid out by us, so widths have to be estimated to size
 * the plates; a fixed multiplier makes long labels overflow.
 */
const WIDE = new Set('MWmw@%'.split(''));
const NARROW = new Set("iljtfrI.,:;'|!".split(''));

function textWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    if (WIDE.has(char)) width += 9.5;
    else if (NARROW.has(char)) width += 3.4;
    else if (char === ' ') width += 3.6;
    else if (char >= '0' && char <= '9') width += 7;
    else if (char >= 'A' && char <= 'Z') width += 8;
    else width += 6.6;
  }
  return width;
}

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

export function formatDownloads(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return String(value);
}

/**
 * Render a flat badge in the shields.io style.
 *
 * The count comes from Obsidian's own stats file. Summing `download_count` across a GitHub
 * release's assets instead — what a generic downloads badge does — counts main.js,
 * manifest.json and styles.css separately and reports two to three times the real number of
 * installs.
 */
export function renderBadge(value: number, options: Partial<BadgeOptions> = {}): string {
  const config = { ...DEFAULT_BADGE, ...options };
  const label = config.label;
  const message = config.message ?? formatDownloads(value);

  const labelWidth = Math.round(textWidth(label)) + 20;
  const messageWidth = Math.round(textWidth(message)) + 20;
  const width = labelWidth + messageWidth;

  // Text is drawn twice: a translucent black copy one pixel down for the engraved look
  // shields uses, then the white face on top.
  const labelX = (labelWidth / 2) * 10;
  const messageX = (labelWidth + messageWidth / 2) * 10;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" ` +
    `viewBox="0 0 ${width} 20" role="img" ` +
    `aria-label="${escapeXml(label)}: ${escapeXml(message)}">` +
    `<title>${escapeXml(label)}: ${escapeXml(message)}</title>` +
    '<linearGradient id="s" x2="0" y2="100%">' +
    '<stop offset="0" stop-color="#bbb" stop-opacity=".1"/>' +
    '<stop offset="1" stop-opacity=".1"/></linearGradient>' +
    `<clipPath id="r"><rect width="${width}" height="20" rx="3" fill="#fff"/></clipPath>` +
    '<g clip-path="url(#r)">' +
    `<rect width="${labelWidth}" height="20" fill="${config.labelColor}"/>` +
    `<rect x="${labelWidth}" width="${messageWidth}" height="20" fill="${config.color}"/>` +
    `<rect width="${width}" height="20" fill="url(#s)"/></g>` +
    `<g fill="#fff" text-anchor="middle" font-family="${FONT}" font-size="110" ` +
    'text-rendering="geometricPrecision" transform="scale(.1)">' +
    `<text x="${labelX}" y="150" fill="#010101" fill-opacity=".3">${escapeXml(label)}</text>` +
    `<text x="${labelX}" y="140">${escapeXml(label)}</text>` +
    `<text x="${messageX}" y="150" fill="#010101" fill-opacity=".3">${escapeXml(message)}</text>` +
    `<text x="${messageX}" y="140">${escapeXml(message)}</text>` +
    '</g></svg>'
  );
}
