// Agent-based simulation: commuters, tourists and the player share one crossing.
import { N, CELL, T, idx, cellOf, cellCenter, buildEnv, astar } from './env.js';
import { SHIBUYA } from './data.js';

export function rng32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const KINDS = {
  commuter: { speed: 1.45, color: '#3d7be0' }, // fast, direct, avoids crowds
  tourist: { speed: 0.95, color: '#f0a030' },  // slow, explores, stops at landmarks
  player: { speed: 1.7, color: '#e0343a' },
};
const SCAN_R = 10;   // metres an agent can see (partial observability)
const MEM_TAU = 120; // seconds for congestion memory to fade
const LM = SHIBUYA.landmarks, EXITS = SHIBUYA.exits;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

export class Sim {
  constructor(params, { seed = 1, maxPop = 140, hour = 18 } = {}) {
    this.env = buildEnv(params);
    this.rand = rng32(seed);
    this.t = 0; this.hour = hour; this.maxPop = maxPop;
    this.agents = []; this.nextId = 1; this.spawnAcc = maxPop * 0.3;
    this.count = new Uint16Array(N * N);
    this.heat = new Float32Array(N * N);
    this.head = new Int32Array(N * N); this.next = new Int32Array(1024);
    this.stats = { first: [], repeat: [], visits: [], waits: 0 };
    this.player = null; this.events = [];
  }

  // ---- signal (time dimension) ----
  get cycle() { return this.env.params.green + this.env.params.red; }
  get green() { return this.env.params.plaza || this.t % this.cycle < this.env.params.green; }
  get signalLeft() { const m = this.t % this.cycle, g = this.env.params.green; return m < g ? g - m : this.cycle - m; }
  targetPop() { return Math.round(this.maxPop * SHIBUYA.hourlyProfile[Math.floor(this.hour) % 24]); }

  // ---- agents ----
  newAgent(kind, at) {
    return {
      id: this.nextId++, kind, x: at.x, z: at.z, vx: 0, vz: 0, heading: 0,
      speed: KINDS[kind].speed * (kind === 'player' ? 1 : 0.85 + 0.3 * this.rand()),
      origin: at, goal: null, path: [], pi: 0, cell: cellOf(at.x, at.z),
      mem: new Float32Array(N * N), memT: new Float32Array(N * N), // spatial memory: congestion
      known: new Uint8Array(N * N), // 0 unknown, 1 clear, 2 obstacle, 3 hindrance, 4 affordance
      seen: new Set(kind === 'tourist' ? ['Hachiko statue'] : []), // remembered landmarks
      visited: new Set(), trip: 0, tripStart: this.t, born: this.t,
      scanT: this.rand() * 0.5, replanCD: 0, stuckT: 0, pauseT: 0, waiting: false,
    };
  }
  spawn() {
    const o = EXITS[Math.floor(this.rand() * EXITS.length)];
    const a = this.newAgent(this.rand() < 0.7 ? 'commuter' : 'tourist',
      { x: o.x + (this.rand() - 0.5), z: o.z + (this.rand() - 0.5), name: o.name });
    this.pickGoal(a); this.agents.push(a); return a;
  }
  addPlayer() {
    const o = EXITS[8];
    this.player = this.newAgent('player', { x: o.x, z: o.z - 2, name: o.name });
    this.player.round = { n: 0, start: 0, penalty: 0, best: null, last: null, jaywalks: 0, bumps: 0, bumpCD: 0 };
    this.pickGoal(this.player);
    this.agents.push(this.player);
  }

  pickGoal(a) {
    const r = this.rand;
    if (a.kind === 'commuter' || a.kind === 'player') {
      const far = [...EXITS, ...(a.kind === 'player' ? LM : [])].filter(e => dist(e, a) > 40);
      a.goal = far[Math.floor(r() * far.length)];
    } else if (a.visited.size >= 3 || this.t - a.born > 200) {
      a.leaving = true;
      a.goal = EXITS.filter(e => dist(e, a) > 15).sort((p, q) => dist(p, a) - dist(q, a))[0];
    } else {
      const options = LM.filter(l => a.seen.has(l.name) && !a.visited.has(l.name)).sort((p, q) => dist(p, a) - dist(q, a));
      if (options.length) a.goal = options[0];
      else { // explore: wander to a random walkable spot hoping to discover landmarks
        let c; do c = Math.floor(r() * N * N); while (this.env.type[c] !== T.SIDEWALK && this.env.type[c] !== T.CROSS);
        const [x, z] = cellCenter(c); a.goal = { x, z, name: 'exploring' };
      }
    }
    if (a.kind !== 'player') this.plan(a);
  }

