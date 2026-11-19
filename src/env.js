// Environment: grid model of the crossing, design presets, mutation and A* path planning.
import { SHIBUYA } from './data.js';

export const WORLD = SHIBUYA.worldSize, CELL = 2, N = WORLD / CELL;
export const T = { SIDEWALK: 0, BUILDING: 1, ROAD: 2, CROSS: 3, BARRIER: 4 };
const clampI = v => (v < 0 ? 0 : v >= N ? N - 1 : v);
export const idx = (i, j) => j * N + i;
export const cellOf = (x, z) => idx(clampI(Math.floor(x / CELL)), clampI(Math.floor(z / CELL)));
export const cellCenter = c => [((c % N) + 0.5) * CELL, (Math.floor(c / N) + 0.5) * CELL];
const inRect = (x, z, r) => x >= r[0] && x < r[2] && z >= r[1] && z < r[3];

// ---------- Design presets ("What if Shibuya?") ----------
// cross = zebra depth on each side [north, east, south, west] in metres
// rects are [x0, z0, x1, z1] in metres
const BASE = {
  cross: [6, 6, 6, 6], green: SHIBUYA.signal.green, red: SHIBUYA.signal.red, plaza: false,
  barriers: [],
  hindrances: [[14, 64, 26, 76]], // Hachiko meeting crowd
  affordances: [[28, 66, 36, 80]], // clear station-side walkway
};
export const PRESETS = {
  'Original Shibuya': BASE,
  'Wider crossing': { ...BASE, cross: [10, 10, 10, 10] },
  'Restricted movement': {
    ...BASE,
    barriers: [[49, 38, 51, 46], [49, 54, 51, 62], [38, 49, 46, 51], [54, 49, 62, 51]],
  },
  'Pedestrian plaza': { ...BASE, plaza: true },
  'Asymmetric': { ...BASE, cross: [10, 4, 8, 2], green: 35, red: 55, barriers: [[44, 44, 48, 48]] },
};
export const clone = p => JSON.parse(JSON.stringify(p));

export function buildEnv(p) {
  const type = new Uint8Array(N * N), mod = new Float32Array(N * N).fill(1);
  const [a, b] = SHIBUYA.roadBand, [cn, ce, cs, cw] = p.cross;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i + 0.5) * CELL, z = (j + 0.5) * CELL, c = idx(i, j);
    const inH = z >= a && z < b, inV = x >= a && x < b;
    let t = T.SIDEWALK;
    if (inH || inV) t = p.plaza ? T.CROSS : T.ROAD;
    if (inH && inV) t = T.CROSS; // the scramble itself
    if (inV && ((z >= a - cn && z < a) || (z >= b && z < b + cs))) t = T.CROSS; // N/S zebras
    if (inH && ((x >= a - cw && x < a) || (x >= b && x < b + ce))) t = T.CROSS; // W/E zebras
    for (const B of SHIBUYA.buildings) if (inRect(x, z, B.rect)) t = T.BUILDING;
    if (t === T.SIDEWALK || t === T.CROSS) {
      for (const r of p.barriers) if (inRect(x, z, r)) t = T.BARRIER;
      for (const r of p.hindrances) if (inRect(x, z, r)) mod[c] = 0.5;
      for (const r of p.affordances) if (inRect(x, z, r)) mod[c] = 1.35;
    }
    type[c] = t;
  }
  return { params: p, type, mod };
}

