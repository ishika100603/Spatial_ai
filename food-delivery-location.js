// Location semantics for Morningside Heights, Manhattan (around Columbia University).
//
// Plain data and functions, independent of the 3D scene:
//   - the street grid (streets, avenues, junctions) and special areas (campus, parks, …)
//   - a road graph used to route delivery partners along real streets
//   - helpers that turn a coordinate into an address, a frame-of-reference description,
//     or a geographic lat/long — and that turn a written description back into a place.
//
// Coordinates are metres. x grows east (across the avenues), z grows south (down the avenues).
// "North" here means Manhattan's grid north (uptown), which is ~29° east of true north.

export const BLOCK = 84; // metres between consecutive streets
export const STREETS = [108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120];
export const streetZ = (n) => -(n - 114) * BLOCK;
export const streetName = (n) => (n === 110 ? 'W 110th St (Cathedral Pkwy)' : `W ${n}th St`);
export const streetShort = (n) => `W ${n}th St`;
export const streetWidth = (n) => (n === 110 ? 30 : 18);

export const AVENUES = [
  { id: 'riverside', name: 'Riverside Dr', x: -390, w: 22, from: 108, to: 120 },
  { id: 'claremont', name: 'Claremont Ave', x: -265, w: 18, from: 116, to: 120 },
  { id: 'broadway', name: 'Broadway', x: -150, w: 45, from: 108, to: 120, median: 8 },
  { id: 'amsterdam', name: 'Amsterdam Ave', x: 110, w: 30, from: 108, to: 120, oneWay: 'north' },
  { id: 'morningsideDr', name: 'Morningside Dr', x: 255, w: 20, from: 110, to: 120 },
  { id: 'morningsideAve', name: 'Morningside Ave', x: 410, w: 22, from: 110, to: 120 },
  { id: 'manhattan', name: 'Manhattan Ave', x: 540, w: 22, from: 108, to: 120 },
];
export const avenue = (id) => AVENUES.find((a) => a.id === id);
export const HUDSON_X = -505; // river edge
export const PARKWAY_X = -470; // Henry Hudson Pkwy

// Which street segments between two neighbouring avenues actually exist.
// Returns 'road', 'ped' (pedestrian only) or null (no street — the block is continuous).
export function streetSegmentKind(n, a, b) {
  const pair = `${a}|${b}`;
  if (pair === 'broadway|amsterdam' && n >= 115 && n <= 119) return n === 116 ? 'ped' : null; // Columbia campus, College Walk
  if (pair === 'claremont|broadway' && n >= 117 && n <= 119) return null; // Barnard College
  if (pair === 'amsterdam|morningsideDr' && (n === 111 || n === 112)) return null; // Cathedral close
  if (pair === 'morningsideDr|morningsideAve' && n > 110) return n === 116 ? 'ped' : null; // Morningside Park (116th St stairs)
  return 'road';
}

// Named areas that are not ordinary blocks.
export const ZONES = [
  { id: 'columbia', name: 'Columbia University (Morningside campus)', x0: -127, x1: 95, z0: streetZ(120) + 9, z1: streetZ(114) - 9 },
  { id: 'barnard', name: 'Barnard College', x0: -256, x1: -173, z0: streetZ(120) + 9, z1: streetZ(116) - 9 },
  { id: 'cathedral', name: 'Cathedral of St. John the Divine (close)', x0: 125, x1: 245, z0: streetZ(113) + 9, z1: streetZ(110) - 15 },
  { id: 'morningsidePark', name: 'Morningside Park', x0: 265, x1: 399, z0: streetZ(124), z1: streetZ(110) - 15 },
  { id: 'riversidePark', name: 'Riverside Park', x0: PARKWAY_X + 12, x1: -401, z0: -700, z1: 700 },
  { id: 'hudson', name: 'Hudson River', x0: -3000, x1: HUDSON_X, z0: -3000, z1: 3000 },
];
export const zoneAt = (x, z) => ZONES.find((zn) => x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1) || null;

