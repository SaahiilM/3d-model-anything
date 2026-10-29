import * as THREE from 'three';

export type Point2 = readonly [number, number];
export interface VastuSector { label: string; pieces: Point2[][] }
export interface VastuPreview { center: Point2; centerInside: boolean; sectors: VastuSector[] }

/** Compute eight north-aligned 45° wedges clipped to a simple floor polygon. */
export function computeVastuPreview(polygon: number[][], north: readonly [number, number]): VastuPreview | undefined {
  if (polygon.length < 3 || !polygon.every(p => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))) return;
  const ring: Point2[] = polygon.map(p => [p[0], p[1]]);
  if (ring.length > 3 && same(ring[0], ring[ring.length - 1])) ring.pop();
  if (ring.length < 3 || ring.some((p, i) => same(p, ring[(i + 1) % ring.length])) || selfIntersects(ring)) return;
  const signedArea = ring.reduce((sum, p, i) => {
    const q = ring[(i + 1) % ring.length]; return sum + p[0] * q[1] - q[0] * p[1];
  }, 0) / 2;
  if (Math.abs(signedArea) < 1e-8) return;
  const centroid: Point2 = [ring.reduce((s, p, i) => s + (p[0] + ring[(i + 1) % ring.length][0]) * (p[0] * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * p[1]), 0) / (6 * signedArea),
    ring.reduce((s, p, i) => s + (p[1] + ring[(i + 1) % ring.length][1]) * (p[0] * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * p[1]), 0) / (6 * signedArea)];
  const centerInside = pointInPolygon(centroid, ring);
  if (!centerInside) return { center: centroid, centerInside, sectors: [] };
  const vectors = ring.map(p => new THREE.Vector2(p[0], p[1]));
  // ShapeUtils expects a simple ring and returns triangles whose union is the polygon.
  const triangles = THREE.ShapeUtils.triangulateShape(vectors, []);
  const northLength = Math.hypot(...north);
  if (!Number.isFinite(northLength) || northLength < .99) return;
  const n: Point2 = [north[0] / northLength, north[1] / northLength], east: Point2 = [-n[1], n[0]];
  const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const sectors = labels.map((label, index): VastuSector => {
    const middle = index * Math.PI / 4, half = Math.PI / 8;
    const ray = (angle: number): Point2 => [n[0] * Math.cos(angle) + east[0] * Math.sin(angle), n[1] * Math.cos(angle) + east[1] * Math.sin(angle)];
    const start = ray(middle - half), end = ray(middle + half);
    const pieces: Point2[][] = [];
    for (const tri of triangles) {
      let piece: Point2[] = tri.map(i => [vectors[i].x, vectors[i].y] as Point2);
      piece = clip(piece, centroid, start, true);
      piece = clip(piece, centroid, end, false);
      if (piece.length >= 3 && Math.abs(area(piece)) > 1e-8) pieces.push(piece);
    }
    return { label, pieces };
  });
  return { center: centroid, centerInside, sectors };
}

function cross(a: Point2, b: Point2) { return a[0] * b[1] - a[1] * b[0]; }
function same(a: Point2, b: Point2) { return Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-8; }
function selfIntersects(ring: Point2[]) {
  const orientation = (a: Point2, b: Point2, c: Point2) => cross([b[0]-a[0], b[1]-a[1]], [c[0]-a[0], c[1]-a[1]]);
  const on = (a: Point2, b: Point2, p: Point2) => Math.min(a[0],b[0])-1e-8 <= p[0] && p[0] <= Math.max(a[0],b[0])+1e-8 && Math.min(a[1],b[1])-1e-8 <= p[1] && p[1] <= Math.max(a[1],b[1])+1e-8;
  for (let i=0; i<ring.length; i++) for (let j=i+1; j<ring.length; j++) {
    if (j===i || j===(i+1)%ring.length || i===(j+1)%ring.length) continue;
    const a=ring[i], b=ring[(i+1)%ring.length], c=ring[j], d=ring[(j+1)%ring.length];
    const o1=orientation(a,b,c),o2=orientation(a,b,d),o3=orientation(c,d,a),o4=orientation(c,d,b);
    if ((o1*o2 < -1e-14 && o3*o4 < -1e-14) || (Math.abs(o1)<1e-8&&on(a,b,c)) || (Math.abs(o2)<1e-8&&on(a,b,d)) || (Math.abs(o3)<1e-8&&on(c,d,a)) || (Math.abs(o4)<1e-8&&on(c,d,b))) return true;
  }
  return false;
}
function clip(poly: Point2[], center: Point2, ray: Point2, keepPositive: boolean): Point2[] {
  const side = (p: Point2) => cross(ray, [p[0] - center[0], p[1] - center[1]]) * (keepPositive ? 1 : -1);
  const out: Point2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], da = side(a), db = side(b);
    if (da >= -1e-10) out.push(a);
    if ((da < -1e-10 && db > 1e-10) || (da > 1e-10 && db < -1e-10)) {
      const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}
function area(poly: Point2[]) { return poly.reduce((s, p, i) => s + cross(p, poly[(i + 1) % poly.length]), 0) / 2; }
function pointInPolygon(p: Point2, poly: readonly Point2[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
