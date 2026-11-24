/** Small geo helpers for map overlays. */
export function circlePolygon(center: [number, number], radiusM: number, steps = 96): [number, number][] {
  const [lng, lat] = center;
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return ring;
}

/** Bounds (sw/ne) of a square of half-size `radiusM` around `center`. */
export function boundsAround(center: [number, number], radiusM: number) {
  const [lng, lat] = center;
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { sw: [lng - dLng, lat - dLat] as [number, number], ne: [lng + dLng, lat + dLat] as [number, number] };
}
