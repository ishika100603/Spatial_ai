// Spatial agents: couriers that start almost blind, see through a cone of vision,
// build their own map (streets, closures, one-ways, landmarks, parking spots) and
// plan every leg on that map — no route is given to them. Repeating runs makes them faster.
import * as THREE from 'three';
import { AVENUES, STREETS, streetZ, streetShort, EDGES, CLOSURES, streetWidth } from './food-delivery-location.js?v=10';
import { textSprite } from './food-delivery-city.js?v=10';

const D2R = Math.PI / 180;
// Cone of vision per type: faster → sees further but narrower.
export const TYPES = {
  Bike: { label: 'Motorbike', icon: '🛵', speed: 6.0, R: 60, half: 30 * D2R, gap: 3 },
  Car: { label: 'Car', icon: '🚗', speed: 5.0, R: 45, half: 45 * D2R, gap: 7 },
  Bicycle: { label: 'E-bike', icon: '🚲', speed: 4.4, R: 35, half: 60 * D2R, gap: 3 },
};
const FAMILIAR = 1.15, UNKNOWN = 0.8, SEARCH = 0.45; // speed factors: known well / unexplored / looking for a door
const DWELL = { pickup: 40, drop: 30 }; // sim seconds parked

// ---------------------------------------------------------------------------
// The street grid as an agent imagines it: every avenue × street pair is a possible block.
// ---------------------------------------------------------------------------
const key = (a, n) => `${a}@${n}`;
const NODE = new Map();
for (const a of AVENUES) for (let n = a.from; n <= a.to; n++) NODE.set(key(a.id, n), { key: key(a.id, n), x: a.x, z: streetZ(n) });
const H = [];
const mk = (a, b, ave, n) => {
  const A = NODE.get(a), B = NODE.get(b);
  return { id: `${a}|${b}`, a, b, A, B, len: Math.hypot(B.x - A.x, B.z - A.z), vertical: !!ave, ave, n, half: ave ? ave.w / 2 : streetWidth(n) / 2 };
};
for (const a of AVENUES) for (let n = a.from; n < a.to; n++) H.push(mk(key(a.id, n), key(a.id, n + 1), a));
for (const n of STREETS) {
  const av = AVENUES.filter((a) => n >= a.from && n <= a.to).sort((p, q) => p.x - q.x);
  for (let i = 0; i < av.length - 1; i++) H.push(mk(key(av[i].id, n), key(av[i + 1].id, n), null, n));
}
const HBY = new Map(H.map((h) => [h.id, h]));
const ADJ = new Map([...NODE.keys()].map((k) => [k, []]));
for (const h of H) { ADJ.get(h.a).push({ h, to: h.b }); ADJ.get(h.b).push({ h, to: h.a }); }
const EIDX = new Map(EDGES.map((e) => [e.id, e]));

// Ground truth (what the agent can discover by looking).
function truth(h) {
  const e = EIDX.get(h.id);
  const exists = !!e && e.kind === 'road';
  return { state: !exists ? 'none' : CLOSURES.has(h.id) ? 'closed' : 'open', oneWay: !!(h.ave && h.ave.oneWay), ped: e?.kind === 'ped' };
}
const ROADS = H.filter((h) => EIDX.get(h.id)?.kind === 'road');

// Open space the eye can see through: street corridors (incl. sidewalks and College Walk).
const CORR = H.filter((h) => EIDX.has(h.id)).map((h) => {
  const x0 = Math.min(h.A.x, h.B.x), x1 = Math.max(h.A.x, h.B.x), z0 = Math.min(h.A.z, h.B.z), z1 = Math.max(h.A.z, h.B.z);
  const w = h.half + 5;
  return h.vertical ? { x0: x0 - w, x1: x1 + w, z0: z0 - 14, z1: z1 + 14 } : { x0: x0 - 14, x1: x1 + 14, z0: z0 - w, z1: z1 + w };
});
const open = (x, z) => CORR.some((c) => x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1);
function los(x0, z0, x1, z1) {
  const d = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.ceil(d / 4);
  for (let i = 1; i < n; i++) if (!open(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n)) return false;
  return true;
}
function proj(p, h) {
  const dx = h.B.x - h.A.x, dz = h.B.z - h.A.z;
  const t = Math.max(0, Math.min(1, ((p.x - h.A.x) * dx + (p.z - h.A.z) * dz) / (h.len * h.len)));
  const x = h.A.x + dx * t, z = h.A.z + dz * t;
  return { t, x, z, d: Math.hypot(p.x - x, p.z - z) };
}
function snapRoad(p) {
  let best = null;
  for (const h of ROADS) { const r = proj(p, h); if (!best || r.d < best.d) best = { ...r, h }; }
  return best;
}