  // Planning uses only what the agent knows: static map + obstacles/hindrances it has seen + remembered crowds.
  costFor(a, c) {
    const t = this.env.type[c];
    if (t === T.BUILDING || t === T.ROAD || a.known[c] === 2) return Infinity;
    let m = a.known[c] === 3 ? 2 : a.known[c] === 4 ? 0.75 : 1;
    if (t === T.CROSS) m *= 1.1;
    const mem = a.mem[c] * Math.exp(-(this.t - a.memT[c]) / MEM_TAU);
    return m + (a.kind === 'commuter' ? 0.6 : 0.2) * mem;
  }
  trueCost(c) { // full knowledge – used for the player's "path distance"
    const t = this.env.type[c];
    if (t === T.BUILDING || t === T.ROAD || t === T.BARRIER) return Infinity;
    return 1 / this.env.mod[c];
  }
  plan(a) {
    const res = astar(cellOf(a.x, a.z), cellOf(a.goal.x, a.goal.z), c => this.costFor(a, c));
    a.path = res ? res.path : []; a.pi = 1; a.replanCD = 2;
    if (!res && a.kind === 'tourist' && !a.leaving) a.goal = { x: a.x, z: a.z, name: 'stuck' };
  }
  pathDistance(from, to) {
    const res = astar(cellOf(from.x, from.z), cellOf(to.x, to.z), c => this.trueCost(c));
    return res ? res.cost : Infinity;
  }

