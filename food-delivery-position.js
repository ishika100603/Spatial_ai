// Position + Movement: prepositions of place and movement, computed from the simulation
// and shown as visual indicators in the 3D scene, with behaviours they trigger.
//
// Position (where things are relative to each other)
//   IN / ON      parcel IN the kitchen, ON the pickup shelf, IN a rider's bag, AT the door
//   ADJACENT     rider and door with no occupiable location between them  → pickup / delivery
//   BETWEEN      a person or vehicle between a rider and its next turn     → rider yields
//   AMONG        3+ people clustered together → a circle is drawn round them; riders slow inside
//   BEHIND       a rider following a vehicle in its lane
//   (capability) road-closure barricades WARN riders that come adjacent
// Movement (how things move relative to each other)
//   TOWARD / AWAY FROM   a rider's distance to its target falling or rising
//   INTO / OUT OF        parcel into the bag, out of the bag to the customer; riders into / out of crowds
//   PAST                 a rider going past a landmark, restaurant or another rider
//   AROUND               a rider de-routing around a road closure
import * as THREE from 'three';
import { textSprite } from './food-delivery-city.js?v=9';

export const ADJ = { reach: 4, clear: 0.9 }; // adjacent: ≤ 4 m apart and nothing within 0.9 m of the line between
const CLUSTER = { link: 3.5, min: 3 };
const COLORS = { in: '#8a6a2f', adjacent: '#16a34a', between: '#f59e0b', among: '#7c3aed', behind: '#2563eb', warn: '#dc2626', toward: '#16a34a', away: '#dc2626', past: '#0ea5e9', around: '#db2777', into: '#8a6a2f' };

