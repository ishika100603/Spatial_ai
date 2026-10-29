// Distance view: a 2D plan of Morningside Heights with three pickup → delivery routes,
// coloured on a long → short gradient, plus metrics (streets / avenues apart, distance,
// commute mode, time) and road closures that force a de-route.
import {
  AVENUES, STREETS, BLOCK, ZONES, EDGES, NODES, CLOSURES, LANDMARKS, SITE,
  streetZ, route, separation, nearestEdge, edgeById,
} from './food-delivery-location.js?v=7';

export const MODES = ['Walking', 'Bicycle', 'Bike', 'Car'];
export const MODE_ICON = { Walking: '🚶', Bicycle: '🚲', Bike: '🛵', Car: '🚗', Scooter: '🛴' };

// Length colour scale: short = green → long = red. The ends follow the current routes
// (shortest → longest, rounded to 100 m) so the comparison between them stays readable.
export const SCALE = { short: 300, long: 1500 };
const STOPS = [[0, [26, 152, 80]], [0.3, [145, 207, 96]], [0.5, [254, 224, 139]], [0.75, [244, 109, 67]], [1, [215, 48, 39]]];
export function lengthColor(len) {
  const t = Math.max(0, Math.min(1, (len - SCALE.short) / (SCALE.long - SCALE.short)));
  for (let i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i][0]) {
      const [t0, c0] = STOPS[i - 1];
      const [t1, c1] = STOPS[i];
      const k = (t - t0) / (t1 - t0);
      const c = c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  return 'rgb(215,48,39)';
}

export const PRESET_CLOSURES = [
  { id: 'broadway@113|broadway@114', reason: 'Water-main repair' },
  { id: 'amsterdam@112|amsterdam@113', reason: 'Street fair' },
  { id: 'broadway@114|broadway@115', reason: 'Crane on site (no way round by road)' },
  { id: 'broadway@113|amsterdam@113', reason: 'Film shoot' },
];

