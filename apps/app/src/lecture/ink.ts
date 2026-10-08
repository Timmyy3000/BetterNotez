import { getStroke } from "perfect-freehand";

/** x and y in any single coordinate frame, and pressure from 0 to 1. */
export type StrokePoint = readonly [x: number, y: number, pressure: number];

/**
 * The outline of a pen stroke in the same frame as its points. Screen and PDF export both build
 * their shape from this, so a stroke keeps its shape when it is flattened into the exported file.
 */
export function strokeOutline(points: readonly StrokePoint[], size: number): [number, number][] {
  return getStroke(
    points.map(([x, y, pressure]) => [x, y, pressure]),
    { size, thinning: 0.5, smoothing: 0.5, streamline: 0.5 },
  );
}

export function strokePath(points: readonly StrokePoint[], size: number): string {
  return outlinePath(strokeOutline(points, size));
}

/**
 * A closed path through the outline with each point as a control point, so the curve passes
 * through the midpoints. Uses only M, Q, and Z, which every SVG and PDF path reader supports.
 */
export function outlinePath(outline: readonly (readonly [number, number])[]): string {
  const count = outline.length;
  if (count < 3) return "";
  const at = (index: number) => outline[index % count] as readonly [number, number];
  const midpoint = (a: readonly [number, number], b: readonly [number, number]) =>
    [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const;
  const start = midpoint(at(0), at(1));
  let path = `M${start[0]},${start[1]}`;
  for (let index = 1; index < count; index += 1) {
    const control = at(index);
    const end = midpoint(control, at(index + 1));
    path += ` Q${control[0]},${control[1]} ${end[0]},${end[1]}`;
  }
  const first = at(0);
  return `${path} Q${first[0]},${first[1]} ${start[0]},${start[1]} Z`;
}

/** Shortest distance from (x, y) to any segment of the polyline. A single point is a polyline too. */
export function distanceToPolyline(polyline: readonly StrokePoint[], x: number, y: number): number {
  const first = polyline[0];
  if (first === undefined) {
    return Infinity;
  }
  if (polyline.length === 1) {
    return Math.hypot(x - first[0], y - first[1]);
  }
  let best = Infinity;
  for (let index = 1; index < polyline.length; index += 1) {
    const [ax, ay] = polyline[index - 1] as StrokePoint;
    const [bx, by] = polyline[index] as StrokePoint;
    best = Math.min(best, distanceToSegment(x, y, ax, ay, bx, by));
  }
  return best;
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