export const LANDMARKS = [
  { id: 'mainGates', name: 'Columbia Main Gates (Broadway & W 116th St)', x: -125, z: streetZ(116), aliases: ['main gate', 'columbia gate', 'gates', 'columbia entrance'] },
  { id: 'amsGates', name: 'Columbia Amsterdam Gates (Amsterdam & W 116th St)', x: 93, z: streetZ(116), aliases: ['amsterdam gate'] },
  { id: 'collegeWalk', name: 'College Walk', x: -15, z: streetZ(116), aliases: ['college walk'] },
  { id: 'low', name: 'Low Memorial Library', x: -15, z: streetZ(116) - 45, aliases: ['low library', 'low steps', 'low memorial', 'alma mater'] },
  { id: 'butler', name: 'Butler Library', x: -15, z: streetZ(114) - 30, aliases: ['butler'] },
  { id: 'columbia', name: 'Columbia University', x: -15, z: streetZ(116) - 10, aliases: ['columbia', 'campus', 'university'] },
  { id: 'barnard', name: 'Barnard College', x: -215, z: streetZ(118), aliases: ['barnard'] },
  { id: 'cathedral', name: 'Cathedral of St. John the Divine', x: 175, z: streetZ(112), aliases: ['cathedral', 'st john', 'st. john', 'saint john', 'divine', 'church'] },
  { id: 'station116', name: '116 St–Columbia University station (1 train)', x: -150, z: streetZ(116) + 15, aliases: ['116 station', '116th station', 'columbia station', 'subway at 116'] },
  { id: 'station110', name: 'Cathedral Pkwy–110 St station (1 train)', x: -150, z: streetZ(110) - 15, aliases: ['110 station', '110th station', 'cathedral pkwy station', 'subway', 'station', 'train'] },
  { id: 'pond', name: 'Morningside Park pond', x: 345, z: streetZ(112) - 30, aliases: ['pond', 'waterfall', 'lake'] },
  { id: 'morningsidePark', name: 'Morningside Park', x: 335, z: streetZ(115), aliases: ['morningside park'] },
  { id: 'riversidePark', name: 'Riverside Park', x: -440, z: streetZ(113), aliases: ['riverside park'] },
  { id: 'hudson', name: 'Hudson River', x: -560, z: streetZ(113), aliases: ['hudson', 'river'] },
];

// --- Road graph -----------------------------------------------------------
export const NODES = new Map(); // key -> { key, ave, n, x, z, name }
export const EDGES = []; // { a, b, kind, len, road }

const nodeKey = (aveId, n) => `${aveId}@${n}`;
export function junction(aveId, n) {
  return NODES.get(nodeKey(aveId, n)) || null;
}

(function buildGraph() {
  const add = (ave, n) => {
    const k = nodeKey(ave.id, n);
    if (!NODES.has(k)) NODES.set(k, { key: k, ave: ave.id, n, x: ave.x, z: streetZ(n), name: `${ave.name} & ${streetShort(n)}` });
    return NODES.get(k);
  };
  for (const ave of AVENUES) {
    for (let n = ave.from; n < ave.to; n++) {
      const a = add(ave, n);
      const b = add(ave, n + 1);
      EDGES.push({ a: a.key, b: b.key, kind: 'road', len: BLOCK, road: ave.name });
    }
  }
  for (const n of STREETS) {
    const aves = AVENUES.filter((a) => n >= a.from && n <= a.to).sort((p, q) => p.x - q.x);
    for (let i = 0; i < aves.length - 1; i++) {
      const kind = streetSegmentKind(n, aves[i].id, aves[i + 1].id);
      if (!kind) continue;
      const a = add(aves[i], n);
      const b = add(aves[i + 1], n);
      EDGES.push({ a: a.key, b: b.key, kind, len: aves[i + 1].x - aves[i].x, road: kind === 'ped' ? (n === 116 && aves[i].id === 'broadway' ? 'College Walk' : `${streetShort(n)} (stairs/path)`) : streetName(n) });
    }
  }
})();

const allowed = (kind, mode) => kind === 'road' || (kind === 'ped' && mode === 'Walking');

function project(p, e) {
  const A = NODES.get(e.a);
  const B = NODES.get(e.b);
  const dx = B.x - A.x;
  const dz = B.z - A.z;
  const t = Math.max(0, Math.min(1, ((p.x - A.x) * dx + (p.z - A.z) * dz) / (dx * dx + dz * dz)));
  const x = A.x + dx * t;
  const z = A.z + dz * t;
  return { t, x, z, d: Math.hypot(p.x - x, p.z - z) };
}

export function snapToRoad(p, mode = 'Car') {
  let best = null;
  for (const e of EDGES) {
    if (!allowed(e.kind, mode)) continue;
    const pr = project(p, e);
    if (!best || pr.d < best.d) best = { ...pr, edge: e };
  }
  return best;
}