const VIEW = { x0: -235, z0: streetZ(116) - 58, x1: 345, z1: streetZ(111) + 40 };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmtM = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);
const half = (v) => (v % 1 ? `${Math.floor(v) || ''}½` : `${v}`);
const pts = (points) => points.map((p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(' ');

export function createDistancePanel(el, ctx) {
  // ctx: { jobs(), anchorOf(e), byId(id), SPEED, HANDOFF, riders(), onChange(routes) }
  const modes = {}; // job id -> chosen mode
  let hoverJob = null;
  let routes = [];

  el.innerHTML = `
    <div class="fd-q-title">Distance · 3 pickups → 3 deliveries</div>
    <div class="fd-plan-wrap"><svg class="fd-plan" viewBox="${VIEW.x0} ${VIEW.z0} ${VIEW.x1 - VIEW.x0} ${VIEW.z1 - VIEW.z0}" preserveAspectRatio="xMidYMid meet"></svg></div>
    <div class="fd-legend"></div>
    <div class="fd-key"><span><i class="fd-k-p">P</i> pickup</span><span><i class="fd-k-d">D</i> delivery</span><span><i class="fd-k-x">✕</i> road closed</span><span><i class="fd-k-o"></i> fastest if open</span></div>
    <div class="fd-metrics"></div>
    <h4>ROAD CLOSURES</h4>
    <div class="fd-note">Toggle a closure, or click any street segment on the plan to close / reopen it.</div>
    <div class="fd-closures"></div>`;
  const svg = el.querySelector('svg');
  const metricsEl = el.querySelector('.fd-metrics');
  const closuresEl = el.querySelector('.fd-closures');
  const legendEl = el.querySelector('.fd-legend');

  // --- static base map -------------------------------------------------------
  const base = [];
  base.push(`<rect x="${VIEW.x0}" y="${VIEW.z0}" width="${VIEW.x1 - VIEW.x0}" height="${VIEW.z1 - VIEW.z0}" fill="#e9e4da"/>`);
  const zoneFill = { columbia: '#e6c9b8', barnard: '#ecd6c8', cathedral: '#cfe2bd', morningsidePark: '#bfe0ac' };
  for (const z of ZONES) {
    if (!zoneFill[z.id]) continue;
    const z0 = Math.max(z.z0, VIEW.z0), z1 = Math.min(z.z1, VIEW.z1);
    base.push(`<rect x="${z.x0 - 9}" y="${z0 - 9}" width="${z.x1 - z.x0 + 18}" height="${z1 - z0 + 18}" fill="${zoneFill[z.id]}"/>`);
  }
  // roads: every segment of the graph (pedestrian paths dashed)
  for (const e of EDGES) {
    const a = NODES.get(e.a), b = NODES.get(e.b);
    const w = e.kind === 'ped' ? 4 : e.road === 'Broadway' ? 26 : a.x === b.x ? 16 : 10;
    base.push(`<line x1="${a.x}" y1="${a.z}" x2="${b.x}" y2="${b.z}" stroke="#fff" stroke-width="${w}" stroke-linecap="square"${e.kind === 'ped' ? ' stroke-dasharray="10 8"' : ''}/>`);
  }
  base.push(`<line x1="-150" y1="${VIEW.z0}" x2="-150" y2="${VIEW.z1}" stroke="#cfe0bf" stroke-width="4"/>`); // Broadway median
  base.push(`<rect x="${SITE.x0}" y="${SITE.z0}" width="${SITE.x1 - SITE.x0}" height="${SITE.z1 - SITE.z0}" fill="none" stroke="#1d1d1f" stroke-width="2.5" stroke-dasharray="10 6"/>`);
  base.push(`<text x="${SITE.x1 - 4}" y="${SITE.z1 - 6}" class="fd-plan-site">SITE BOUNDARY</text>`);
  // zone and place names
  const zoneLabels = [['COLUMBIA', -16, -120], ['SOUTH LAWN', -16, -96], ['CATHEDRAL', 185, 205], ['MORNINGSIDE PARK', 312, 40, true]];
  for (const [t, x, z, vertical] of zoneLabels) base.push(`<text x="${x}" y="${z}" class="fd-plan-zone" ${vertical ? `transform="rotate(-90 ${x} ${z})"` : ''}>${t}</text>`);
  // avenue names (top) and street numbers (left)
  for (const a of AVENUES) {
    base.push(`<text x="${a.x}" y="${VIEW.z0 + 14}" class="fd-plan-ave">${esc(a.name)}</text>`);
  }
  for (const n of STREETS) base.push(`<text x="${VIEW.x0 + 6}" y="${streetZ(n) - 4}" class="fd-plan-st">W ${n}</text>`);
  for (const l of LANDMARKS.filter((x) => ['butler', 'cathedral', 'station116'].includes(x.id))) {
    base.push(`<circle cx="${l.x}" cy="${l.z}" r="${l.id.startsWith('station') ? 5 : 6}" fill="${l.id.startsWith('station') ? '#ee352e' : '#7d6b5a'}" stroke="#fff" stroke-width="2"/>`);
  }
  base.push(`<g transform="translate(${VIEW.x1 - 26} ${VIEW.z1 - 34})"><circle r="17" fill="#fff" opacity=".9"/><path d="M0 -12 L5 5 L0 1 L-5 5 Z" fill="#1d1d1f"/><text y="14" class="fd-plan-n">N</text></g>`);
  const baseSVG = base.join('');

  // --- closures UI -------------------------------------------------------------
  function renderClosures() {
    const custom = [...CLOSURES.keys()].filter((id) => !PRESET_CLOSURES.some((p) => p.id === id));
    closuresEl.innerHTML = [...PRESET_CLOSURES, ...custom.map((id) => ({ id, reason: CLOSURES.get(id) }))].map((c) => {
      const e = edgeById(c.id);
      return `<label class="fd-closure"><input type="checkbox" data-close="${esc(c.id)}" ${CLOSURES.has(c.id) ? 'checked' : ''}/> ⛔ <b>${esc(e ? e.label : c.id)}</b> <span>· ${esc(c.reason)}</span></label>`;
    }).join('');
  }
  function toggleClosure(id, reason) {
    if (CLOSURES.has(id)) CLOSURES.delete(id);
    else CLOSURES.set(id, reason || PRESET_CLOSURES.find((p) => p.id === id)?.reason || 'Closed (set on the plan)');
    renderClosures();
    refresh(true);
  }
  closuresEl.addEventListener('change', (ev) => {
    const id = ev.target.dataset.close;
    if (id) toggleClosure(id);
  });
  svg.addEventListener('click', (ev) => {
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(ctm.inverse());
    const hit = nearestEdge({ x: p.x, z: p.y });
    if (hit && hit.d < 14 && hit.edge.kind === 'road') toggleClosure(hit.edge.id);
  });

  // --- metrics -----------------------------------------------------------------
  metricsEl.addEventListener('change', (ev) => {
    const id = ev.target.dataset.mode;
    if (id) { modes[id] = ev.target.value; refresh(true); }
  });
  metricsEl.addEventListener('mouseover', (ev) => {
    const r = ev.target.closest('[data-job]');
    const id = r ? r.dataset.job : null;
    if (id !== hoverJob) { hoverJob = id; draw(); }
  });
  metricsEl.addEventListener('mouseleave', () => { hoverJob = null; draw(); });

  function compute() {
    routes = ctx.jobs().map((job, i) => {
      const P = ctx.anchorOf(ctx.byId(job.pickup));
      const D = ctx.anchorOf(ctx.byId(job.delivery));
      const mode = modes[job.id] || job.mode;
      const actual = route(P, D, mode);
      const ideal = route(P, D, mode, { ignoreClosures: true });
      const sep = separation(P, D);
      // no drivable way round: the rider walks the bike through one closed block
      const walkPenalty = actual.throughClosure ? BLOCK / 1.3 / 60 - BLOCK / ctx.SPEED[mode] / 60 : 0;
      const rideMin = actual.length / ctx.SPEED[mode] / 60 + walkPenalty;
      const byMode = Object.fromEntries(MODES.map((m) => [m, route(P, D, m).length / ctx.SPEED[m] / 60 + ctx.HANDOFF[m]]));
      const detour = actual.length - ideal.length;
      const closedOnIdeal = [...CLOSURES.keys()].filter((id) => {
        const e = edgeById(id);
        if (!e) return false;
        const A = NODES.get(e.a), B = NODES.get(e.b);
        return ideal.points.some((p, k) => k > 0 && segOverlap(ideal.points[k - 1], p, A, B));
      });
      return { job, i, P, D, mode, actual, ideal, sep, rideMin, total: rideMin + ctx.HANDOFF[mode], byMode, detour, closedOnIdeal, walkPenalty };
    });
    const lens = routes.map((r) => r.actual.length);
    SCALE.short = Math.floor(Math.min(...lens) / 100) * 100;
    SCALE.long = Math.max(SCALE.short + 300, Math.ceil(Math.max(...lens) / 100) * 100);
    routes.forEach((r) => (r.color = lengthColor(r.actual.length)));
    legendEl.innerHTML = `<span>Long<br><small>${fmtM(SCALE.long)}</small></span><div class="fd-grad">${routes.map((r) => `<i style="left:${(100 * (1 - (r.actual.length - SCALE.short) / (SCALE.long - SCALE.short))).toFixed(1)}%">${r.i + 1}</i>`).join('')}</div><span>Short<br><small>${fmtM(SCALE.short)}</small></span>`;
    return routes;
  }

  function draw() {
    const g = [];
    // closures
    for (const id of CLOSURES.keys()) {
      const e = edgeById(id);
      if (!e) continue;
      const a = NODES.get(e.a), b = NODES.get(e.b);
      g.push(`<line x1="${a.x}" y1="${a.z}" x2="${b.x}" y2="${b.z}" stroke="#d62d20" stroke-width="11" stroke-dasharray="8 5" opacity=".85"/>`);
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      g.push(`<g transform="translate(${mx} ${mz})"><circle r="13" fill="#d62d20" stroke="#fff" stroke-width="3"/><path d="M-5.5 -5.5 L5.5 5.5 M5.5 -5.5 L-5.5 5.5" stroke="#fff" stroke-width="3.5"/></g>`);
    }
    // ideal routes that a closure broke (dashed grey)
    for (const r of routes) if (r.detour > 1) g.push(`<polyline points="${pts(r.ideal.points)}" fill="none" stroke="#444" stroke-width="5" stroke-dasharray="10 7" opacity=".6" stroke-linejoin="round"/>`);
    // actual routes, longest first so short ones sit on top
    for (const r of [...routes].sort((a, b) => b.actual.length - a.actual.length)) {
      const hot = hoverJob === r.job.id;
      const off = (r.i - 1) * 6; // keep overlapping routes visible
      g.push(`<g transform="translate(${off} ${off})" opacity="${hoverJob && !hot ? 0.35 : 1}"><polyline points="${pts(r.actual.points)}" fill="none" stroke="#fff" stroke-width="${hot ? 16 : 12}" stroke-linejoin="round" stroke-linecap="round"/>
        <polyline points="${pts(r.actual.points)}" fill="none" stroke="${r.color}" stroke-width="${hot ? 11 : 8}" stroke-linejoin="round" stroke-linecap="round"/></g>`);
    }
    // live rider positions
    for (const d of ctx.riders()) g.push(`<g transform="translate(${d.position.x} ${d.position.z})"><circle r="9" fill="#2f80ed" stroke="#fff" stroke-width="2.5"/><text y="4" class="fd-plan-rider">${MODE_ICON[d.commuteType]}</text></g>`);
    // pickup (square) and delivery (circle) markers
    for (const r of routes) {
      const n = r.i + 1;
      g.push(`<g transform="translate(${r.P.x} ${r.P.z})"><rect x="-14" y="-14" width="28" height="28" rx="5" fill="#1d1d1f" stroke="#fff" stroke-width="3"/><text y="5.5" class="fd-plan-mk">P${n}</text></g>`);
      g.push(`<g transform="translate(${r.D.x} ${r.D.z})"><circle r="15" fill="#7c3aed" stroke="#fff" stroke-width="3"/><text y="5.5" class="fd-plan-mk">D${n}</text></g>`);
    }
    svg.innerHTML = baseSVG + g.join('');
  }

  function renderMetrics() {
    metricsEl.innerHTML = routes.map((r) => {
      const p = ctx.byId(r.job.pickup), d = ctx.byId(r.job.delivery);
      const options = MODES.map((m) => `<option value="${m}" ${m === r.mode ? 'selected' : ''}>${MODE_ICON[m]} ${m}</option>`).join('');
      const fastest = MODES.reduce((a, b) => (r.byMode[a] <= r.byMode[b] ? a : b));
      const closure = r.actual.throughClosure
        ? `<div class="fd-detour">⛔ No way round by road inside the site — the rider walks the ${r.mode === 'Car' ? 'last block on foot' : 'bike'} through ${r.closedOnIdeal.map((id) => esc(edgeById(id).label)).join(', ')}: <b>+${Math.max(1, Math.round(r.walkPenalty))} min</b></div>`
        : r.detour > 1
        ? `<div class="fd-detour">⛔ De-routed around ${r.closedOnIdeal.map((id) => esc(edgeById(id).label)).join(', ') || 'a closure'}: <b>+${fmtM(r.detour)}</b> · <b>+${Math.max(1, Math.round(r.detour / ctx.SPEED[r.mode] / 60))} min</b></div>`
        : r.closedOnIdeal.length ? `<div class="fd-note">A closure sits on the usual route but an equally short street is open — no extra distance.</div>` : '<div class="fd-ok">✓ Fastest route is open</div>';
      return `<div class="fd-job" data-job="${r.job.id}">
        <div class="fd-job-head"><span class="fd-swatch" style="background:${r.color}"></span><b>P${r.i + 1} ${esc(p.name)} → D${r.i + 1} ${esc(d.name)}</b></div>
        <div class="fd-job-grid">
          <div><small>Streets away</small><b>${half(r.sep.streets)}</b></div>
          <div><small>Avenues away</small><b>${r.sep.avenues}</b></div>
          <div><small>Distance</small><b>${fmtM(r.actual.length)}</b></div>
          <div><small>Time</small><b>${Math.round(r.total)} min</b></div>
        </div>
        <div class="fd-loc-sub">${r.sep.avenues ? `crosses ${esc(r.sep.avenueNames.join(', '))} · ` : ''}${fmtM(r.sep.straight)} as the crow flies · route is ${(r.actual.length / Math.max(1, r.sep.straight)).toFixed(2)}× longer</div>
        <div class="fd-mode-row"><select data-mode="${r.job.id}">${options}</select>
          <span class="fd-modes">${MODES.map((m) => `<span class="${m === r.mode ? 'on' : ''}" title="${m}">${MODE_ICON[m]} ${Math.round(r.byMode[m])}′</span>`).join('')}</span></div>
        <div class="fd-loc-sub">${Math.round(r.rideMin)} min ride + ${ctx.HANDOFF[r.mode]} min hand-off by ${r.mode.toLowerCase()} · fastest mode here: ${MODE_ICON[fastest]} ${fastest}</div>
        ${closure}
      </div>`;
    }).join('');
  }

  function refresh(changed = false) {
    if (changed) renderClosures();
    compute();
    draw();
    if (!metricsEl.matches(':hover') || changed) renderMetrics();
    if (changed) ctx.onChange(routes);
  }

  renderClosures();
  refresh(true);
  return { refresh, routes: () => routes, toggleClosure };
}

// Does segment p–q run along road segment A–B?
function segOverlap(p, q, A, B) {
  const onLine = (pt) => Math.abs((B.x - A.x) * (pt.z - A.z) - (B.z - A.z) * (pt.x - A.x)) < 1e-3 * Math.hypot(B.x - A.x, B.z - A.z) + 2;
  if (!onLine(p) || !onLine(q)) return false;
  const lo = (k) => Math.min(A[k], B[k]), hi = (k) => Math.max(A[k], B[k]);
  const k = Math.abs(B.x - A.x) > Math.abs(B.z - A.z) ? 'x' : 'z';
  return Math.min(p[k], q[k]) < hi(k) - 1 && Math.max(p[k], q[k]) > lo(k) + 1;
}

void BLOCK;
