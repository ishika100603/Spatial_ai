// Game loop: you are a pedestrian in Shibuya. Reach the yellow beacon, avoid crossing on red.
import { PRESETS, clone, cellOf } from './env.js';
import { Sim } from './sim.js';
import { View3D } from './view3d.js';
import { initLab } from './lab.js';
import { SHIBUYA } from './data.js';

const $ = s => document.querySelector(s);
const view = new View3D($('#scene'));
let sim, params, hour = 18;

function load(p) {
  params = p;
  sim = new Sim(p, { seed: Date.now() % 1e6, maxPop: 160, hour });
  sim.addPlayer();
  view.build(sim.env);
  toast('New layout loaded – reach the yellow beacon');
}
load(clone(PRESETS['Original Shibuya']));
initLab({ getCurrent: () => params, play: load });

$('#preset').onchange = e => load(clone(PRESETS[e.target.value]));
$('#hour').oninput = e => { hour = +e.target.value; sim.hour = hour; };
$('#tokyo-now').onclick = () => {
  hour = +new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Tokyo' }).format(new Date());
  $('#hour').value = hour; sim.hour = hour; toast(`Tokyo time is ${hour}:00 – crowd level set`);
};

// ---- input ----
const keys = new Set();
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  keys.add(e.code);
  if (e.code === 'KeyV') view.overview = !view.overview;
});
addEventListener('keyup', e => keys.delete(e.code));
function input() {
  let f = 0, r = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) f++;
  if (keys.has('KeyS') || keys.has('ArrowDown')) f--;
  if (keys.has('KeyD') || keys.has('ArrowRight')) r++;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) r--;
  const y = view.yaw, x = -Math.sin(y) * f + Math.cos(y) * r, z = -Math.cos(y) * f - Math.sin(y) * r;
  const l = Math.hypot(x, z) || 1;
  return { x: x / l, z: z / l, run: keys.has('ShiftLeft') || keys.has('ShiftRight') };
}

// ---- HUD ----
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), 3500);
}
const compass = (dx, dz) => ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'][Math.round(((Math.atan2(dz, dx) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 4)) % 8];
function relativeTo(p) {
  const L = SHIBUYA.landmarks.reduce((b, l) => (Math.hypot(l.x - p.x, l.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) ? l : b));
  const d = Math.hypot(p.x - L.x, p.z - L.z);
  return d < 2 ? `at ${L.name}` : `${d.toFixed(0)} m ${compass(p.x - L.x, p.z - L.z)} of ${L.name}`;
}
function latLon(p) {
  const { lat, lon } = SHIBUYA.centre;
  return `${(lat - (p.z - 50) / 111320).toFixed(5)}, ${(lon + (p.x - 50) / (111320 * Math.cos((lat * Math.PI) / 180))).toFixed(5)}`;
}
function hud() {
  const p = sim.player, r = p.round, s = sim.summary();
  const euclid = Math.hypot(p.goal.x - p.x, p.goal.z - p.z), path = sim.pathDistance(p, p.goal);
  $('#signal').className = sim.green ? 'go' : 'stop';
  $('#signal').textContent = sim.env.params.plaza ? 'PLAZA · always open' : `${sim.green ? 'WALK' : 'WAIT'} · ${sim.signalLeft.toFixed(0)} s`;
  $('#player').innerHTML = `
    <div class="goal">Goal: <b>${p.goal.name}</b></div>
    <div>Straight-line distance <b>${euclid.toFixed(0)} m</b></div>
    <div>Walking-path distance <b>${path === Infinity ? '—' : path.toFixed(0) + ' m'}</b></div>
    <hr><div>Grid position <b>(${p.x.toFixed(0)}, ${p.z.toFixed(0)}) m</b> · cell ${cellOf(p.x, p.z)}</div>
    <div>Relative <b>${relativeTo(p)}</b></div>
    <div class="muted">${latLon(p)}</div>
    <hr><div>Round time <b>${(sim.t - r.start + r.penalty).toFixed(1)} s</b> · rounds ${r.n}</div>
    <div>Best ${r.best == null ? '—' : r.best.toFixed(1) + ' s'} · red-light crossings ${r.jaywalks} · bumps ${r.bumps}</div>`;
  const nC = sim.agents.filter(a => a.kind === 'commuter').length, nT = sim.agents.filter(a => a.kind === 'tourist').length;
  $('#crowd').innerHTML = `
    <div><span class="dot" style="background:#3d7be0"></span>Commuters ${nC} · avg trip <b>${s.commute.toFixed(1)} s</b></div>
    <div class="muted">first trip ${s.firstTrip.toFixed(1)} s → return trip ${s.repeatTrip.toFixed(1)} s (with memory)</div>
    <div><span class="dot" style="background:#f0a030"></span>Tourists ${nT} · <b>${s.visits.toFixed(2)}</b> landmarks each</div>
    <div class="muted">Hour ${hour}:00 · ${sim.agents.length - 1} people</div>`;
}

// ---- loop ----
let last = performance.now(), hudT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if ($('#lab').hidden) {
    sim.step(dt, input());
    for (const e of sim.events.splice(0)) toast(e);
    if ((hudT -= dt) <= 0) { hudT = 0.25; hud(); }
  }
  view.render(sim);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