// Shortest route along the street network. Returns { points, length, steps }.
export function route(from, to, mode = 'Car') {
  const s = snapToRoad(from, mode);
  const g = snapToRoad(to, mode);
  const startPt = { x: s.x, z: s.z };
  const goalPt = { x: g.x, z: g.z };
  let nodePath = [];
  if (s.edge === g.edge) {
    nodePath = [];
  } else {
    const dist = new Map();
    const prev = new Map();
    const q = new Set(NODES.keys());
    for (const k of q) dist.set(k, Infinity);
    dist.set(s.edge.a, s.t * s.edge.len);
    dist.set(s.edge.b, (1 - s.t) * s.edge.len);
    const goalCost = new Map([[g.edge.a, g.t * g.edge.len], [g.edge.b, (1 - g.t) * g.edge.len]]);
    while (q.size) {
      let u = null;
      for (const k of q) if (u === null || dist.get(k) < dist.get(u)) u = k;
      if (dist.get(u) === Infinity) break;
      q.delete(u);
      for (const e of EDGES) {
        if (!allowed(e.kind, mode)) continue;
        const v = e.a === u ? e.b : e.b === u ? e.a : null;
        if (!v || !q.has(v)) continue;
        const alt = dist.get(u) + e.len;
        if (alt < dist.get(v)) { dist.set(v, alt); prev.set(v, u); }
      }
    }
    let end = null;
    for (const [k, c] of goalCost) if (end === null || dist.get(k) + c < dist.get(end) + goalCost.get(end)) end = k;
    for (let k = end; k; k = prev.get(k)) nodePath.unshift(k);
  }
  const pts = [{ x: from.x, z: from.z }, startPt, ...nodePath.map((k) => ({ x: NODES.get(k).x, z: NODES.get(k).z })), goalPt, { x: to.x, z: to.z }];
  const points = pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) > 0.5);
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  return { points, length, steps: directions(points) };
}

// Turn-by-turn directions for a route.
function directions(points) {
  const steps = [];
  let last = null;
  for (let i = 2; i < points.length - 1; i++) { // skip the kerb-to-door hops at each end
    const a = points[i - 1];
    const b = points[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 12) continue;
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    const along = Math.abs(b.z - a.z) > Math.abs(b.x - a.x);
    const road = along ? nearestAvenue(mid.x).name : streetName(Math.round(114 - mid.z / BLOCK));
    const heading = along ? (b.z < a.z ? 'north' : 'south') : (b.x > a.x ? 'east' : 'west');
    if (last && last.road === road) { last.len += len; continue; }
    let turn = 'Head';
    if (last) {
      const cross = last.dx * (b.z - a.z) - last.dz * (b.x - a.x);
      turn = cross > 0 ? 'Turn right' : 'Turn left';
    }
    last = { turn, road, heading, len, dx: b.x - a.x, dz: b.z - a.z };
    steps.push(last);
  }
  return steps.map((s) => `${s.turn} ${s.heading} on ${s.road} — ${Math.round(s.len)} m`);
}

// --- Describing a place -----------------------------------------------------
const nearestAvenue = (x, nf = 114) => {
  const list = AVENUES.filter((a) => nf >= a.from - 0.6 && nf <= a.to + 0.6);
  return list.reduce((b, a) => (Math.abs(a.x - x) < Math.abs(b.x - x) ? a : b), list[0]);
};

export function nearestJunction(x, z) {
  let best = null;
  for (const nd of NODES.values()) {
    const d = Math.hypot(nd.x - x, nd.z - z);
    if (!best || d < best.d) best = { ...nd, d };
  }
  return best;
}

// Street-grid address of a point, e.g. "on Broadway between W 111th St & W 112th St (east side)".
export function describe(x, z) {
  const nf = 114 - z / BLOCK;
  const n = Math.max(108, Math.min(120, Math.round(nf)));
  const sz = streetZ(n);
  const ave = nearestAvenue(x, nf);
  const dA = Math.abs(x - ave.x) - ave.w / 2;
  const dS = Math.abs(z - sz) - streetWidth(n) / 2;
  const j = nearestJunction(x, z);
  const zone = zoneAt(x, z);
  const lo = Math.max(108, Math.min(119, Math.floor(nf)));
  let text;
  if (zone && dA > 0 && dS > 0) {
    text = `${zone.name}, near ${j.name}`;
  } else if (dA < 14 && dS < 14) {
    const ns = z < sz ? 'north' : 'south';
    const ew = x > ave.x ? 'east' : 'west';
    text = dA < 0 && dS < 0 ? `in the intersection of ${ave.name} & ${streetShort(n)}` : `${ave.name} & ${streetShort(n)} (${ns}-${ew} corner)`;
  } else if (dA < dS) {
    const side = dA < 0 ? 'in the roadway' : `${x > ave.x ? 'east' : 'west'} side`;
    text = `on ${ave.name} between ${streetShort(lo)} & ${streetShort(lo + 1)} (${side})`;
  } else {
    const aves = AVENUES.filter((a) => n >= a.from && n <= a.to).sort((p, q) => p.x - q.x);
    const west = [...aves].reverse().find((a) => a.x <= x);
    const east = aves.find((a) => a.x >= x);
    const side = dS < 0 ? 'in the roadway' : `${z < sz ? 'north' : 'south'} side`;
    const between = west && east ? `between ${west.name} & ${east.name}` : west ? `east of ${west.name}` : `west of ${east.name}`;
    text = `on ${streetName(n)} ${between} (${side})`;
  }
  return { text, junction: j, zone: zone && zone.name, latlon: toLatLon(x, z) };
}

