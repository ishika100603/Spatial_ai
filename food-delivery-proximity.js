// Proximity: "too close" boundaries around delivery partners, what each one perceives
// around it (traffic, people, buildings, traffic lights, street furniture), how intense the
// proximity is (low / medium / extreme), and the IF-THEN-ELSE rules that change its behaviour.
import * as THREE from 'three';

// Boundary radii (metres) per commute type: inside "extreme" the agent stops, inside
// "medium" it slows, inside "low" it rides with caution. SENSE is how far it can perceive.
export const ZONES = {
  Walking: { extreme: 1, medium: 2.5, low: 5 },
  Bicycle: { extreme: 1.5, medium: 4, low: 8 },
  Bike: { extreme: 2, medium: 5, low: 10 },
  Scooter: { extreme: 2, medium: 5, low: 10 },
  Car: { extreme: 2.5, medium: 6, low: 12 },
};
export const SENSE = 30;
export const LEVEL_COLOR = { clear: '#2ecc71', low: '#f2c94c', medium: '#f2994a', extreme: '#e8352a' };
const ICON = { Walking: '🚶', Bicycle: '🚲', Bike: '🛵', Scooter: '🛴', Car: '🚗' };

// 0 … 1, split into thirds: low [0, ⅓), medium [⅓, ⅔), extreme [⅔, 1].
export function intensityOf(d, z) {
  if (d >= z.low) return 0;
  if (d >= z.medium) return (1 / 3) * ((z.low - d) / (z.low - z.medium));
  if (d >= z.extreme) return 1 / 3 + (1 / 3) * ((z.medium - d) / (z.medium - z.extreme));
  return 2 / 3 + (1 / 3) * ((z.extreme - Math.max(0, d)) / z.extreme);
}
export const levelOf = (d, z) => (d < z.extreme ? 'extreme' : d < z.medium ? 'medium' : d < z.low ? 'low' : 'clear');

function barCanvas(label, intensity, level) {
  const c = document.createElement('canvas');
  c.width = 300;
  c.height = 78;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.94)';
  g.beginPath();
  g.roundRect(0, 0, 300, 78, 14);
  g.fill();
  g.fillStyle = '#1d1d1f';
  g.font = '700 22px system-ui, sans-serif';
  g.fillText(label, 14, 27);
  g.fillStyle = LEVEL_COLOR[level];
  g.textAlign = 'right';
  g.fillText(level.toUpperCase(), 286, 27);
  g.textAlign = 'left';
  const segs = [['#f2c94c', 'LOW'], ['#f2994a', 'MED'], ['#e8352a', 'EXT']];
  segs.forEach(([colr, t], i) => {
    g.fillStyle = colr;
    g.globalAlpha = intensity * 3 > i ? 1 : 0.25;
    g.fillRect(14 + i * 92, 40, 88, 22);
    g.globalAlpha = 1;
    g.fillStyle = '#fff';
    g.font = '800 13px system-ui, sans-serif';
    g.fillText(t, 20 + i * 92, 56);
  });
  const mx = 14 + intensity * 272;
  g.fillStyle = '#1d1d1f';
  g.beginPath();
  g.moveTo(mx - 7, 70); g.lineTo(mx + 7, 70); g.lineTo(mx, 62); g.closePath();
  g.fill();
  return c;
}

