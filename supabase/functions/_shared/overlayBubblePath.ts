// Mirror of lib/overlay-bubble-path.ts. Edge functions cannot import lib/.
// The merged bubble behind TikTok text with background: every wrapped line
// gets a rounded rect hugging its width, the rects overlap by the vertical
// pad, and where a narrower line meets a wider one the inner corners get a
// concave fillet of the same radius so the union reads as one smooth blob.
// Pure geometry in one unit (em or px); mirrored in
// supabase/functions/_shared/overlayBubblePath.ts.

export type BubbleSpec = {
  /** Distance between consecutive baselines (the line height). */
  pitch: number;
  padX: number;
  padY: number;
  radius: number;
  /** Neighbouring lines whose widths differ by less than this share one width. */
  snap: number;
};

export type BubbleGeometry = {
  width: number;
  height: number;
  /** SVG path data in the same unit, origin at the block's top-left. */
  path: string;
  /** Per line half width after snapping, pad included. */
  halfWidths: number[];
};

type Point = { x: number; y: number };

/** Cubic control point pull for a quarter circle. */
const KAPPA = 0.5522847498;

function snapWidths(widths: number[], snap: number): number[] {
  const out = [...widths];
  for (let i = 0; i + 1 < out.length; i++) {
    const a = out[i] ?? 0;
    const b = out[i + 1] ?? 0;
    if (a > 0 && b > 0 && Math.abs(a - b) < snap) {
      const w = Math.max(a, b);
      out[i] = w;
      out[i + 1] = w;
    }
  }
  return out;
}

/**
 * Right hand boundary of one run of consecutive non-empty lines, top to
 * bottom, as axis-aligned polygon vertices relative to the block center.
 */
function rightSide(
  halfWidths: number[],
  from: number,
  to: number,
  spec: BubbleSpec,
): Point[] {
  const top = (i: number) => i * spec.pitch;
  const bottom = (i: number) => (i + 1) * spec.pitch + 2 * spec.padY;
  const pts: Point[] = [{ x: halfWidths[from] ?? 0, y: top(from) }];
  for (let i = from; i < to; i++) {
    const cur = halfWidths[i] ?? 0;
    const next = halfWidths[i + 1] ?? 0;
    if (cur === next) continue;
    // A wider line owns the junction: the step happens at its edge.
    const y = cur > next ? bottom(i) : top(i + 1);
    pts.push({ x: cur, y }, { x: next, y });
  }
  pts.push({ x: halfWidths[to] ?? 0, y: bottom(to) });
  return pts;
}

function fmt(n: number): string {
  return Number(n.toFixed(3)).toString();
}

/** Closed path through axis-aligned vertices with every corner rounded. */
function roundedPolygon(vertices: Point[], radius: number): string {
  const n = vertices.length;
  const segLen = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
  const unit = (a: Point, b: Point): Point => {
    const len = segLen(a, b);
    return len === 0 ? { x: 0, y: 0 } : { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  };
  const cornerRadius = vertices.map((v, i) => {
    const prev = vertices[(i - 1 + n) % n] ?? v;
    const next = vertices[(i + 1) % n] ?? v;
    return Math.min(radius, segLen(prev, v) / 2, segLen(v, next) / 2);
  });
  let d = '';
  for (let i = 0; i < n; i++) {
    const v = vertices[i] as Point;
    const prev = vertices[(i - 1 + n) % n] as Point;
    const next = vertices[(i + 1) % n] as Point;
    const r = cornerRadius[i] ?? 0;
    const dirIn = unit(prev, v);
    const dirOut = unit(v, next);
    const start = { x: v.x - dirIn.x * r, y: v.y - dirIn.y * r };
    const end = { x: v.x + dirOut.x * r, y: v.y + dirOut.y * r };
    const c1 = { x: v.x - dirIn.x * r * (1 - KAPPA), y: v.y - dirIn.y * r * (1 - KAPPA) };
    const c2 = { x: v.x + dirOut.x * r * (1 - KAPPA), y: v.y + dirOut.y * r * (1 - KAPPA) };
    d += i === 0 ? `M ${fmt(start.x)} ${fmt(start.y)} ` : `L ${fmt(start.x)} ${fmt(start.y)} `;
    if (r > 0) {
      d += `C ${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(end.x)} ${fmt(end.y)} `;
    }
  }
  return `${d}Z`;
}

/**
 * Geometry of the blob behind a set of wrapped lines. lineWidths are the
 * lines' text advance widths; an empty line (width 0) splits the blob.
 */
export function bubbleGeometry(lineWidths: number[], spec: BubbleSpec): BubbleGeometry {
  const snapped = snapWidths(lineWidths, spec.snap);
  const halfWidths = snapped.map((w) => (w > 0 ? w / 2 + spec.padX : 0));
  const width = 2 * Math.max(0, ...halfWidths);
  const height = lineWidths.length * spec.pitch + 2 * spec.padY;
  const cx = width / 2;

  const subpaths: string[] = [];
  let i = 0;
  while (i < halfWidths.length) {
    if ((halfWidths[i] ?? 0) === 0) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < halfWidths.length && (halfWidths[j + 1] ?? 0) > 0) j++;
    const right = rightSide(halfWidths, i, j, spec);
    const left = [...right].reverse().map((p) => ({ x: -p.x, y: p.y }));
    const vertices = [...right, ...left].map((p) => ({ x: cx + p.x, y: p.y }));
    subpaths.push(roundedPolygon(vertices, spec.radius));
    i = j + 1;
  }

  return { width, height, path: subpaths.join(' '), halfWidths };
}