// --- Frames of reference ----------------------------------------------------
const blocksText = (b) => {
  const r = Math.round(b * 2) / 2;
  if (r === 0) return null;
  const whole = Math.floor(Math.abs(r));
  const half = Math.abs(r) % 1 ? '½' : '';
  return `${whole || ''}${half} block${Math.abs(r) > 1 ? 's' : ''}`;
};

// Relative to a landmark (allocentric, grid-aligned): "1½ blocks south and 120 m east of …"
export function relativeTo(ref, x, z) {
  const north = (ref.z - z) / BLOCK;
  const east = x - ref.x;
  const parts = [];
  const nb = blocksText(north);
  if (nb) parts.push(`${nb} ${north > 0 ? 'north' : 'south'}`);
  if (Math.abs(east) > 15) parts.push(`${Math.round(Math.abs(east) / 10) * 10} m ${east > 0 ? 'east' : 'west'}`);
  return parts.length ? `${parts.join(' and ')} of ${ref.name}` : `right at ${ref.name}`;
}

export function nearestLandmark(x, z) {
  return LANDMARKS.filter((l) => l.id !== 'columbia').reduce((b, l) => (Math.hypot(l.x - x, l.z - z) < Math.hypot(b.x - x, b.z - z) ? l : b));
}

// Egocentric: relative to an observer's position and heading.
export function egocentric(obs, heading, x, z) {
  const dx = x - obs.x;
  const dz = z - obs.z;
  const d = Math.hypot(dx, dz);
  if (d < 5) return 'right here';
  const ang = Math.atan2(heading.x * dz - heading.z * dx, heading.x * dx + heading.z * dz); // + = to the right
  const deg = (ang * 180) / Math.PI;
  const dir = Math.abs(deg) < 22.5 ? 'straight ahead' : Math.abs(deg) > 157.5 ? 'behind' : `${Math.abs(deg) < 67.5 ? 'ahead and ' : Math.abs(deg) > 112.5 ? 'behind and ' : ''}to the ${deg > 0 ? 'right' : 'left'}`;
  return `${Math.round(d / 10) * 10} m ${dir}`;
}

// Geographic coordinates: grid origin at Broadway & W 116th St.
const ORIGIN = { lat: 40.8079, lon: -73.964, x: -150, z: streetZ(116) };
const GRID_ROT = (29 * Math.PI) / 180;
export function toLatLon(x, z) {
  const n = -(z - ORIGIN.z);
  const e = x - ORIGIN.x;
  const N = n * Math.cos(GRID_ROT) - e * Math.sin(GRID_ROT);
  const E = n * Math.sin(GRID_ROT) + e * Math.cos(GRID_ROT);
  const lat = ORIGIN.lat + N / 111320;
  const lon = ORIGIN.lon + E / (111320 * Math.cos((ORIGIN.lat * Math.PI) / 180));
  return `${lat.toFixed(5)}° N, ${Math.abs(lon).toFixed(5)}° W`;
}

// --- Reading a written description -------------------------------------------
const AVENUE_PATTERNS = [
  ['riverside', /riverside\s*(dr|drive)?(?!\s*park)/],
  ['claremont', /claremont/],
  ['broadway', /broadway|b'?way/],
  ['amsterdam', /amsterdam|amst/],
  ['morningsideDr', /morningside\s*(dr|drive)/],
  ['morningsideAve', /morningside\s*(ave|avenue)/],
  ['manhattan', /manhattan\s*(ave|avenue)/],
];

export function parsePlace(text) {
  const s = text.toLowerCase();
  const aves = AVENUE_PATTERNS.filter(([, re]) => re.test(s)).map(([id]) => avenue(id));
  const streets = [...s.matchAll(/\b(1[01]\d|120)(?:st|nd|rd|th)?\b/g)].map((m) => +m[1]).filter((n) => n >= 108 && n <= 120);
  if (/cathedral\s*p(ar)?kwy/.test(s)) streets.push(110);
  if (/college walk/.test(s)) streets.push(116);
  const landmarks = LANDMARKS.filter((l) => l.aliases.some((a) => s.includes(a)));
  const dir = (/\bnorth of|\buptown of|\babove\b/.test(s) && 'north') || (/\bsouth of|\bdowntown of|\bbelow\b/.test(s) && 'south') || (/\beast of/.test(s) && 'east') || (/\bwest of/.test(s) && 'west') || (/opposite|across from|across the street/.test(s) && 'across') || null;
  return { aves, streets: [...new Set(streets)], landmarks, dir };
}