export function createProximity({ scene, city, riders, objectOf, panelEl, onFollow, customerDistance }) {
  const state = new Map(); // riderId -> live proximity state
  const visuals = new Map();
  let selected = null;
  let showAll = true;

  function visualFor(dp) {
    if (visuals.has(dp.id)) return visuals.get(dp.id);
    const z = ZONES[dp.commuteType];
    const g = new THREE.Group();
    const discs = {};
    for (const [lvl, color, op] of [['low', 0xf2c94c, 0.1], ['medium', 0xf2994a, 0.14], ['extreme', 0xe8352a, 0.2]]) {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(z[lvl], 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, toneMapped: false }));
      disc.userData.base = op;
      disc.renderOrder = 5;
      const ring = new THREE.Mesh(new THREE.RingGeometry(z[lvl] - 0.12, z[lvl], 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }));
      ring.renderOrder = 6;
      g.add(disc, ring);
      discs[lvl] = disc;
    }
    // sensing range: dashed circle
    const pts = [];
    for (let i = 0; i <= 96; i++) pts.push(new THREE.Vector3(Math.cos((i / 96) * Math.PI * 2) * SENSE, 0, Math.sin((i / 96) * Math.PI * 2) * SENSE));
    const sense = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0x2f80ed, dashSize: 1.6, gapSize: 1.2, transparent: true, opacity: 0.7 }));
    sense.computeLineDistances();
    g.add(sense);
    // lines to perceived objects
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(40 * 6), 3));
    lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(40 * 6), 3));
    const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, toneMapped: false }));
    lines.frustumCulled = false;
    scene.add(lines);
    // floating intensity bar
    const tex = new THREE.CanvasTexture(barCanvas(dp.id, 0, 'clear'));
    tex.colorSpace = THREE.SRGBColorSpace;
    const bar = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: false, toneMapped: false }));
    bar.scale.set(0.034 * (300 / 78), 0.034, 1);
    bar.renderOrder = 25;
    scene.add(g, bar);
    const v = { g, discs, lines, bar, key: '' };
    visuals.set(dp.id, v);
    return v;
  }

  // Sense the surroundings and decide how to behave (the proximity rules).
  function evaluate(dp, moving) {
    const z = ZONES[dp.commuteType];
    const pos = dp.position;
    const h = dp.heading;
    const per = city.perceive(pos.x, pos.z, SENSE, h);
    const others = riders().filter((o) => o.id !== dp.id).map((o) => ({ d: Math.max(0, Math.hypot(o.position.x - pos.x, o.position.z - pos.z) - 1), x: o.position.x, z: o.position.z, id: o.id })).filter((o) => o.d < SENSE);
    const dynamic = [
      ...per.vehicles.map((v) => ({ ...v, type: v.kind === 'cab' ? 'taxi' : v.kind })),
      ...per.people.map((p) => ({ ...p, type: p.inRoad ? 'pedestrian in the road' : 'pedestrian' })),
      ...others.map((o) => ({ ...o, type: `rider ${o.id}` })),
    ].sort((a, b) => a.d - b.d);
    const nearest = dynamic[0] || null;
    const d = nearest ? nearest.d : Infinity;
    const level = levelOf(d, z);
    const intensity = nearest ? intensityOf(d, z) : 0;
    // objects ahead (within ±40° of the heading) matter for braking
    const ahead = dynamic.find((o) => {
      const dx = o.x - pos.x, dz = o.z - pos.z;
      const L = Math.hypot(dx, dz) || 1;
      return (dx * h.x + dz * h.z) / L > 0.76;
    });
    const signal = city.signalAhead(pos.x, pos.z, h, 40);
    let factor = 1;
    let action = moving ? 'Clear — riding at normal speed' : 'Parked / waiting';
    const fired = new Set();
    if (moving) {
      if (signal && signal.state !== 'green' && signal.stop >= -0.5 && signal.stop < 18 && !(signal.state === 'yellow' && signal.stop < 3)) {
        factor = signal.stop < 1.2 ? 0 : Math.max(0.15, signal.stop / 18);
        action = `Stopping for a ${signal.state} light at ${signal.name} (${Math.max(0, signal.stop).toFixed(0)} m)`;
        fired.add('signal');
      }
      if (ahead && ahead.d < z.extreme) {
        factor = 0;
        action = `Stopped — ${ahead.type} ${ahead.d.toFixed(1)} m ahead`;
        fired.add('extreme');
        if (ahead.type.startsWith('pedestrian')) fired.add('yield');
      } else if (ahead && ahead.d < z.medium) {
        factor = Math.min(factor, 0.4);
        if (!fired.has('signal')) action = `Slowing to 40% — ${ahead.type} ${ahead.d.toFixed(1)} m ahead`;
        fired.add('medium');
        if (ahead.type.startsWith('pedestrian')) fired.add('yield');
      } else if (level !== 'clear' && level !== undefined && d < z.low) {
        factor = Math.min(factor, 0.8);
        if (!fired.has('signal')) action = `Caution (80%) — ${nearest.type} ${d.toFixed(1)} m away`;
        fired.add('low');
      }
    }
    const prev = state.get(dp.id);
    // never deadlock: after 6 simulated seconds blocked by a non-signal object, creep forward
    let blocked = factor === 0 && !fired.has('signal') ? (prev?.blocked || 0) : 0;
    const cd = customerDistance(dp);
    if (cd != null && cd < 84) fired.add('privacy');
    const st = { level, intensity, nearest, ahead, signal, per, others, factor, action, fired, blocked, zones: z, customerD: cd };
    state.set(dp.id, st);
    return st;
  }

  function update(dt, dtSim, trips) {
    for (const dp of riders()) {
      const moving = trips.has(dp.id);
      const st = evaluate(dp, moving);
      if (st.factor === 0 && !st.fired.has('signal')) {
        st.blocked = (st.blocked || 0) + dtSim;
        if (st.blocked > 6) { st.factor = 0.25; st.action += ' — edging past'; }
      }
      draw(dp, st, dt);
    }
    if (selected && panelEl.offsetParent) renderPanel();
  }

  let pulse = 0;
  const tmp = new THREE.Color();
  function draw(dp, st, dt) {
    pulse += dt;
    const v = visualFor(dp);
    const obj = objectOf(dp.id);
    const y = (obj ? obj.position.y : 0) + 0.35;
    v.g.position.set(dp.position.x, y, dp.position.z);
    v.g.visible = showAll || selected === dp.id;
    for (const [lvl, disc] of Object.entries(v.discs)) {
      const hot = st.level === lvl;
      disc.material.opacity = disc.userData.base * (hot ? 2.6 + Math.sin(pulse * 8) * 0.8 : 1);
    }
    v.bar.position.set(dp.position.x, y + (dp.commuteType === 'Car' ? 9 : 8.5), dp.position.z);
    v.bar.visible = v.g.visible;
    const key = `${st.level}|${Math.round(st.intensity * 20)}`;
    if (key !== v.key) {
      v.key = key;
      v.bar.material.map.image = barCanvas(`${ICON[dp.commuteType]} ${dp.id}`, st.intensity, st.level);
      v.bar.material.map.needsUpdate = true;
    }
    // perception lines to what is inside the low zone, plus the nearest building and light
    const pos = v.lines.geometry.attributes.position;
    const colr = v.lines.geometry.attributes.color;
    let k = 0;
    const push = (o, color) => {
      if (k >= 40) return;
      pos.setXYZ(k * 2, dp.position.x, y + 1.2, dp.position.z);
      pos.setXYZ(k * 2 + 1, o.x, y + 0.9, o.z);
      tmp.set(color);
      colr.setXYZ(k * 2, tmp.r, tmp.g, tmp.b);
      colr.setXYZ(k * 2 + 1, tmp.r, tmp.g, tmp.b);
      k++;
    };
    if (v.g.visible) {
      const z = st.zones;
      [...st.per.vehicles, ...st.per.people, ...st.others].filter((o) => o.d < z.low).slice(0, 30).forEach((o) => push(o, LEVEL_COLOR[levelOf(o.d, z)]));
      if (st.per.buildings[0]) push(st.per.buildings[0], '#8d6e63');
      if (st.signal) push({ x: st.signal.j.x, z: st.signal.j.z }, st.signal.state === 'green' ? '#22e05a' : st.signal.state === 'yellow' ? '#ffc21a' : '#ff2a1a');
    }
    for (let i = k * 2; i < 80; i++) pos.setXYZ(i, 0, -999, 0);
    pos.needsUpdate = colr.needsUpdate = true;
    v.lines.visible = v.g.visible;
  }

  // --- Panel ------------------------------------------------------------------
  panelEl.innerHTML = `<div class="fd-q-title">Proximity · how close is too close?</div>
    <div class="fd-inline"><select class="fd-prox-agent"></select><button class="fd-prox-follow">Follow</button></div>
    <h4>STREET POPULATION (live simulation)</h4>
    <div class="fd-pop"></div>
    <label class="fd-closure"><input type="checkbox" class="fd-prox-all" checked /> Show boundaries for every agent (vehicles, pedestrians, riders)</label>
    <div class="fd-prox-live"></div>`;
  const popEl = panelEl.querySelector('.fd-pop');
  const pop = city.population();
  popEl.innerHTML = [['cars', '🚗 Cars, taxis & buses'], ['scooters', '🛵 Scooters & bikes'], ['people', '🚶 Pedestrians']].map(([k, label]) =>
    `<label class="fd-slider"><span>${label}</span><input type="range" min="0" max="${pop.max[k]}" step="1" value="${pop[k]}" data-pop="${k}"/><b data-pop-val="${k}">${pop[k]}</b></label>`).join('')
    + `<div class="fd-chips"><button data-preset="0.15">Quiet</button><button data-preset="0.5">Normal</button><button data-preset="1">Rush hour</button></div>`;
  popEl.addEventListener('input', (e) => {
    const k = e.target.dataset.pop;
    if (!k) return;
    city.setPopulation({ [k]: +e.target.value });
    popEl.querySelector(`[data-pop-val="${k}"]`).textContent = e.target.value;
  });
  popEl.addEventListener('click', (e) => {
    const f = e.target.dataset.preset;
    if (!f) return;
    const max = city.population().max;
    const next = { cars: Math.round(max.cars * f), scooters: Math.round(max.scooters * f), people: Math.round(max.people * f) };
    city.setPopulation(next);
    for (const [k, v] of Object.entries(next)) { popEl.querySelector(`[data-pop="${k}"]`).value = v; popEl.querySelector(`[data-pop-val="${k}"]`).textContent = v; }
  });
  const sel = panelEl.querySelector('.fd-prox-agent');
  const live = panelEl.querySelector('.fd-prox-live');
  sel.innerHTML = riders().map((d) => `<option value="${d.id}">${ICON[d.commuteType]} ${d.id} ${d.name} (${d.commuteType})</option>`).join('');
  sel.addEventListener('change', () => { selected = sel.value; renderPanel(true); });
  panelEl.querySelector('.fd-prox-follow').addEventListener('click', () => onFollow(selected));
  panelEl.querySelector('.fd-prox-all').addEventListener('change', (e) => { showAll = e.target.checked; city.setBoundaries(showAll); });

  let last = 0;
  function renderPanel(force = false) {
    const now = performance.now();
    if (!force && (now - last < 300 || live.matches(':hover'))) return;
    last = now;
    const dp = riders().find((d) => d.id === selected);
    const st = state.get(selected);
    if (!dp || !st) return;
    const z = st.zones;
    const near = (list) => (list[0] ? `${list[0].d.toFixed(1)} m` : '—');
    const p = st.per;
    const sig = st.signal;
    const dot = (s) => `<i class="fd-light fd-light-${s}"></i>`;
    const rule = (id, ifT, thenT, elseT, metric) => `<div class="fd-rule ${st.fired.has(id) ? 'on' : ''}"><span class="fd-if">IF</span> ${ifT} <span class="fd-then">THEN</span> ${thenT} <span class="fd-else">ELSE</span> ${elseT}<small>${metric}</small></div>`;
    const stats = city.stats();
    const levels = { clear: 0, low: 0, medium: 0, extreme: 0 };
    for (const s of state.values()) levels[s.level]++;
    live.innerHTML = `
      <div class="fd-pbar"><div class="fd-pbar-seg low">LOW</div><div class="fd-pbar-seg medium">MEDIUM</div><div class="fd-pbar-seg extreme">EXTREME</div><i style="left:${(st.intensity * 100).toFixed(1)}%"></i></div>
      <div class="fd-plevel" style="color:${LEVEL_COLOR[st.level]}">${st.level.toUpperCase()} proximity${st.nearest ? ` · nearest: ${st.nearest.type}, ${st.nearest.d.toFixed(1)} m` : ''}</div>
      <div class="fd-paction">${st.action}</div>
      <div class="fd-zones"><span style="--c:#e8352a">Extreme &lt; ${z.extreme} m</span><span style="--c:#f2994a">Medium &lt; ${z.medium} m</span><span style="--c:#f2c94c">Low &lt; ${z.low} m</span><span style="--c:#2f80ed">Sensing ${SENSE} m</span></div>
      <h4>WHAT ${dp.id} PERCEIVES (within ${SENSE} m)</h4>
      <div class="fd-perc">
        <div>🚗 Cars &amp; taxis</div><b>${p.vehicles.filter((v) => v.kind === 'car' || v.kind === 'cab').length}</b><span>${near(p.vehicles.filter((v) => v.kind === 'car' || v.kind === 'cab'))}</span>
        <div>🛵 Scooters &amp; bikes</div><b>${p.vehicles.filter((v) => v.kind === 'scooter' || v.kind === 'bicycle').length}</b><span>${near(p.vehicles.filter((v) => v.kind === 'scooter' || v.kind === 'bicycle'))}</span>
        <div>🚌 Buses</div><b>${p.vehicles.filter((v) => v.kind === 'bus').length}</b><span>${near(p.vehicles.filter((v) => v.kind === 'bus'))}</span>
        <div>🚶 Pedestrians</div><b>${p.people.length}</b><span>${near(p.people)}${p.people.some((x) => x.inRoad) ? ` · ${p.people.filter((x) => x.inRoad).length} in road` : ''}</span>
        <div>📦 Other delivery riders</div><b>${st.others.length}</b><span>${near(st.others)}</span>
        <div>🏢 Buildings</div><b>${p.buildings.length}</b><span>${p.buildings[0] ? `façade ${p.buildings[0].d.toFixed(1)} m` : '—'}</span>
        <div>🚦 Traffic lights</div><b>${p.signals.length}</b><span>${sig ? `${dot(sig.state)} ahead: ${sig.name}, ${Math.max(0, sig.stop).toFixed(0)} m` : p.signals[0] ? `${p.signals[0].name}` : '—'}</span>
        <div>🌳 Street trees</div><b>${p.trees.length}</b><span>${near(p.trees)}</span>
        <div>💡 Street lamps</div><b>${p.lamps.length}</b><span>${near(p.lamps)}</span>
      </div>
      <h4>RULES (live — highlighted when they fire)</h4>
      ${rule('extreme', `a moving object is &lt; ${z.extreme} m ahead`, 'stop', 'continue', 'Metric: distance to nearest object ahead (m)')}
      ${rule('medium', `a moving object is &lt; ${z.medium} m ahead`, 'slow to 40%', 'keep speed', 'Metric: distance ahead within ±40° of heading (m)')}
      ${rule('low', `anything is &lt; ${z.low} m around`, 'ride with caution (80%)', 'normal speed', 'Metric: distance in any direction (m)')}
      ${rule('signal', 'the light ahead is red or yellow within 18 m', 'stop at the stop line', 'proceed', 'Metric: distance to the stop line (m) + signal state')}
      ${rule('yield', 'a pedestrian is in the crosswalk ahead', 'yield until they are across', 'go', 'Metric: distance to pedestrian in the road (m)')}
      ${rule('privacy', 'the rider is within 1 block (84 m) of the customer', 'reveal apartment & buzzer', 'show the area only', `Metric: distance to the customer's door${st.customerD != null ? ` — now ${Math.round(st.customerD)} m` : ''}`)}
      <h4>WHOLE SIMULATION</h4>
      <div class="fd-perc">
        <div>🚗 Vehicles</div><b>${stats.vehicles}</b><span>${stats.cars} cars/taxis/buses · ${stats.scooters} scooters/bikes · ${stats.stopped} at lights · ${stats.close} too close · ${stats.danger} danger</span>
        <div>🚶 Pedestrians</div><b>${stats.people}</b><span>${stats.crossing} crossing · ${stats.waiting} waiting · ${stats.jaywalking} jaywalking · ${stats.pedsAtRisk} at risk</span>
        <div>🚦 Signals</div><b>${stats.signals}</b><span>70 s cycle, green wave uptown</span>
        <div>🛵 Riders</div><b>${riders().length}</b><span>${levels.extreme} extreme · ${levels.medium} medium · ${levels.low} low · ${levels.clear} clear</span>
      </div>`;
  }

  return {
    update,
    factor: (id) => state.get(id)?.factor ?? 1,
    level: (id) => state.get(id),
    select(id) { selected = id; sel.value = id; renderPanel(true); },
    get selected() { return selected; },
  };
}