// ---------------------------------------------------------------------------
// Landmarks (positioning criteria) and delivery addresses.
// ---------------------------------------------------------------------------
const LMKS = [
  { id: 'R01', icon: '🍽️', name: 'Indian Kitchen', cat: 'restaurant', x: -126, z: 200 },
  { id: 'R02', icon: '🍽️', name: 'Thai Leaf', cat: 'restaurant', x: 93.5, z: 215 },
  { id: 'R03', icon: '🍽️', name: 'Wok on Wheels', cat: 'restaurant', x: -173.5, z: streetZ(116) + 42 },
  { id: 'R04', icon: '🍽️', name: 'Trattoria Roma', cat: 'restaurant', x: 126.5, z: 40 },
  { id: 'cathedral', icon: '⛪', name: 'Cathedral of St. John', cat: 'church', x: 127, z: streetZ(112) - 2 },
  { id: 'notreDame', icon: '⛪', name: 'Church of Notre Dame', cat: 'church', x: 243, z: streetZ(114) + 14 },
  { id: 'mainGates', icon: '🏫', name: 'Columbia Main Gates', cat: 'school', x: -126, z: streetZ(116) + 4 },
  { id: 'amsGates', icon: '🏫', name: 'Columbia Amsterdam Gates', cat: 'school', x: 94, z: streetZ(116) + 4 },
  { id: 'park', icon: '🌳', name: 'Morningside Park', cat: 'park', x: 268, z: streetZ(113) + 30 },
  { id: 'station', icon: '🚇', name: '116 St station', cat: 'transit', x: -150, z: streetZ(116) + 15 },
];
const DOORS = [
  { id: 'C03', name: "Ana's home", x: 190, z: 73.5 },
  { id: 'C01', name: "Priya's home", x: 243.5, z: -125 },
  { id: 'C02', name: "Sam's home", x: -40, z: 73.5 },
  { id: 'D1', name: 'Home · W 112th St', x: -60, z: 156 },
  { id: 'D2', name: 'Home · W 114th St', x: 20, z: 12 },
  { id: 'D3', name: 'Home · W 114th St (east)', x: 180, z: -12 },
  { id: 'D4', name: 'Home · W 115th St', x: 200, z: streetZ(115) + 12 },
  { id: 'D5', name: 'Home · W 111th St', x: -20, z: streetZ(111) + 12 },
  { id: 'D6', name: 'Home · Morningside Dr', x: 243, z: 40 },
  { id: 'D7', name: 'Home · Broadway', x: -125, z: -40 },
  { id: 'D8', name: 'Home · W 116th St', x: 180, z: streetZ(116) + 12 },
].map((d) => ({ ...d, icon: '🏠', cat: 'home' }));
const PLACES = [...LMKS, ...DOORS];
for (const p of PLACES) p.h = snapRoad(p).h; // the block an address is on
const RESTAURANTS = LMKS.filter((l) => l.cat === 'restaurant');
const placeById = new Map(PLACES.map((p) => [p.id, p]));

const fmtMin = (s) => `${(s / 60).toFixed(1)} min`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const PALETTE = ['#2f80ed', '#eb5757', '#27ae60', '#9b51e0', '#f2994a', '#56ccf2', '#bb6bd9', '#219653', '#f2c94c', '#6fcf97', '#2d9cdb', '#e0567a'];