export function createPosition({ scene, city, riders, places, orders, parcelPlace, nameOf, trips, clock, closures }) {
  const group = new THREE.Group();
  scene.add(group);
  const showPos = { value: true };
  const showMov = { value: true };

  // --- reusable indicator pools -------------------------------------------------
  const tags = new Map(); // key -> { sprite, text, used }
  function tag(key, text, color, x, y, z, bg = true) {
    let t = tags.get(key);
    if (!t || t.text !== text || t.color !== color) {
      if (t) group.remove(t.sprite);
      const sprite = textSprite(text, bg ? { color: '#fff', bg: color, size: 0.017 } : { color, bg: null, size: 0.017 });
      group.add(sprite);
      t = { sprite, text, color };
      tags.set(key, t);
    }
    t.sprite.position.set(x, y, z);
    t.sprite.visible = true;
    t.used = true;
  }
  const lineGeo = new THREE.BufferGeometry();
  const MAXL = 160;
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(MAXL * 6), 3));
  lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(MAXL * 6), 3));
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false, depthTest: false, transparent: true }));
  lines.frustumCulled = false;
  lines.renderOrder = 30;
  group.add(lines);
  let li = 0;
  const lc = new THREE.Color();
  function line(a, b, color, y = 1.2) {
    if (li >= MAXL) return;
    const p = lineGeo.attributes.position, c = lineGeo.attributes.color;
    p.setXYZ(li * 2, a.x, y, a.z);
    p.setXYZ(li * 2 + 1, b.x, y, b.z);
    lc.set(color);
    c.setXYZ(li * 2, lc.r, lc.g, lc.b);
    c.setXYZ(li * 2 + 1, lc.r, lc.g, lc.b);
    li++;
  }
  const circlePool = [];
  let ci = 0;
  function circle(x, z, r, color, opacity = 0.9) {
    let m = circlePool[ci];
    if (!m) {
      m = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
      m.renderOrder = 29;
      circlePool.push(m);
      group.add(m);
    }
    m.material.color.set(color);
    m.material.opacity = opacity;
    m.position.set(x, (city.groundAt ? city.groundAt(x, z) : 0) + 0.3, z);
    m.scale.setScalar(r);
    m.visible = true;
    ci++;
  }
  // direction arrows above riders (toward = green, away = red)
  const arrows = new Map();
  function arrow(id, x, z, h, color) {
    let a = arrows.get(id);
    if (!a) {
      a = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.6, 12), new THREE.MeshBasicMaterial({ toneMapped: false }));
      group.add(a);
      arrows.set(id, a);
    }
    a.material.color.set(color);
    a.position.set(x + h.x * 2, 6.4, z + h.z * 2);
    a.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(h.x, 0, h.z).normalize());
    a.visible = true;
  }
  // short-lived pulses marking movement events (INTO / OUT OF / PAST)
  const pulses = [];
  function pulse(x, z, color) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, toneMapped: false }));
    m.position.set(x, 0.5, z);
    m.renderOrder = 29;
    group.add(m);
    pulses.push({ m, age: 0 });
  }

  // --- state ---------------------------------------------------------------------
  const log = [];
  const live = { inOn: [], adjacent: [], between: [], clusters: [], behind: [], warned: [], movement: [] };
  const prevDist = new Map();
  const trend = new Map();
  const prevAlong = new Map();
  const prevContainer = new Map();
  const inCrowd = new Map();
  const adjSince = new Map();
  function event(kind, text, x, z) {
    log.unshift({ t: clock(), kind, text });
    if (log.length > 12) log.pop();
    if (x != null && showMov.value) pulse(x, z, COLORS[kind] || '#555');
  }

  // Adjacent: close enough to touch and no occupiable location between the two.
  function adjacent(a, b, people, vehicles) {
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d > ADJ.reach) return false;
    const L = d || 1;
    const blocked = [...people, ...vehicles].some((o) => {
      const t = ((o.x - a.x) * (b.x - a.x) + (o.z - a.z) * (b.z - a.z)) / (L * L);
      if (t <= 0.05 || t >= 0.95) return false;
      const px = a.x + (b.x - a.x) * t, pz = a.z + (b.z - a.z) * t;
      return Math.hypot(o.x - px, o.z - pz) < ADJ.clear;
    });
    return !blocked;
  }

  function clusterPeople(people) {
    const n = people.length;
    const parent = people.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const cell = new Map();
    const key = (x, z) => `${Math.floor(x / CLUSTER.link)},${Math.floor(z / CLUSTER.link)}`;
    people.forEach((p, i) => { const k = key(p.x, p.z); if (!cell.has(k)) cell.set(k, []); cell.get(k).push(i); });
    people.forEach((p, i) => {
      const cx = Math.floor(p.x / CLUSTER.link), cz = Math.floor(p.z / CLUSTER.link);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        for (const j of cell.get(`${cx + dx},${cz + dz}`) || []) {
          if (j <= i) continue;
          if (Math.hypot(people[j].x - p.x, people[j].z - p.z) < CLUSTER.link) parent[find(i)] = find(j);
        }
      }
    });
    const groups = new Map();
    for (let i = 0; i < n; i++) { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(people[i]); }
    return [...groups.values()].filter((g) => g.length >= CLUSTER.min).map((g) => {
      const x = g.reduce((s, p) => s + p.x, 0) / g.length;
      const z = g.reduce((s, p) => s + p.z, 0) / g.length;
      const r = Math.max(...g.map((p) => Math.hypot(p.x - x, p.z - z))) + 1.6;
      return { x, z, r, n: g.length };
    });
  }

  let timer = 0;
  function update(dt) {
    // animate pulses every frame
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      p.age += dt;
      p.m.scale.setScalar(2 + p.age * 14);
      p.m.material.opacity = Math.max(0, 1 - p.age / 1.4);
      if (p.age > 1.4) { group.remove(p.m); pulses.splice(i, 1); }
    }
    timer += dt;
    if (timer < 0.12) return;
    timer = 0;
    tags.forEach((t) => (t.used = false));
    li = 0;
    ci = 0;
    arrows.forEach((a) => (a.visible = false));
    for (const k of Object.keys(live)) live[k] = [];

    const people = city.occupants.people;
    const vehicles = city.occupants.vehicles;

    // ---- IN / ON : where each parcel is, relative to its container ----
    for (const o of orders()) {
      const p = parcelPlace(o);
      if (!p) continue;
      const prep = o.parcel?.startsWith('DP') ? 'IN' : o.status === 'Ready for Pickup' ? 'ON' : o.status === 'Delivered' ? 'AT' : 'IN';
      const what = o.parcel?.startsWith('DP') ? `${o.parcel}'s bag` : o.status === 'Ready for Pickup' ? 'the pickup shelf' : o.status === 'Delivered' ? `${nameOf(o.customer)}'s door` : 'the kitchen';
      live.inOn.push(`📦 ${o.id} is ${prep} ${what}`);
      if (showPos.value && (o.active || o.status === 'Delivered')) tag(`in-${o.id}`, `${prep} ${what}`, COLORS.in, p.x, (p.y || 1) + 4.6, p.z);
      // INTO / OUT OF events when the container changes
      const prev = prevContainer.get(o.id);
      if (prev && prev !== o.parcel) {
        if (o.parcel?.startsWith('DP')) event('into', `${o.id} went INTO ${o.parcel}'s bag (OUT OF ${nameOf(prev)})`, p.x, p.z);
        else if (prev.startsWith('DP')) event('into', `${o.id} came OUT OF ${prev}'s bag, INTO ${nameOf(o.parcel)}'s hands`, p.x, p.z);
      }
      prevContainer.set(o.id, o.parcel);
    }

    // ---- AMONG : clusters of 3+ people get a circle ----
    const clusters = clusterPeople(people);
    live.clusters = clusters;
    if (showPos.value) {
      for (const c of clusters.slice(0, 30)) {
        circle(c.x, c.z, c.r, COLORS.among, 0.85);
        if (c.n >= 4) tag(`cl-${Math.round(c.x / 6)}-${Math.round(c.z / 6)}`, `AMONG ×${c.n}`, COLORS.among, c.x, 3.4, c.z, false);
      }
    }

    const doors = places();
    for (const dp of riders()) {
      const pos = dp.position, h = dp.heading;
      const trip = trips.get(dp.id);
      const near = city.perceive(pos.x, pos.z, 16, h);
      const ppl = near.people, veh = near.vehicles;

      // ---- ADJACENT : rider ↔ door with nothing occupiable between them ----
      for (const d of doors) {
        if (adjacent(pos, d.at, ppl, veh)) {
          live.adjacent.push(`${dp.id} ↔ ${d.name}`);
          if (!adjSince.has(`${dp.id}|${d.id}`)) adjSince.set(`${dp.id}|${d.id}`, clock.raw());
          if (showPos.value) {
            line(pos, d.at, COLORS.adjacent, 1.0);
            line(pos, d.at, COLORS.adjacent, 1.6);
            tag(`adj-${dp.id}`, `ADJACENT · ${d.name}`, COLORS.adjacent, (pos.x + d.at.x) / 2, 4.2, (pos.z + d.at.z) / 2);
          }
        } else adjSince.delete(`${dp.id}|${d.id}`);
      }

      if (trip) {
        // next turn on the route (the "B" in "A is between rider and B")
        let acc = 0, next = trip.points[trip.points.length - 1];
        for (let i = 1; i < trip.points.length; i++) {
          const a = trip.points[i - 1], b = trip.points[i];
          acc += Math.hypot(b.x - a.x, b.z - a.z);
          if (acc > trip.s + 2) { next = b; break; }
        }
        // ---- BETWEEN : someone/something between the rider and its next turn ----
        const dn = Math.hypot(next.x - pos.x, next.z - pos.z) || 1;
        const ux = (next.x - pos.x) / dn, uz = (next.z - pos.z) / dn;
        const reach = Math.min(dn, 18);
        const between = [...ppl.map((p) => ({ ...p, kind: 'person' })), ...veh.map((v) => ({ ...v, kind: v.kind }))].filter((o) => {
          const along = (o.x - pos.x) * ux + (o.z - pos.z) * uz;
          const lat = Math.abs((o.x - pos.x) * uz - (o.z - pos.z) * ux);
          return along > 1 && along < reach && lat < 1.8;
        });
        if (between.length) {
          const o = between[0];
          live.between.push(`${o.kind} BETWEEN ${dp.id} and its next turn`);
          if (showPos.value) {
            line(pos, o, COLORS.between, 1.3);
            line(o, next, COLORS.between, 1.3);
            tag(`btw-${dp.id}`, `${o.kind} BETWEEN`, COLORS.between, o.x, 3.6, o.z);
          }
        }
        // ---- BEHIND : rider following a vehicle in its lane ----
        const lead = veh.find((v) => {
          const along = (v.x - pos.x) * h.x + (v.z - pos.z) * h.z;
          const lat = Math.abs((v.x - pos.x) * h.z - (v.z - pos.z) * h.x);
          return along > 0 && along < 14 && lat < 2.2;
        });
        if (lead) {
          live.behind.push(`${dp.id} is BEHIND a ${lead.kind} (${lead.d.toFixed(0)} m)`);
          if (showPos.value) tag(`beh-${dp.id}`, `BEHIND ${lead.kind}`, COLORS.behind, pos.x, 2.2, pos.z, false);
        }

        // ---- TOWARD / AWAY FROM the trip target ----
        const target = trip.target;
        const dist = Math.hypot(target.x - pos.x, target.z - pos.z);
        const prev = prevDist.get(dp.id);
        if (prev != null) {
          const dd = dist - prev;
          const tr = trend.get(dp.id) ?? 0;
          trend.set(dp.id, tr * 0.7 + dd * 0.3);
        }
        prevDist.set(dp.id, dist);
        const tr = trend.get(dp.id) ?? -1;
        const moving = Math.abs(tr) > 0.02;
        const toward = tr < 0;
        const label = `${dp.id} ${moving ? (toward ? 'TOWARD' : 'AWAY FROM') : 'stopped near'} ${trip.purpose.replace(/^(driving to|delivering \S+ to) /, '').replace(/ for the lunch rush$/, '')} · ${Math.round(dist)} m`;
        live.movement.push(label + (trip.around ? ` · ↻ going AROUND a closure (+${Math.round(trip.around.extra)} m)` : ''));
        if (showMov.value && moving) arrow(dp.id, pos.x, pos.z, h, toward ? COLORS.toward : COLORS.away);
        if (showMov.value) tag(`mv-${dp.id}`, moving ? (toward ? `→ TOWARD · ${Math.round(dist)} m` : `← AWAY FROM · ${Math.round(dist)} m`) : 'waiting', moving ? (toward ? COLORS.toward : COLORS.away) : '#6b7280', pos.x, 10.8, pos.z);

        // ---- AROUND : de-routing around a closure ----
        if (trip.around && showMov.value) {
          for (const c of trip.around.closures) tag(`ar-${dp.id}-${c.id}`, `↻ ${dp.id} going AROUND (+${Math.round(trip.around.extra)} m)`, COLORS.around, c.x, 9, c.z);
        }
      } else {
        prevDist.delete(dp.id);
        trend.delete(dp.id);
      }

      // ---- PAST : landmarks, restaurants, doors and other riders ----
      if (trip) {
        const objs = [...doors.map((d) => ({ id: d.id, name: d.name, x: d.at.x, z: d.at.z })), ...riders().filter((o) => o.id !== dp.id).map((o) => ({ id: o.id, name: o.id, x: o.position.x, z: o.position.z }))];
        for (const o of objs) {
          const along = (o.x - pos.x) * h.x + (o.z - pos.z) * h.z;
          const lat = Math.abs((o.x - pos.x) * h.z - (o.z - pos.z) * h.x);
          const key = `${dp.id}|${o.id}`;
          const before = prevAlong.get(key);
          trip.passed ??= new Set();
          if (before != null && before > 0 && along <= 0 && lat < 28 && o.id !== trip.targetId && !trip.passed.has(o.id)) {
            trip.passed.add(o.id); // each object counts once per trip
            event('past', `${dp.id} went PAST ${o.name}`, o.x, o.z);
          }
          prevAlong.set(key, along);
        }
      }

      // ---- INTO / OUT OF a crowd ----
      const inside = clusters.some((c) => Math.hypot(c.x - pos.x, c.z - pos.z) < c.r);
      if (inside !== !!inCrowd.get(dp.id) && trip) event('into', `${dp.id} rode ${inside ? 'INTO' : 'OUT OF'} a crowd`, pos.x, pos.z);
      inCrowd.set(dp.id, inside);

      // ---- WARN capability: barricades warn riders that come adjacent ----
      for (const c of closures()) {
        const d = Math.min(Math.hypot(c.a.x - pos.x, c.a.z - pos.z), Math.hypot(c.b.x - pos.x, c.b.z - pos.z));
        if (d < 24) {
          live.warned.push(`Barricade on ${c.label} warned ${dp.id}`);
          if (showPos.value) tag(`warn-${dp.id}`, `⚠ ROAD CLOSED AHEAD`, COLORS.warn, pos.x, 13, pos.z);
        }
      }
    }

    // flush unused indicators
    tags.forEach((t) => { if (!t.used) t.sprite.visible = false; });
    for (let i = ci; i < circlePool.length; i++) circlePool[i].visible = false;
    const pa = lineGeo.attributes.position;
    for (let i = li * 2; i < MAXL * 2; i++) pa.setXYZ(i, 0, -999, 0);
    pa.needsUpdate = lineGeo.attributes.color.needsUpdate = true;
  }

  return {
    update,
    live,
    log,
    showPos,
    showMov,
    isAdjacent(dp, at) {
      const near = city.perceive(dp.position.x, dp.position.z, 8, dp.heading);
      return adjacent(dp.position, at, near.people, near.vehicles);
    },
    inCrowd: (id) => !!inCrowd.get(id),
    event,
  };
}
