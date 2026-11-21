// The company's brand color, read off its own website so nobody has to pick
// one: the theme-color the site declares, else the color its CSS names as
// primary, brand or accent, else the saturated color its CSS uses most.
// Pure text in, hex out; crawlSite.ts does the fetching.

type Hsl = { h: number; s: number; l: number };

function toHsl(r: number, g: number, b: number): Hsl {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: ((h * 60) % 360 + 360) % 360, s, l };
}

/** "#RRGGBB" for a 3, 4, 6 or 8 digit hex (alpha dropped), else null. */
export function normalizeHex(raw: string): string | null {
  const hex = raw.replace('#', '').trim();
  if (!/^([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) return null;
  const six = hex.length <= 4 ? [...hex.slice(0, 3)].map((c) => c + c).join('') : hex.slice(0, 6);
  return `#${six.toUpperCase()}`;
}

function rgbOf(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** A color a brand could be known by: clearly a hue, neither near white nor near black. */
export function isBrandLike(hex: string): boolean {
  const { s, l } = toHsl(...rgbOf(hex));
  return s >= 0.35 && l >= 0.22 && l <= 0.72;
}

const HEX = /#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi;
const RGB = /rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/gi;

function colorsIn(css: string): string[] {
  const out: string[] = [];
  for (const m of css.matchAll(HEX)) {
    const hex = normalizeHex(m[0]);
    if (hex) out.push(hex);
  }
  for (const m of css.matchAll(RGB)) {
    const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (r > 255 || g > 255 || b > 255) continue;
    out.push(`#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase()}`);
  }
  return out;
}

function mostUsed(colors: string[]): string | null {
  const counts = new Map<string, number>();
  for (const c of colors) if (isBrandLike(c)) counts.set(c, (counts.get(c) ?? 0) + 1);
  let best: string | null = null;
  for (const [c, n] of counts) if (best === null || n > (counts.get(best) ?? 0)) best = c;
  return best;
}

/** The CSS a page carries itself: its <style> blocks and style attributes. */
export function inlineCss(html: string): string {
  const blocks = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)].map((m) => m[1]);
  const attrs = [...html.matchAll(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map((m) => m[1] ?? m[2] ?? '');
  return [...blocks, ...attrs].join('\n');
}

/** Stylesheets the page links, in document order. */
export function stylesheetLinks(html: string, base: URL): string[] {
  const out: string[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/rel\s*=\s*["']?[^"'>]*stylesheet/i.test(tag)) continue;
    const href = /href\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    const raw = href?.[1] ?? href?.[2];
    if (!raw) continue;
    try {
      out.push(new URL(raw.replace(/&amp;/g, '&'), base).href);
    } catch {
      // A malformed href is skipped.
    }
  }
  return [...new Set(out)];
}

/** The site's own declared browser color, when it is a real brand color. */
function declaredColor(html: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!/name\s*=\s*["']?(theme-color|msapplication-TileColor)["'\s>]/i.test(tag)) continue;
    const content = /content\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    const hex = normalizeHex(content?.[1] ?? content?.[2] ?? '') ?? colorsIn(content?.[1] ?? content?.[2] ?? '')[0] ?? null;
    if (hex && isBrandLike(hex)) return hex;
  }
  return null;
}

/** Colors assigned to custom properties named primary, brand or accent, in that order of trust. */
function namedColor(css: string): string | null {
  for (const word of ['brand', 'primary', 'accent']) {
    const re = new RegExp(`--[\\w-]*${word}[\\w-]*\\s*:\\s*([^;}]+)`, 'gi');
    const hit = mostUsed([...css.matchAll(re)].flatMap((m) => colorsIn(m[1])));
    if (hit) return hit;
  }
  return null;
}

/**
 * The brand color of a site from its home page HTML and the text of its
 * stylesheets, or null when nothing on it reads as one (a black and white
 * site has no theme to take).
 */
export function detectBrandColor(html: string, stylesheets: readonly string[] = []): string | null {
  const css = [inlineCss(html), ...stylesheets].join('\n');
  return declaredColor(html) ?? namedColor(css) ?? mostUsed(colorsIn(css));
}