export function createAgents({ scene, city, camera, riderMesh, lanePath, barEl, onSelect }) {
  const agents = [];
  const reserved = new Map(); // agentId -> parking spot {x,z,mode}
  const edgeUse = new Map(); // aggregate street usage
  let simT = 0, focusId = 'KAI';
  const view = { cones: true, mind: true, paths: true, compare: false, heat: false };
  let fleetN = 12;
  let overlayDirty = true, overlayAcc = 0;

  // ----- knowledge & planning -----
  function beliefCost(ag, h, from) {
    const s = ag.k.edges.get(h.id);
    if (!s) return h.len * 0.95; // curious: an unseen block might be a shortcut
    if (s.state !== 'open') return Infinity;
    if (s.oneWay && from !== h.a) return Infinity;
    if (s.pace) return h.len * s.pace * ag.T.speed; // how long this street really took it (red lights and queues included)
    return h.len / (s.uses >= 2 ? FAMILIAR : 1);
  }
  function truthCost(h, from) {
    const t = truth(h);
    if (t.state !== 'open' || (t.oneWay && from !== h.a)) return Infinity;
    return h.len / FAMILIAR;
  }
  // Shortest path from a point to a point on block qh, under a cost function. Returns steps + points.
  function plan(p, q, qh, costFn) {
    const sp = snapRoad(p);
    const qt = proj(q, qh).t;
    let best = null;
    if (sp.h === qh) {
      const fwd = qt >= sp.t;
      const c = costFn(qh, fwd ? qh.a : qh.b);
      if (c < Infinity) best = { cost: Math.abs(qt - sp.t) * c, nodes: [], steps: [{ id: qh.id, from: fwd ? qh.a : qh.b }] };
    }
    const dist = new Map(), prev = new Map(), done = new Set();
    const cA = costFn(sp.h, sp.h.b), cB = costFn(sp.h, sp.h.a);
    if (cA < Infinity) { dist.set(sp.h.a, sp.t * cA); prev.set(sp.h.a, { start: { id: sp.h.id, from: sp.h.b } }); }
    if (cB < Infinity && (!dist.has(sp.h.b) || (1 - sp.t) * cB < dist.get(sp.h.b))) { dist.set(sp.h.b, (1 - sp.t) * cB); prev.set(sp.h.b, { start: { id: sp.h.id, from: sp.h.a } }); }
    for (;;) {
      let u = null;
      for (const [k, d] of dist) if (!done.has(k) && (u === null || d < dist.get(u))) u = k;
      if (u === null) break;
      done.add(u);
      for (const { h, to } of ADJ.get(u)) {
        const c = costFn(h, u);
        if (c === Infinity) continue;
        const nd = dist.get(u) + c;
        if (!dist.has(to) || nd < dist.get(to)) { dist.set(to, nd); prev.set(to, { from: u, h }); }
      }
    }
    for (const [end, frac] of [[qh.a, qt], [qh.b, 1 - qt]]) {
      const c = costFn(qh, end);
      if (c === Infinity || !dist.has(end)) continue;
      const tot = dist.get(end) + frac * c;
      if (!best || tot < best.cost - 0.01) {
        const nodes = [], steps = [{ id: qh.id, from: end }];
        let k = end;
        for (;;) {
          nodes.unshift(k);
          const pv = prev.get(k);
          if (pv.start) { steps.unshift(pv.start); break; }
          steps.unshift({ id: pv.h.id, from: pv.from });
          k = pv.from;
        }
        best = { cost: tot, nodes, steps };
      }
    }
    if (!best) return null;
    best.points = [p, ...best.nodes.map((k) => ({ x: NODE.get(k).x, z: NODE.get(k).z })), q];
    return best;
  }
  const legCost = (ag, p, place, costFn) => plan(p, place, place.h, costFn)?.cost ?? Infinity;

  // Order of stops: try every order that picks up before it drops off; keep the cheapest on the agent's own map.
  function chooseOrder(ag, stops, from, costFn) {
    const perms = [];
    const rec = (left, acc) => {
      if (!left.length) return perms.push(acc);
      for (const s of left) if (!s.after || acc.includes(s.after)) rec(left.filter((x) => x !== s), [...acc, s]);
    };
    rec(stops, []);
    let best = null;
    for (const seq of perms) {
      let c = 0, p = from;
      for (const s of seq) { c += legCost(ag, p, s.place, costFn); p = s.place; if (c === Infinity) break; }
      if (s0(seq) && (!best || c < best.c)) best = { seq, c };
    }
    return best;
    function s0(seq) { return !seq.some((s, i) => s.mustBeLast && i !== seq.length - 1); }
  }

  // ----- perception: the cone of vision -----
  function inCone(ag, px, pz) {
    const dx = px - ag.pos.x, dz = pz - ag.pos.z, d = Math.hypot(dx, dz);
    if (d > ag.T.R) return false;
    if (d < 4) return true;
    return (dx * ag.head.x + dz * ag.head.z) / d >= Math.cos(ag.T.half);
  }
  function observe(ag) {
    const { x, z } = ag.pos;
    let blocked = false;
    for (const h of H) {
      if (Math.min(Math.hypot(h.A.x - x, h.A.z - z), Math.hypot(h.B.x - x, h.B.z - z), proj(ag.pos, h).d) > ag.T.R + 5) continue;
      const s = ag.k.edges.get(h.id);
      const tr = truth(h);
      if (s && s.state === tr.state) continue;
      let seen = false;
      // standing near a junction you can see whether the block ahead has a street (or a wall, a barricade, a one-way sign)
      for (const [E, F] of [[h.A, h.B], [h.B, h.A]]) {
        if (Math.hypot(E.x - x, E.z - z) < 14) {
          const px = E.x + ((F.x - E.x) / h.len) * 12, pz = E.z + ((F.z - E.z) / h.len) * 12;
          if (inCone(ag, px, pz)) { seen = true; break; }
        }
      }
      if (!seen) for (const t of [0.2, 0.5, 0.8]) {
        const px = h.A.x + (h.B.x - h.A.x) * t, pz = h.A.z + (h.B.z - h.A.z) * t;
        if (inCone(ag, px, pz) && los(x, z, px, pz)) { seen = true; break; }
      }
      if (!seen) continue;
      ag.k.edges.set(h.id, { ...tr, uses: s?.uses || 0, seenAt: simT });
      ag.kv++;
      if (tr.state !== 'open' || tr.oneWay) blocked = true;
      if (tr.state === 'closed' && (!s || s.state !== 'closed')) note(ag, `⛔ saw a closure on ${label(h)}`);
      if (tr.state === 'none' && !s) note(ag, `✕ no road on ${label(h)}`);
    }
    for (const L of PLACES) {
      if (ag.k.lm.has(L.id)) continue;
      const d = Math.hypot(L.x - x, L.z - z);
      if (d < 14 || (inCone(ag, L.x, L.z) && los(x, z, L.x, L.z))) {
        ag.k.lm.set(L.id, { t: simT });
        ag.kv++;
        if (L.cat !== 'home') note(ag, `${L.icon} new landmark: ${L.name}`);
      }
    }
    // other road users ahead (agents treat them as obstacles)
    const occ = city.occupants;
    ag.ahead = null;
    for (const v of occ.vehicles) {
      const dx = v.x - x, dz = v.z - z;
      const al = dx * ag.head.x + dz * ag.head.z, lat = Math.abs(dx * ag.head.z - dz * ag.head.x);
      if (al > 0.5 && al < ag.T.gap + 3 && lat < 1.7) { ag.ahead = 'traffic ahead'; break; }
    }
    if (!ag.ahead && ag.leg && ag.leg.len - ag.leg.s > 10) for (const p of occ.people) {
      const dx = p.x - x, dz = p.z - z;
      const al = dx * ag.head.x + dz * ag.head.z, lat = Math.abs(dx * ag.head.z - dz * ag.head.x);
      if (al > 0.5 && al < 5 && lat < 1.3) { ag.ahead = 'person crossing'; break; }
    }
    // learning while moving: is the planned way still possible?
    if (blocked && ag.leg) {
      const i = Math.max(0, ag.leg.steps.findIndex((s) => s.id === ag.curEdge));
      if (ag.leg.steps.slice(i).some((st) => beliefCost(ag, HBY.get(st.id), st.from) === Infinity)) {
        ag.run.replans++;
        note(ag, '↻ re-planning on its own map');
        startLeg(ag, ag.leg.stop, true);
      }
    }
  }
  const label = (h) => (h.vertical ? `${h.ave.name} ${h.a.split('@')[1]}–${h.b.split('@')[1]}` : `${streetShort(h.n)}`);
  function note(ag, msg) {
    ag.log.unshift({ t: simT, msg });
    ag.log.length = Math.min(ag.log.length, 6);
  }

  // ----- parking that does not hinder others -----
  function findSpot(ag, place) {
    const h = place.h;
    const ux = (h.B.x - h.A.x) / h.len, uz = (h.B.z - h.A.z) / h.len, nx = -uz, nz = ux;
    const along = (place.x - h.A.x) * ux + (place.z - h.A.z) * uz;
    const side = Math.sign((place.x - h.A.x) * nx + (place.z - h.A.z) * nz) || 1;
    const car = ag.type === 'Car';
    const off = car ? h.half - 1.3 : h.half + 1.0; // car: kerb lane; bikes: sidewalk edge by the trees
    const gap = car ? 7.5 : 2.4;
    const ok = (sp) => ![...reserved].some(([id, r]) => id !== ag.id && Math.hypot(r.x - sp.x, r.z - sp.z) < gap);
    const remembered = ag.k.spots.get(place.id);
    if (remembered && ok(remembered)) return { ...remembered, remembered: true };
    for (let k = 0; k < 16; k++) for (const sg of [1, -1]) {
      const a = along + sg * k * 2.5;
      if (a < 16 || a > h.len - 16) continue; // keep crosswalks and the intersection clear
      if (!car && Math.abs(a - along) < 1.8) continue; // keep the doorway clear
      const sp = { x: h.A.x + ux * a + nx * side * off, z: h.A.z + uz * a + nz * side * off, hx: ux, hz: uz };
      if (ok(sp)) return sp;
    }
    return { x: h.A.x + ux * along + nx * side * off, z: h.A.z + uz * along + nz * side * off, hx: ux, hz: uz };
  }

  // ----- legs, runs -----
  function startLeg(ag, stop, replan = false) {
    reserved.delete(ag.id);
    const spot = findSpot(ag, stop.place);
    reserved.set(ag.id, spot);
    let r = plan(ag.pos, spot, stop.place.h, (h, f) => beliefCost(ag, h, f));
    if (!r) { // its own map says there is no way — ask the app for directions
      r = plan(ag.pos, spot, stop.place.h, truthCost);
      note(ag, '📱 stuck: asked the app for directions');
      for (const st of r?.steps || []) { const h = HBY.get(st.id); if (!ag.k.edges.has(h.id)) ag.k.edges.set(h.id, { ...truth(h), uses: 0, seenAt: simT }); }
    }
    if (!r) { ag.leg = null; ag.state = 'stuck'; return; }
    const points = lanePath(r.points, ag.type);
    let len = 0;
    for (let i = 1; i < points.length; i++) len += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    ag.leg = { stop, spot, points, len, s: 0, steps: r.steps };
    if (!replan) { ag.edgeT0 = ag.clock || 0; ag.edgeD = 0; } // parked time is not street time
    const unknown = r.steps.map((st) => HBY.get(st.id)).find((h) => !ag.k.edges.has(h.id));
    if (!replan && unknown && ag.runs.length) note(ag, `🧭 exploring a street it has not seen: ${label(unknown)}`);
    ag.state = 'drive';
    if (!replan) ag.spotNote = spot.remembered ? 'remembered spot' : '';
    overlayDirty = true;
  }
  function newRun(ag) {
    let stops;
    if (ag.main) {
      // Kai: two parcels from Wok on Wheels — the goal is Ana's home, Priya's home is another delivery on the way.
      // The obvious way east from Broadway (W 115th / W 116th) crosses the Columbia campus: no road there.
      stops = [
        { kind: 'drop', place: placeById.get('C01'), label: "Priya's home (on the way)" },
        { kind: 'drop', place: placeById.get('C03'), label: "Ana's home (goal)" },
        { kind: 'pickup', place: placeById.get('R03'), label: 'back to Wok on Wheels', mustBeLast: true },
      ];
    } else {
      const rs = [RESTAURANTS[(Math.random() * 4) | 0], RESTAURANTS[(Math.random() * 4) | 0]];
      const ds = DOORS.slice().sort(() => Math.random() - 0.5).slice(0, 2);
      const p1 = { kind: 'pickup', place: rs[0], label: rs[0].name };
      const p2 = rs[1] === rs[0] ? p1 : { kind: 'pickup', place: rs[1], label: rs[1].name };
      stops = [p1, ...(p2 === p1 ? [] : [p2]), { kind: 'drop', place: ds[0], label: ds[0].name, after: p1 }, { kind: 'drop', place: ds[1], label: ds[1].name, after: p2 }];
    }
    const ord = chooseOrder(ag, stops, ag.pos, (h, f) => beliefCost(ag, h, f)) || { seq: stops };
    const ideal = chooseOrder(ag, stops, ag.pos, truthCost);
    const dwell = stops.reduce((s, x) => s + DWELL[x.kind] * 0.55, 0);
    ag.run = { n: ag.runs.length + 1, seq: ord.seq, idx: 0, t0: simT, dist: 0, replans: 0, trail: [{ ...ag.pos }], ideal: (ideal ? ideal.c / ag.T.speed : 0) + dwell };
    startLeg(ag, ord.seq[0]);
  }
  function arrive(ag) {
    const st = ag.leg.stop;
    ag.k.lm.set(st.place.id, ag.k.lm.get(st.place.id) || { t: simT });
    ag.k.spots.set(st.place.id, { x: ag.leg.spot.x, z: ag.leg.spot.z, hx: ag.leg.spot.hx, hz: ag.leg.spot.hz });
    if (ag.leg.spot.hx !== undefined) ag.head = { x: ag.leg.spot.hx * Math.sign(ag.head.x * ag.leg.spot.hx + ag.head.z * ag.leg.spot.hz || 1), z: ag.leg.spot.hz * Math.sign(ag.head.x * ag.leg.spot.hx + ag.head.z * ag.leg.spot.hz || 1) };
    ag.state = 'park';
    const visits = (ag.k.visits.get(st.place.id) || 0) + 1; // a door it knows (buzzer, entrance) is quicker to hand over at
    ag.k.visits.set(st.place.id, visits);
    ag.dwell = DWELL[st.kind] * Math.max(0.55, 1 - 0.15 * (visits - 1));
    ag.leg = null;
    note(ag, `🅿 parked at ${st.place.name} · kerb clear`);
  }
  function afterDwell(ag) {
    const r = ag.run;
    r.idx++;
    if (r.idx < r.seq.length) {
      // re-check the order of what is left with what it now knows
      const rest = r.seq.slice(r.idx);
      const ord = chooseOrder(ag, rest, ag.pos, (h, f) => beliefCost(ag, h, f));
      if (ord) r.seq.splice(r.idx, rest.length, ...ord.seq);
      return startLeg(ag, r.seq[r.idx]);
    }
    const time = simT - r.t0;
    ag.runs.push({ n: r.n, time, dist: r.dist, replans: r.replans, ideal: r.ideal, eff: Math.min(1, r.ideal / time), trail: r.trail, order: r.seq.map((s) => s.label) });
    overlayDirty = true;
    newRun(ag);
  }

  // ----- agents -----
  function makeAgent(id, name, type, color, main = false) {
    const T = TYPES[type];
    const start = main ? { x: -171, z: streetZ(116) + 50 } : (() => { const free = ROADS.filter((r) => !CLOSURES.has(r.id)); const h = free[Math.floor(Math.random() * free.length)]; const t = 0.25 + Math.random() * 0.5; return { x: h.A.x + (h.B.x - h.A.x) * t, z: h.A.z + (h.B.z - h.A.z) * t }; })();
    const sh = snapRoad(start).h;
    const ag = {
      id, name, type, T, color, main, pos: { ...start }, head: main ? { x: -1, z: 0 } : { x: (sh.B.x - sh.A.x) / sh.len, z: (sh.B.z - sh.A.z) / sh.len },
      k: { edges: new Map(), lm: new Map(), spots: new Map(), visits: new Map() }, kv: 0, runs: [], log: [], state: 'park', dwell: main ? 4 : Math.random() * 20,
      run: null, leg: null, curEdge: sh.id, obsAcc: 0, blockT: 0, ignoreT: 0, moved: 0,
    };
    const g = new THREE.Group();
    const body = riderMesh({ commuteType: type });
    body.scale.setScalar(main ? 1.9 : 1.5);
    g.add(body);
    const halo = new THREE.Mesh(new THREE.RingGeometry(main ? 4.2 : 3, main ? 5.4 : 3.6, 40), new THREE.MeshBasicMaterial({ color: main ? 0xffc400 : color, transparent: true, opacity: 0.9, depthWrite: false }));
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.35;
    g.add(halo);
    g.userData.agentId = id;
    body.traverse((o) => (o.userData.agentId = id));
    const lab = textSprite(main ? `★ ${name}` : name, { color: '#fff', bg: main ? 'rgba(200,140,0,.95)' : color, size: main ? 0.03 : 0.02 });
    lab.position.y = main ? 11 : 8;
    g.add(lab);
    scene.add(g);
    // cone of vision: a fan on the ground
    const coneGeo = new THREE.CircleGeometry(T.R, 28, -T.half, 2 * T.half);
    const cone = new THREE.Group();
    const fan = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: main ? 0xffc400 : color, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
    fan.rotation.x = -Math.PI / 2;
    const edge = new THREE.LineLoop(new THREE.EdgesGeometry(coneGeo), new THREE.LineBasicMaterial({ color: main ? 0xffc400 : color, transparent: true, opacity: 0.6 }));
    edge.rotation.x = -Math.PI / 2;
    cone.add(fan, edge);
    cone.renderOrder = 3;
    scene.add(cone);
    Object.assign(ag, { g, body, cone, fan, lab });
    observe(ag);
    agents.push(ag);
    return ag;
  }
  function removeAgent(ag) {
    scene.remove(ag.g, ag.cone);
    reserved.delete(ag.id);
    agents.splice(agents.indexOf(ag), 1);
  }
  function setFleet(n) {
    fleetN = Math.max(0, Math.min(30, n));
    const fleet = agents.filter((a) => !a.main);
    while (fleet.length > fleetN) removeAgent(fleet.pop());
    const types = ['Bike', 'Car', 'Bicycle'];
    for (let i = fleet.length; i < fleetN; i++) {
      const id = `A${String(i + 1).padStart(2, '0')}`;
      fleet.push(makeAgent(id, id, types[i % 3], PALETTE[i % PALETTE.length]));
    }
    overlayDirty = true;
    renderBar(true);
  }

  // ----- stepping -----
  function step(ag, dt) {
    ag.clock = (ag.clock || 0) + dt;
    if (ag.state === 'park' || ag.state === 'stuck') {
      ag.dwell -= dt;
      if (ag.dwell <= 0) { if (!ag.run) newRun(ag); else afterDwell(ag); }
      return;
    }
    const L = ag.leg;
    if (!L) return;
    // what stops it: red light, someone ahead, another agent ahead
    let stop = null;
    const sa = city.signalAhead(ag.pos.x, ag.pos.z, ag.head, 20);
    if (sa && sa.state !== 'green' && sa.stop > -0.5 && sa.stop < 3) stop = 'red light';
    if (!stop && ag.ignoreT <= 0) {
      if (ag.ahead) stop = ag.ahead;
      else for (const o of agents) {
        if (o === ag || o.state !== 'drive') continue;
        if (o.head.x * ag.head.x + o.head.z * ag.head.z < 0.5) continue;
        const dx = o.pos.x - ag.pos.x, dz = o.pos.z - ag.pos.z;
        const al = dx * ag.head.x + dz * ag.head.z, lat = Math.abs(dx * ag.head.z - dz * ag.head.x);
        if (al > 0.5 && al < ag.T.gap + 2 && lat < 1.6) { stop = `${o.name} ahead`; break; }
      }
    }
    ag.ignoreT -= dt;
    if (stop && stop !== 'red light') { ag.blockT += dt; if (ag.blockT > 6) { ag.ignoreT = 3; ag.blockT = 0; } }
    else ag.blockT = 0;
    ag.why = stop;
    if (stop) return;
    const s = ag.k.edges.get(ag.curEdge);
    let f = !s ? UNKNOWN : s.uses >= 2 ? FAMILIAR : 1;
    ag.searching = ag.curEdge === L.stop.place.h.id && !ag.k.lm.has(L.stop.place.id);
    if (ag.searching) f = SEARCH;
    const ds = ag.T.speed * f * dt;
    L.s = Math.min(L.len, L.s + ds);
    ag.run.dist += ds;
    let acc = 0;
    for (let i = 1; i < L.points.length; i++) {
      const a = L.points[i - 1], b = L.points[i];
      const sl = Math.hypot(b.x - a.x, b.z - a.z);
      if (acc + sl >= L.s || i === L.points.length - 1) {
        const k = sl ? Math.min(1, (L.s - acc) / sl) : 1;
        ag.pos = { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k };
        if (sl > 0.5) ag.head = { x: (b.x - a.x) / sl, z: (b.z - a.z) / sl };
        break;
      }
      acc += sl;
    }
    ag.moved += ds;
    ag.edgeD = (ag.edgeD || 0) + ds;
    ag.sinceObs = (ag.sinceObs || 0) + ds;
    if (ag.sinceObs > 6) { ag.sinceObs = 0; observe(ag); if (ag.leg !== L) return; } // look at least every 6 m, whatever the sim speed
    if (ag.moved > 4) { ag.moved = 0; ag.run.trail.push({ ...ag.pos }); }
    const ce = snapRoad(ag.pos).h.id;
    if (ce !== ag.curEdge) {
      const prev = ag.k.edges.get(ag.curEdge);
      if (prev) {
        prev.uses++;
        if (ag.edgeD > 25) { // seconds per metre on this street, smoothed over its visits
          const pace = ((ag.clock || 0) - ag.edgeT0) / ag.edgeD;
          prev.pace = prev.pace ? prev.pace * 0.6 + pace * 0.4 : pace;
          if (prev.pace * ag.T.speed > 2.4 && !prev.slowNoted) { prev.slowNoted = true; note(ag, `🐢 slow street: ${label(HBY.get(ag.curEdge))}`); }
        }
      }
      ag.edgeT0 = ag.clock || 0;
      ag.edgeD = 0;
      edgeUse.set(ag.curEdge, (edgeUse.get(ag.curEdge) || 0) + 1);
      ag.curEdge = ce;
    }
    if (L.s >= L.len) arrive(ag);
  }

  // ----- visuals: knowledge map, path history, aggregate heat -----
  const overlay = new THREE.Group();
  scene.add(overlay);
  const lmIcons = new Map();
  for (const L of PLACES) {
    if (L.cat === 'home' && !['C01', 'C03'].includes(L.id)) continue;
    const s = textSprite(L.icon, { bg: null, size: L.cat === 'home' ? 0.03 : 0.036 });
    s.position.set(L.x, 14, L.z);
    scene.add(s);
    lmIcons.set(L.id, s);
  }
  function strip(points, color, width, y, opacity) {
    const pos = [], idx = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const Ls = Math.hypot(b.x - a.x, b.z - a.z);
      if (Ls < 0.01) continue;
      const nx = (-(b.z - a.z) / Ls) * width, nz = ((b.x - a.x) / Ls) * width;
      const k = pos.length / 3;
      pos.push(a.x + nx, y, a.z + nz, a.x - nx, y, a.z - nz, b.x - nx, y, b.z - nz, b.x + nx, y, b.z + nz);
      idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
    m.renderOrder = 5;
    return m;
  }
  const runColor = (i, n) => new THREE.Color().setHSL((n <= 1 ? 0 : i / (n - 1)) * 0.33, 0.85, 0.48); // red (oldest) → green (latest)
  function rebuildOverlay() {
    overlay.children.forEach((c) => { c.geometry?.dispose(); c.material?.map?.dispose(); c.material?.dispose(); });
    overlay.clear();
    const ag = agents.find((a) => a.id === focusId) || agents[0];
    if (!ag) return;
    if (view.mind) {
      for (const h of H) {
        const s = ag.k.edges.get(h.id);
        if (!s) continue;
        const col = s.state === 'closed' ? 0xe8352a : s.state === 'none' ? 0x3a3a3a : s.oneWay ? 0xf2c94c : 0x22c55e;
        overlay.add(strip([h.A, h.B], col, s.state === 'open' ? 1.2 : 2.2, 0.55, s.state === 'open' ? 0.55 : 0.85));
        if (s.state !== 'open') {
          const t = textSprite(s.state === 'closed' ? '⛔' : '✕', { bg: null, size: 0.028, color: '#fff' });
          t.position.set((h.A.x + h.B.x) / 2, 4, (h.A.z + h.B.z) / 2);
          overlay.add(t);
        }
      }
      for (const [pid, sp] of ag.k.spots) {
        const t = textSprite('P', { color: '#fff', bg: '#2563eb', size: 0.018 });
        t.position.set(sp.x, 2.5, sp.z);
        overlay.add(t);
        void pid;
      }
    }
    // Runs that drove the same streets would hide each other, so each one is drawn
    // offset sideways (like lines on a transit map): the current run in the middle, older runs further out.
    const shift = (pts, off) => pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      return { x: p.x - ((b.z - a.z) / L) * off, z: p.z + ((b.x - a.x) / L) * off };
    });
    const tag = (pts, frac, text, bg, size = 0.022) => {
      const p = pts[Math.floor((pts.length - 1) * frac)] || pts[0];
      if (!p) return;
      const t = textSprite(text, { color: '#fff', bg, size });
      t.position.set(p.x, 7, p.z);
      overlay.add(t);
    };
    const runText = (r) => `Run ${r.n} · ${(r.time / 60).toFixed(1)} min · ${Math.round(r.dist)} m`;
    if (view.compare && ag.runs.length) {
      // only the first and the latest run: where the agent went before and after learning
      const first = ag.runs[0], last = ag.runs[ag.runs.length - 1];
      const fp = shift(first.trail, 2.6);
      overlay.add(strip(fp, 0xd62d20, 2.2, 0.75, 0.9));
      tag(fp, 0.3, runText(first), '#d62d20');
      if (last !== first) { const lp = shift(last.trail, -2.6); overlay.add(strip(lp, 0x1a9850, 1.8, 0.95, 0.95)); tag(lp, 0.6, `Latest · ${runText(last)}`, '#1a9850'); }
    } else if (view.paths) {
      const runs = ag.runs.slice(-8);
      const N = runs.length;
      runs.forEach((r, i) => {
        const pts = shift(r.trail, -(N - i) * 2.6);
        const col = runColor(i, N);
        overlay.add(strip(pts, col, i === N - 1 ? 1.5 : 1.1, 0.7 + i * 0.03, 0.9));
        tag(pts, 0.1 + (0.8 * i) / Math.max(1, N), i === N - 1 ? `Previous · ${runText(r)}` : `Run ${r.n} · ${(r.time / 60).toFixed(1)} min`, `#${col.getHexString()}`, i === N - 1 ? 0.022 : 0.018);
      });
      if (ag.run?.trail.length > 1) overlay.add(strip([...ag.run.trail, ag.pos], new THREE.Color(ag.main ? '#ffc400' : ag.color), 1.4, 1.05, 0.95));
      if (ag.leg) overlay.add(strip(ag.leg.points.slice(), 0xffffff, 0.35, 1.1, 0.7));
    }
    if (view.heat) {
      const max = Math.max(1, ...edgeUse.values());
      for (const [id, c] of edgeUse) {
        const h = HBY.get(id);
        if (!h) continue;
        const k = c / max;
        overlay.add(strip([h.A, h.B], new THREE.Color().setHSL(0.15 - 0.15 * k, 1, 0.5), 1.5 + 6 * k, 0.6, 0.35 + 0.5 * k));
      }
      for (const L of PLACES) {
        const n = agents.filter((a) => a.k.lm.has(L.id)).length;
        if (!n || (L.cat === 'home')) continue;
        const r = 3 + 1.6 * n;
        const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshBasicMaterial({ color: 0xff6a00, transparent: true, opacity: 0.18 + 0.5 * (n / agents.length), depthWrite: false }));
        disc.rotation.x = -Math.PI / 2;
        disc.position.set(L.x, 0.8, L.z);
        overlay.add(disc);
        const t = textSprite(`${n}/${agents.length} know`, { color: '#7a2e00', size: 0.016 });
        t.position.set(L.x, 9, L.z);
        overlay.add(t);
      }
    }
    // landmark icons: bright when known by the focused agent
    lmIcons.forEach((s, id) => (s.material.opacity = ag.k.lm.has(id) ? 1 : 0.28));
  }

  // ----- UI: one compact control row + the agent card -----
  function renderBar(force) {
    if (!barEl || (!force && barEl.matches(':hover'))) return;
    const all = agents.filter((a) => a.runs.length);
    const first = all.length ? Math.round(100 * avg(all.map((a) => a.runs[0].eff))) : null;
    const last = all.length ? Math.round(100 * avg(all.map((a) => a.runs[a.runs.length - 1].eff))) : null;
    const html = `<div class="fd-ag-row"><b>Agents</b><button data-ag="-">−</button><span>${fleetN + 1}</span><button data-ag="+">+</button>
      ${[['cones', '👁 Cone'], ['mind', '🧠 Map'], ['paths', '〰 Paths'], ['compare', '⇄ Run 1 vs latest'], ['heat', '🔥 All']].map(([k, t]) => `<button data-agv="${k}" class="${view[k] ? 'on' : ''}">${t}</button>`).join('')}
      <button data-ag="kai">★ Kai</button></div>
      ${(() => { const k = agents.find((a) => a.main); const t = oldVsNew(k); return t ? `<div class="fd-ag-time">★ Kai · ${t}</div>` : ''; })()}
      ${first !== null ? `<div class="fd-ag-sub">All agents · first run ${first}% of ideal → latest ${last}%</div>` : ''}`;
    if (barEl.dataset.html !== html) { barEl.innerHTML = html; barEl.dataset.html = html; }
  }
  barEl?.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.ag === '+') setFleet(fleetN + 3);
    else if (b.dataset.ag === '-') setFleet(fleetN - 3);
    else if (b.dataset.ag === 'kai') onSelect?.('KAI');
    else if (b.dataset.agv) { view[b.dataset.agv] = !view[b.dataset.agv]; overlayDirty = true; }
    renderBar(true);
  });
  const avg = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
  // First run vs the latest finished run: time and distance, and how much faster it got.
  function oldVsNew(ag) {
    if (!ag || !ag.runs.length) return null;
    const a = ag.runs[0], b = ag.runs[ag.runs.length - 1];
    const m = (t) => `${(t / 60).toFixed(1)} min`;
    if (a === b) return `Run 1: ${m(a.time)} · ${Math.round(a.dist)} m · learning…`;
    const pct = Math.round((100 * (a.time - b.time)) / a.time);
    return `Run 1: ${m(a.time)} → run ${b.n}: ${m(b.time)} · ${pct >= 0 ? `${pct}% faster` : `${-pct}% slower`}`;
  }

  function whereByLandmark(ag) {
    let best = null;
    for (const id of ag.k.lm.keys()) {
      const L = placeById.get(id);
      if (!L || L.cat === 'home') continue;
      const d = Math.hypot(L.x - ag.pos.x, L.z - ag.pos.z);
      if (!best || d < best.d) best = { L, d };
    }
    if (!best) return 'no landmarks yet';
    const dx = ag.pos.x - best.L.x, dz = ag.pos.z - best.L.z;
    const dir = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'E' : 'W') : dz > 0 ? 'S' : 'N';
    return best.d < 20 ? `at ${best.L.icon} ${best.L.name}` : `${Math.round(best.d)} m ${dir} of ${best.L.icon} ${best.L.name}`;
  }
  function chart(ag) {
    const runs = ag.runs.slice(-12);
    if (!runs.length) return '<div class="fd-note">First run in progress — exploring.</div>';
    const max = Math.max(...runs.map((r) => r.time), ...runs.map((r) => r.ideal));
    const W = 260, Hh = 64, bw = W / Math.max(runs.length, 6);
    const bars = runs.map((r, i) => { const h = (r.time / max) * (Hh - 12); return `<rect x="${i * bw + 2}" y="${Hh - h}" width="${bw - 4}" height="${h}" rx="2" fill="#${runColor(i, runs.length).getHexString()}"/><text x="${i * bw + bw / 2}" y="${Hh - h - 2}" font-size="8" text-anchor="middle">${(r.time / 60).toFixed(1)}</text>`; }).join('');
    const iy = Hh - (runs[runs.length - 1].ideal / max) * (Hh - 12);
    return `<svg width="${W}" height="${Hh + 12}" viewBox="0 0 ${W} ${Hh + 12}" style="display:block"><line x1="0" x2="${W}" y1="${iy}" y2="${iy}" stroke="#111" stroke-dasharray="3 3"/><text x="${W - 2}" y="${iy - 2}" font-size="8" text-anchor="end">ideal</text>${bars}<text x="0" y="${Hh + 10}" font-size="8">run ${runs[0].n}</text><text x="${W}" y="${Hh + 10}" font-size="8" text-anchor="end">run ${runs[runs.length - 1].n} · minutes</text></svg>`;
  }
  function panelHTML(id) {
    const ag = agents.find((a) => a.id === id);
    if (!ag) return '';
    const r = ag.run;
    const known = [...ag.k.edges.values()];
    const status = ag.state === 'park' ? `🅿 parked at kerb · not blocking` : ag.state === 'stuck' ? '⚠ stuck' : ag.why ? `⏸ ${ag.why}` : ag.searching ? `🔎 looking for ${r.seq[r.idx].place.name}` : `→ ${r.seq[r.idx].label}`;
    const stops = r ? r.seq.map((s, i) => `<span class="${i < r.idx ? 'done' : i === r.idx ? 'now' : ''}">${i < r.idx ? '✓' : i === r.idx ? '●' : '○'} ${esc(s.label)}</span>`).join('<i>→</i>') : '';
    const last = ag.runs[ag.runs.length - 1];
    return `<div class="fd-type" style="background:${ag.main ? '#c88a00' : ag.color}">${ag.main ? '★ MAIN AGENT' : 'AGENT'}</div>
      <h3>${esc(ag.name)} · ${ag.T.icon} ${ag.T.label}</h3>
      <div class="fd-ag-goal">${ag.main ? '🎯 Goal: Ana’s home · Priya’s delivery on the way' : '🎯 2 orders this run'}</div>
      <div class="fd-ag-stops">${stops}</div>
      <div class="fd-ag-status">${status}</div>
      <div class="fd-ag-grid">
        <div><small>Position</small>${esc(whereByLandmark(ag))}</div>
        <div><small>Cone of vision</small>${ag.T.R} m · ${Math.round((2 * ag.T.half) / D2R)}°</div>
        <div><small>Streets known</small>${known.length}/${H.length} · ${known.filter((s) => s.state === 'closed').length} ⛔ · ${known.filter((s) => s.state === 'none').length} ✕</div>
        <div><small>Landmarks</small>${[...ag.k.lm.keys()].map((k) => placeById.get(k)).filter((L) => L && L.cat !== 'home').map((L) => L.icon).join(' ') || '—'}</div>
      </div>
      <h4>LEARNING · TIME PER RUN</h4>${oldVsNew(ag) ? `<div class="fd-ag-time">${oldVsNew(ag)}</div>` : ''}${chart(ag)}
      ${last ? `<div class="fd-note">Run ${last.n}: ${fmtMin(last.time)} · ${Math.round(last.dist)} m · ${last.replans} re-plans · ${Math.round(100 * last.eff)}% of ideal</div>` : ''}
      <h4>RECENT</h4>${ag.log.slice(0, 4).map((l) => `<div class="fd-ev">${esc(l.msg)}</div>`).join('') || '<div class="fd-note">—</div>'}`;
  }

  // ----- main loop hook -----
  let obsCursor = 0;
  function update(dt, dtSim) {
    simT += dtSim;
    const sub = Math.max(1, Math.ceil(dtSim / 0.25));
    for (let k = 0; k < sub; k++) for (const ag of agents) step(ag, dtSim / sub);
    // observations: round-robin, a bounded number per frame
    const n = agents.length;
    for (let i = 0; i < Math.min(n, 12); i++) { const ag = agents[(obsCursor + i) % n]; if (ag.state === 'drive') observe(ag); }
    obsCursor = (obsCursor + 12) % Math.max(1, n);
    for (const ag of agents) {
      ag.g.position.set(ag.pos.x, city.groundAt(ag.pos.x, ag.pos.z) - 0.1, ag.pos.z);
      ag.g.rotation.y = Math.atan2(-ag.head.x, -ag.head.z);
      ag.cone.visible = view.cones || ag.id === focusId;
      ag.cone.position.set(ag.pos.x, city.groundAt(ag.pos.x, ag.pos.z) + 0.45, ag.pos.z);
      ag.cone.rotation.y = Math.atan2(-ag.head.z, ag.head.x);
      ag.fan.material.opacity = ag.id === focusId ? 0.26 : 0.09;
      ag.body.userData.wheels?.forEach((w) => ag.state === 'drive' && !ag.why && (w.rotation.x += dtSim * 3));
    }
    overlayAcc += dt;
    if (overlayDirty || overlayAcc > 1) { overlayAcc = 0; overlayDirty = false; rebuildOverlay(); renderBar(false); }
  }

  makeAgent('KAI', 'Kai', 'Bike', '#c88a00', true);
  setFleet(fleetN);

  return {
    update,
    has: (id) => agents.some((a) => a.id === id),
    pos: (id) => { const a = agents.find((x) => x.id === id); return a && { x: a.pos.x, z: a.pos.z, what: a.name, heading: a.head }; },
    focus(id) { focusId = id && agents.some((a) => a.id === id) ? id : 'KAI'; overlayDirty = true; },
    panelHTML,
    pick(raycaster) {
      const hit = raycaster.intersectObjects(agents.map((a) => a.g), true)[0];
      let o = hit?.object;
      while (o && !o.userData.agentId) o = o.parent;
      return o?.userData.agentId || null;
    },
    moving: () => agents.filter((a) => a.state === 'drive').map((a) => ({ x: a.pos.x, z: a.pos.z })),
    reset() { [...agents].forEach(removeAgent); edgeUse.clear(); makeAgent('KAI', 'Kai', 'Bike', '#c88a00', true); setFleet(fleetN); },
  };
}