  // Scanning: look around within SCAN_R, update memory, anticipate trouble on the planned route.
  scan(a) {
    const ci = Math.floor(a.x / CELL), cj = Math.floor(a.z / CELL), R = SCAN_R / CELL;
    const ahead = new Set(a.path.slice(a.pi, a.pi + 10));
    let replan = false;
    for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
      if (di * di + dj * dj > R * R) continue;
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      const c = idx(i, j), t = this.env.type[c], m = this.env.mod[c];
      const k = t === T.BARRIER ? 2 : m < 1 ? 3 : m > 1 ? 4 : 1;
      if (k !== a.known[c]) { a.known[c] = k; if (k !== 1 && ahead.has(c)) replan = true; }
      const n = this.count[c] - (c === a.cell ? 1 : 0);
      if (n >= 2) {
        const cur = a.mem[c] * Math.exp(-(this.t - a.memT[c]) / MEM_TAU);
        a.mem[c] = Math.max(cur, n); a.memT[c] = this.t;
        if (n >= 4 && ahead.has(c)) replan = true;
      }
    }
    for (const l of LM) if (!a.seen.has(l.name) && dist(l, a) < SCAN_R) {
      a.seen.add(l.name);
      if (a.kind === 'tourist' && a.goal.name === 'exploring') { this.pickGoal(a); return; }
    }
    if (replan && a.replanCD <= 0 && a.kind !== 'player') this.plan(a);
  }

  canEnter(a, x, z) {
    if (x < 0 || z < 0 || x >= N * CELL || z >= N * CELL) return false;
    const t = this.env.type[cellOf(x, z)];
    if (t === T.SIDEWALK) return true;
    if (t === T.CROSS) return this.green || this.env.type[a.cell] === T.CROSS || a.kind === 'player';
    return false;
  }
  tryMove(a, vx, vz, dt) {
    const nx = a.x + vx * dt, nz = a.z + vz * dt;
    let moved = true;
    if (this.canEnter(a, nx, nz)) { a.x = nx; a.z = nz; }
    else if (this.canEnter(a, nx, a.z)) a.x = nx;
    else if (this.canEnter(a, a.x, nz)) a.z = nz;
    else moved = false;
    if (Math.abs(vx) + Math.abs(vz) > 0.05) a.heading = Math.atan2(vx, vz);
    return moved;
  }

  separation(a) {
    let sx = 0, sz = 0;
    const ci = a.cell % N, cj = (a.cell / N) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      for (let k = this.head[idx(i, j)]; k >= 0; k = this.next[k]) {
        const b = this.agents[k]; if (b === a) continue;
        const dx = a.x - b.x, dz = a.z - b.z, d2 = dx * dx + dz * dz;
        if (d2 < 0.81 && d2 > 1e-6) {
          const d = Math.sqrt(d2), w = (0.9 - d) / 0.9;
          sx += (dx / d) * w; sz += (dz / d) * w;
          if (d < 0.55) for (const p of [a, b]) if (p === this.player && p.round.bumpCD <= 0) { p.round.bumps++; p.round.bumpCD = 1; }
        }
      }
    }
    return [sx, sz];
  }

  step(dt, input = { x: 0, z: 0, run: false }) {
    this.t += dt;
    // spawn towards the time-of-day population
    const pop = this.agents.length - (this.player ? 1 : 0), tp = this.targetPop();
    this.spawnAcc += (dt * tp) / 20;
    while (this.spawnAcc >= 1) { this.spawnAcc--; if (pop < tp) this.spawn(); }

    // occupancy + neighbour buckets
    this.count.fill(0); this.head.fill(-1);
    if (this.next.length < this.agents.length) this.next = new Int32Array(this.agents.length * 2);
    this.agents.forEach((a, k) => {
      a.cell = cellOf(a.x, a.z); this.count[a.cell]++; this.heat[a.cell] += dt;
      this.next[k] = this.head[a.cell]; this.head[a.cell] = k;
    });

    for (const a of this.agents) {
      a.scanT -= dt; a.replanCD -= dt;
      if (a.scanT <= 0) { a.scanT = 0.5; this.scan(a); }
      if (a === this.player) { this.stepPlayer(a, dt, input); continue; }
      if (a.pauseT > 0) { a.pauseT -= dt; continue; } // tourist stopping to look around
      if (dist(a, a.goal) < 2) { this.arrive(a); continue; }
      if (a.pi >= a.path.length && a.replanCD <= 0) this.plan(a);

      let tx = a.goal.x, tz = a.goal.z;
      if (a.pi < a.path.length - 1) {
        [tx, tz] = cellCenter(a.path[a.pi]);
        if (Math.hypot(tx - a.x, tz - a.z) < 1.2) a.pi++;
      }
      let dx = tx - a.x, dz = tz - a.z; const d = Math.hypot(dx, dz) || 1;
      const n = this.count[a.cell];
      const sp = a.speed * this.env.mod[a.cell] * (n <= 2 ? 1 : 1 / (1 + 0.12 * (n - 2)));
      const [sx, sz] = this.separation(a);
      const vx = (dx / d) * sp + sx * 1.5, vz = (dz / d) * sp + sz * 1.5;

      // waiting for the light at the kerb?
      const nextT = this.env.type[cellOf(a.x + (dx / d) * 1.2, a.z + (dz / d) * 1.2)];
      a.waiting = nextT === T.CROSS && !this.green && this.env.type[a.cell] !== T.CROSS;
      if (a.waiting) { this.stats.waits += dt; a.vx = a.vz = 0; continue; }

      const moved = this.tryMove(a, vx, vz, dt);
      if (!moved) {
        a.stuckT += dt;
        if (a.stuckT > 1.5) { // remember the blockage and plan around it
          const c = a.path[a.pi] ?? a.cell;
          a.mem[c] += 5; a.memT[c] = this.t; a.stuckT = 0; this.plan(a);
        }
      } else a.stuckT = 0;
    }
    this.agents = this.agents.filter(a => !a.dead);
  }

  stepPlayer(p, dt, input) {
    const r = p.round; r.bumpCD -= dt;
    const [sx, sz] = this.separation(p);
    const sp = p.speed * (input.run ? 1.8 : 1) * this.env.mod[p.cell];
    const wasCross = this.env.type[p.cell] === T.CROSS;
    this.tryMove(p, input.x * sp + sx, input.z * sp + sz, dt);
    const nowCross = this.env.type[cellOf(p.x, p.z)] === T.CROSS;
    if (!wasCross && nowCross && !this.green) {
      r.jaywalks++; r.penalty += 5; this.events.push('Crossed on red: +5 s penalty');
    }
    if (dist(p, p.goal) < 2.5) {
      const time = this.t - r.start + r.penalty;
      r.n++; r.last = time; r.best = r.best == null ? time : Math.min(r.best, time);
      this.events.push(`Reached ${p.goal.name} in ${time.toFixed(1)} s`);
      r.start = this.t; r.penalty = 0;
      this.pickGoal(p);
    }
  }

  arrive(a) {
    if (a.kind === 'commuter') {
      (a.trip === 0 ? this.stats.first : this.stats.repeat).push(this.t - a.tripStart);
      if (a.trip === 0 && this.rand() < 0.6) { // return trip, keeping the memory from trip 1
        a.trip++; a.tripStart = this.t;
        const back = a.origin; a.origin = a.goal; a.goal = back; this.plan(a);
      } else a.dead = true;
    } else if (a.leaving) { this.stats.visits.push(a.visited.size); a.dead = true; }
    else {
      if (LM.some(l => l.name === a.goal.name)) { a.visited.add(a.goal.name); a.pauseT = 2 + 3 * this.rand(); }
      this.pickGoal(a);
    }
  }

  summary() {
    const live = this.agents.filter(a => a.kind === 'commuter').map(a => this.t - a.tripStart);
    const tour = this.agents.filter(a => a.kind === 'tourist').map(a => a.visited.size);
    const commute = mean([...this.stats.first, ...this.stats.repeat, ...live]);
    const visits = mean([...this.stats.visits, ...tour]);
    return {
      commute, visits,
      firstTrip: mean(this.stats.first), repeatTrip: mean(this.stats.repeat),
      trips: this.stats.first.length + this.stats.repeat.length,
      fitness: commute - 6 * visits, // lower is better
    };
  }
}

// Run a design headless (used by the design lab). Same seed => fair comparison.
export function evaluate(params, { seed = 7, seconds = 150, pop = 90 } = {}) {
  const s = new Sim(params, { seed, maxPop: pop, hour: 18 });
  for (let t = 0; t < seconds; t += 0.25) s.step(0.25);
  return { params, env: s.env, heat: s.heat, ...s.summary() };
}
