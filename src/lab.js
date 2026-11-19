// Design lab: the user plays environment-designer.
//  - Manual: two variants side by side, pick one, get two new variants of it.
//  - Automated: evolve the layout for N epochs, keeping changes that improve performance.
import { N, PRESETS, mutate, clone } from './env.js';
import { evaluate, rng32 } from './sim.js';
import { paintGround } from './view3d.js';

const $ = s => document.querySelector(s);
const tick = () => new Promise(r => setTimeout(r, 0));
const rand = rng32(Date.now() % 1e6);

function drawPlan(canvas, res) {
  const ctx = canvas.getContext('2d'), px = canvas.width / 100;
  paintGround(ctx, res.env, px);
  let max = 0; for (const v of res.heat) max = Math.max(max, v);
  const s = canvas.width / N;
  for (let c = 0; c < N * N; c++) if (res.heat[c] > 0) {
    ctx.fillStyle = `rgba(220,30,60,${Math.min(0.85, Math.sqrt(res.heat[c] / max))})`;
    ctx.fillRect((c % N) * s, ((c / N) | 0) * s, s, s);
  }
}
const metrics = r => `
  <div><b>${r.commute.toFixed(1)} s</b> avg commuter trip</div>
  <div><b>${r.visits.toFixed(2)}</b> landmarks / tourist</div>
  <div><b>${r.trips}</b> trips completed</div>
  <div class="muted">score ${r.fitness.toFixed(1)} (lower = better)</div>`;

export function initLab({ getCurrent, play }) {
  let current = null, history = [];

  async function compare() {
    $('#pair').innerHTML = '<p class="muted">Simulating two variants…</p>'; await tick();
    const vars = [mutate(current, rand), mutate(current, rand)].map(p => evaluate(p));
    $('#pair').innerHTML = '';
    vars.forEach((r, k) => {
      const card = document.createElement('div'); card.className = 'card';
      card.innerHTML = `<h4>Variant ${'AB'[k]}</h4><canvas width="260" height="260"></canvas>${metrics(r)}
        <button>Choose ${'AB'[k]}</button>`;
      drawPlan(card.querySelector('canvas'), r);
      card.querySelector('button').onclick = () => {
        current = r.params; history.push(r.fitness);
        $('#lab-gen').textContent = `Generation ${history.length}`;
        compare();
      };
      $('#pair').appendChild(card);
    });
  }

  async function evolve() {
    const epochs = +$('#epochs').value, log = $('#evo-log'), chart = $('#evo-chart').getContext('2d');
    let best = evaluate(current); const scores = [best.fitness];
    log.innerHTML = `<div>Epoch 0 · start score ${best.fitness.toFixed(1)}</div>`;
    for (let e = 1; e <= epochs; e++) {
      await tick();
      const cand = evaluate(mutate(best.params, rand));
      const kept = cand.fitness < best.fitness;
      if (kept) best = cand;
      scores.push(best.fitness);
      log.insertAdjacentHTML('afterbegin', `<div>Epoch ${e} · candidate ${cand.fitness.toFixed(1)} ${kept ? '<b>✓ kept</b>' : '✗ rejected'}</div>`);
      // best-so-far chart
      const W = 300, H = 90, lo = Math.min(...scores) - 1, hi = Math.max(...scores) + 1;
      chart.clearRect(0, 0, W, H); chart.strokeStyle = '#e0343a'; chart.lineWidth = 2; chart.beginPath();
      scores.forEach((v, k) => chart.lineTo((k / Math.max(1, epochs)) * W, H - ((v - lo) / (hi - lo)) * H));
      chart.stroke();
      drawPlan($('#evo-best'), best);
      $('#evo-metrics').innerHTML = metrics(best);
    }
    current = best.params;
  }

  $('#open-lab').onclick = () => {
    current = clone(getCurrent()); history = [];
    $('#lab').hidden = false; $('#lab-gen').textContent = 'Generation 0';
    $('#pair').innerHTML = '<p class="muted">Press “New pair” to generate two variants of the layout you are playing.</p>';
  };
  $('#close-lab').onclick = () => ($('#lab').hidden = true);
  $('#new-pair').onclick = compare;
  $('#run-evo').onclick = evolve;
  $('#play-lab').onclick = () => { $('#lab').hidden = true; play(clone(current)); };
  $('#preset').innerHTML = Object.keys(PRESETS).map(k => `<option>${k}</option>`).join('');
}