// ---------- Mutation (used by the design lab) ----------
const pick = (arr, r) => arr[Math.floor(r() * arr.length)];
const rectAt = (r, cx, cz, w, d) => {
  const x = Math.round((cx - w / 2) / 2) * 2, z = Math.round((cz - d / 2) / 2) * 2;
  return [x, z, x + w, z + d];
};
export function mutate(p0, r, steps = 2) {
  const p = clone(p0);
  for (let s = 0; s < steps; s++) {
    const op = Math.floor(r() * 7);
    if (op === 0) { const k = Math.floor(r() * 4); p.cross[k] = Math.max(2, Math.min(12, p.cross[k] + (r() < 0.5 ? -2 : 2))); }
    else if (op === 1) p.green = Math.max(15, Math.min(80, p.green + (r() < 0.5 ? -5 : 5)));
    else if (op === 2 && p.barriers.length < 6) { // guard rail inside the scramble
      const horiz = r() < 0.5;
      p.barriers.push(rectAt(r, 38 + r() * 24, 38 + r() * 24, horiz ? 8 : 2, horiz ? 2 : 8));
    }
    else if (op === 3 && p.barriers.length) p.barriers.splice(Math.floor(r() * p.barriers.length), 1);
    else if (op === 4) { // hindrance (vendors, queues) somewhere on a corner
      const [cx, cz] = pick([[30, 20], [70, 20], [70, 80], [30, 74], [20, 32], [80, 32], [80, 68]], r);
      if (p.hindrances.length >= 3) p.hindrances.shift();
      p.hindrances.push(rectAt(r, cx, cz, 6, 6));
    }
    else if (op === 5) { // affordance (cleared/wider walkway)
      const [cx, cz] = pick([[32, 14], [68, 14], [68, 86], [32, 86], [14, 32], [86, 32], [86, 68]], r);
      if (p.affordances.length >= 3) p.affordances.shift();
      p.affordances.push(rectAt(r, cx, cz, 6, 10));
    }
    else if (op === 6 && p.hindrances.length) p.hindrances.splice(Math.floor(r() * p.hindrances.length), 1);
  }
  return p;
}

// ---------- A* over the grid (8-connected, octile heuristic) ----------
const g = new Float32Array(N * N), came = new Int32Array(N * N);
const seen = new Uint32Array(N * N), closed = new Uint32Array(N * N);
const hc = new Int32Array(N * N * 8), hf = new Float32Array(N * N * 8);
let stamp = 0;
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];

// cost(c) returns a per-metre multiplier for entering cell c, or Infinity if impassable.
// Returns { path: [cells], cost: metres-equivalent } or null.
export function astar(s, goal, cost) {
  stamp++;
  let n = 0;
  const gi = goal % N, gj = (goal / N) | 0;
  const h = c => { const dx = Math.abs(c % N - gi), dz = Math.abs(((c / N) | 0) - gj); return 0.7 * CELL * (Math.max(dx, dz) + 0.4142 * Math.min(dx, dz)); };
  const push = (c, f) => { let k = n++; while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= f) break; hf[k] = hf[p]; hc[k] = hc[p]; k = p; } hf[k] = f; hc[k] = c; };
  const pop = () => {
    const top = hc[0], lc = hc[--n], lf = hf[n]; let k = 0;
    while (true) { let m = 2 * k + 1; if (m >= n) break; if (m + 1 < n && hf[m + 1] < hf[m]) m++; if (hf[m] >= lf) break; hf[k] = hf[m]; hc[k] = hc[m]; k = m; }
    hf[k] = lf; hc[k] = lc; return top;
  };
  g[s] = 0; seen[s] = stamp; came[s] = -1; push(s, h(s));
  while (n > 0) {
    const c = pop();
    if (closed[c] === stamp) continue;
    closed[c] = stamp;
    if (c === goal) {
      const path = []; for (let k = c; k !== -1; k = came[k]) path.push(k);
      return { path: path.reverse(), cost: g[c] };
    }
    const ci = c % N, cj = (c / N) | 0;
    for (const [dx, dz, w] of DIRS) {
      const ni = ci + dx, nj = cj + dz;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const nc = idx(ni, nj);
      if (closed[nc] === stamp) continue;
      const k = cost(nc);
      if (k === Infinity) continue;
      if (dx && dz && (cost(idx(ci + dx, cj)) === Infinity || cost(idx(ci, cj + dz)) === Infinity)) continue;
      const ng = g[c] + w * CELL * k;
      if (seen[nc] !== stamp || ng < g[nc]) { seen[nc] = stamp; g[nc] = ng; came[nc] = c; push(nc, ng + h(nc)); }
    }
  }
  return null;
}
