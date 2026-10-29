---
title: Food Delivery — Morningside Heights
---

# Food Delivery — Morningside Heights

A 3D semantic model of food delivery set on the real street grid around Columbia University (W 108th–120th St, Riverside Dr to Manhattan Ave).
Drag to orbit, right-drag to pan, scroll to zoom. Click an object to inspect it, or click anywhere on the map to ask *what is here?*

<style>
#fd3d { position: fixed; inset: 0; z-index: 9999; width: 100vw; height: 100vh; overflow: hidden; background: #cfe3f2; font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1d1d1f; }
#fd3d .fd-canvas { position: absolute; inset: 0; }
#fd3d .fd-canvas canvas { display: block; }
#fd3d .fd-card { background: rgba(255,255,255,.95); border-radius: 12px; box-shadow: 0 4px 18px rgba(0,0,0,.14); backdrop-filter: blur(6px); }
#fd3d .fd-left { position: absolute; left: 12px; top: 12px; bottom: 76px; width: 318px; display: flex; flex-direction: column; gap: 10px; z-index: 2; pointer-events: none; }
#fd3d .fd-left > * { pointer-events: auto; }
#fd3d .fd-status { padding: 10px 12px; }
#fd3d .fd-loc { padding: 10px 12px; overflow: auto; min-height: 0; flex: 1 1 auto; }
#fd3d.fd-hide-loc .fd-loc, #fd3d .fd-dist, #fd3d .fd-prox { display: none; }
#fd3d.fd-mode-proximity .fd-left { width: 400px; }
#fd3d.fd-mode-proximity .fd-loc { display: none; }
#fd3d.fd-mode-proximity .fd-prox { display: block; padding: 10px 12px; overflow: auto; min-height: 0; flex: 1 1 auto; }
#fd3d .fd-prox .fd-inline button { margin: 0; }
#fd3d .fd-pbar { position: relative; display: flex; height: 26px; margin: 10px 0 4px; border-radius: 7px; overflow: visible; }
#fd3d .fd-pbar-seg { flex: 1; display: grid; place-items: center; color: #fff; font: 800 10.5px system-ui; letter-spacing: .08em; }
#fd3d .fd-pbar-seg.low { background: #f2c94c; border-radius: 7px 0 0 7px; color: #5a4a00; }
#fd3d .fd-pbar-seg.medium { background: #f2994a; }
#fd3d .fd-pbar-seg.extreme { background: #e8352a; border-radius: 0 7px 7px 0; }
#fd3d .fd-pbar i { position: absolute; top: -5px; bottom: -5px; width: 4px; margin-left: -2px; background: #1d1d1f; border-radius: 2px; box-shadow: 0 0 0 2px #fff; transition: left .25s; }
#fd3d .fd-plevel { font-weight: 800; margin-top: 6px; }
#fd3d .fd-paction { background: #f3f3f1; border-radius: 6px; padding: 5px 8px; margin: 5px 0; font-weight: 600; }
#fd3d .fd-zones { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 11px; color: #444; margin: 4px 0; }
#fd3d .fd-zones span::before { content: ''; display: inline-block; width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--c); margin-right: 4px; vertical-align: -2px; }
#fd3d .fd-perc { display: grid; grid-template-columns: auto 30px 1fr; gap: 2px 8px; font-size: 12px; align-items: baseline; }
#fd3d .fd-perc b { text-align: right; }
#fd3d .fd-perc span { color: #555; }
#fd3d .fd-light { display: inline-block; width: 9px; height: 9px; border-radius: 50%; vertical-align: 0; }
#fd3d .fd-light-green { background: #22c55e; } #fd3d .fd-light-yellow { background: #f5b301; } #fd3d .fd-light-red { background: #ef2b1d; }
#fd3d .fd-slider { display: grid; grid-template-columns: 150px 1fr 40px; align-items: center; gap: 6px; font-size: 12px; margin: 2px 0; }
#fd3d .fd-slider input { width: 100%; margin: 0; padding: 0; accent-color: #1d1d1f; }
#fd3d .fd-slider b { text-align: right; }
#fd3d .fd-rule { font-size: 12px; padding: 5px 7px; margin: 3px 0; border-radius: 6px; background: #f6f6f4; border-left: 3px solid #ddd; }
#fd3d .fd-rule.on { background: #fff1e6; border-left-color: #f2994a; }
#fd3d .fd-rule small { display: block; color: #777; font-size: 10.5px; margin-top: 1px; }
#fd3d .fd-if, #fd3d .fd-then, #fd3d .fd-else { font: 800 10px system-ui; padding: 1px 4px; border-radius: 3px; color: #1d1d1f; }
#fd3d .fd-if { background: #f2c94c; } #fd3d .fd-then { background: #6fcf97; } #fd3d .fd-else { background: #eb5757; color: #fff; }
#fd3d.fd-mode-distance .fd-left { width: 440px; }
#fd3d.fd-mode-distance .fd-loc { display: none; }
#fd3d.fd-mode-distance .fd-dist { display: block; padding: 10px 12px; overflow: auto; min-height: 0; flex: 1 1 auto; }
#fd3d .fd-plan-wrap { border-radius: 8px; overflow: hidden; border: 1px solid #ddd; }
#fd3d .fd-plan { display: block; width: 100%; height: auto; aspect-ratio: 1110 / 1098; cursor: crosshair; }
#fd3d .fd-plan text { font-family: system-ui, sans-serif; }
#fd3d .fd-plan-zone { font-size: 34px; font-weight: 800; fill: rgba(60,50,40,.45); text-anchor: middle; letter-spacing: 2px; }
#fd3d .fd-plan-ave { font-size: 27px; font-weight: 700; fill: #555; text-anchor: end; }
#fd3d .fd-plan-st { font-size: 24px; font-weight: 700; fill: #666; }
#fd3d .fd-plan-mk { font-size: 27px; font-weight: 800; fill: #fff; text-anchor: middle; }
#fd3d .fd-plan-n { font-size: 15px; font-weight: 800; fill: #1d1d1f; text-anchor: middle; }
#fd3d .fd-plan-rider { font-size: 19px; text-anchor: middle; }
#fd3d .fd-legend { display: flex; align-items: center; gap: 8px; margin: 8px 0 4px; font-size: 11px; font-weight: 700; line-height: 1.1; }
#fd3d .fd-legend small { font-weight: 500; color: #666; }
#fd3d .fd-legend span:last-child { text-align: right; }
#fd3d .fd-grad { position: relative; flex: 1; height: 12px; border-radius: 6px; background: linear-gradient(90deg, #d73027, #f46d43, #fee08b, #91cf60, #1a9850); }
#fd3d .fd-grad i { position: absolute; top: -5px; transform: translateX(-50%); width: 20px; height: 20px; border-radius: 50%; background: #1d1d1f; color: #fff; border: 2px solid #fff; font: 800 10px/16px system-ui; text-align: center; font-style: normal; box-sizing: border-box; }
#fd3d .fd-key { display: flex; flex-wrap: wrap; gap: 10px; font-size: 11px; color: #444; margin-bottom: 6px; }
#fd3d .fd-key i { display: inline-grid; place-items: center; width: 16px; height: 16px; font-style: normal; font-size: 9px; font-weight: 800; color: #fff; vertical-align: -3px; margin-right: 2px; }
#fd3d .fd-k-p { background: #1d1d1f; border-radius: 3px; }
#fd3d .fd-k-d { background: #7c3aed; border-radius: 50%; }
#fd3d .fd-k-x { background: #d62d20; border-radius: 50%; }
#fd3d .fd-k-o { width: 18px !important; height: 0 !important; border-top: 3px dashed #777; }
#fd3d .fd-job { border: 1px solid #e3e3e3; border-radius: 10px; padding: 8px 10px; margin: 6px 0; }
#fd3d .fd-job:hover { border-color: #999; background: #fafafa; }
#fd3d .fd-job-head { display: flex; align-items: center; gap: 6px; }
#fd3d .fd-swatch { width: 26px; height: 8px; border-radius: 4px; flex: none; }
#fd3d .fd-job-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin: 6px 0 4px; }
#fd3d .fd-job-grid div { background: #f3f3f1; border-radius: 6px; padding: 4px 6px; }
#fd3d .fd-job-grid small { display: block; font-size: 9.5px; color: #777; text-transform: uppercase; letter-spacing: .04em; }
#fd3d .fd-job-grid b { font-size: 15px; }
#fd3d .fd-mode-row { display: flex; align-items: center; gap: 6px; }
#fd3d .fd-mode-row select { width: auto; margin: 2px 0; padding: 3px 6px; }
#fd3d .fd-modes { display: flex; gap: 6px; font-size: 11.5px; color: #777; }
#fd3d .fd-modes .on { color: #1d1d1f; font-weight: 700; }
#fd3d .fd-detour { background: #fde8e6; color: #9b1c13; border-radius: 6px; padding: 4px 8px; margin-top: 4px; font-size: 12px; }
#fd3d .fd-closure { display: block; font-size: 12px; padding: 3px 0; cursor: pointer; }
#fd3d .fd-closure input { width: auto; margin: 0 4px 0 0; vertical-align: -1px; }
#fd3d .fd-closure span { color: #777; }
#fd3d .fd-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 8px; }
#fd3d .fd-tabs button { margin: 0; text-align: left; font-size: 11px; }
#fd3d .fd-tabs button.on { background: #1d1d1f; color: #fff; border-color: #1d1d1f; }
#fd3d .fd-q-title { font-weight: 700; margin: 2px 0 6px; }
#fd3d select, #fd3d input { width: 100%; box-sizing: border-box; font: inherit; padding: 6px 8px; border: 1px solid #ccc; border-radius: 8px; margin: 3px 0; background: #fff; color: #1d1d1f; }
#fd3d .fd-inline { display: flex; gap: 6px; align-items: center; }
#fd3d .fd-inline select { flex: 1; }
#fd3d form { display: flex; gap: 6px; margin: 4px 0; }
#fd3d form input { flex: 1; margin: 0; }
#fd3d .fd-out { margin-top: 8px; padding-top: 6px; border-top: 1px dashed #ddd; }
#fd3d .fd-loc-line { font-weight: 600; margin: 3px 0; }
#fd3d .fd-loc-sub { color: #555; font-size: 12px; margin: 2px 0; }
#fd3d .fd-time { background: #fff4d6; border-radius: 6px; padding: 4px 8px; margin: 6px 0; }
#fd3d .fd-step { font-size: 12px; color: #333; padding: 1px 0 1px 10px; border-left: 2px solid #2f80ed; margin: 2px 0; }
#fd3d .fd-clock { display: flex; justify-content: space-between; align-items: center; font-weight: 700; font-size: 15px; }
#fd3d .fd-speed { position: absolute; right: 10px; top: 9px; }
#fd3d .fd-status { position: relative; }
#fd3d .fd-speed button { padding: 2px 6px; font-size: 10px; margin: 0 0 0 2px; }
#fd3d .fd-speed button.on { background: #1d1d1f; color: #fff; }
#fd3d .fd-toolbar { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; padding: 7px; z-index: 3; max-width: calc(100vw - 24px); }
#fd3d button { font: 600 11px system-ui, sans-serif; letter-spacing: .03em; border: 1px solid #ccc; background: #fff; color: #1d1d1f; border-radius: 8px; padding: 6px 9px; cursor: pointer; margin: 2px; }
#fd3d button:hover { background: #f1f1f1; }
#fd3d .fd-toolbar button.on { background: #1d1d1f; color: #fff; border-color: #1d1d1f; }
#fd3d .fd-panel { position: absolute; right: 12px; top: 12px; width: 320px; max-height: calc(100% - 100px); overflow: auto; padding: 12px 14px; z-index: 2; }
#fd3d h3 { margin: 6px 0 8px; font-size: 16px; border: 0; padding: 0; }
#fd3d h4 { margin: 12px 0 4px; font-size: 10.5px; letter-spacing: .08em; color: #777; border: 0; padding: 0; }
#fd3d .fd-type { display: inline-block; color: #fff; font: 700 10px system-ui; letter-spacing: .1em; padding: 3px 8px; border-radius: 5px; }
#fd3d .fd-row { display: flex; justify-content: space-between; gap: 10px; padding: 2px 0; border-bottom: 1px dashed #eee; }
#fd3d .fd-row span { color: #666; }
#fd3d .fd-rel { padding: 2px 0; }
#fd3d a[data-go] { cursor: pointer; color: #2f6fd0; text-decoration: none; }
#fd3d a[data-go]:hover { text-decoration: underline; }
#fd3d .fd-chip-ue { background: #06c167; color: #fff; border-radius: 4px; padding: 0 5px; font-size: 10px; }
#fd3d .fd-ok { color: #138a4b; padding: 1px 0; }
#fd3d .fd-locked { color: #b3261e; padding: 1px 0; }
#fd3d .fd-note { color: #555; font-size: 12px; margin: 4px 0; }
#fd3d .fd-eta { margin-top: 8px; background: #111; color: #fff; border-radius: 8px; padding: 8px 10px; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
#fd3d .fd-eta small { display: block; color: #bbb; font-size: 10.5px; }
#fd3d .fd-eta b { font-size: 20px; white-space: nowrap; }
#fd3d .fd-chat { max-height: 170px; overflow: auto; font-size: 12px; }
#fd3d .fd-q { background: #eef4ff; border-radius: 8px; padding: 5px 8px; margin: 4px 0 2px 30px; }
#fd3d .fd-a { background: #eafaf1; border-radius: 8px; padding: 5px 8px; margin: 2px 30px 4px 0; }
#fd3d .fd-chips button { font-weight: 500; padding: 4px 7px; }
#fd3d .fd-toasts { position: absolute; left: 50%; top: 12px; transform: translateX(-50%); display: flex; flex-direction: column; gap: 5px; z-index: 4; align-items: center; pointer-events: none; }
#fd3d .fd-toast { background: rgba(29,29,31,.92); color: #fff; padding: 7px 12px; border-radius: 8px; font-size: 12.5px; max-width: 460px; box-shadow: 0 4px 14px rgba(0,0,0,.2); }
#fd3d .fd-toast.warn { background: #b3261e; }
#fd3d .fd-toast.ok { background: #06a35a; }
#fd3d .fd-compass { position: absolute; right: 344px; bottom: 16px; z-index: 2; background: rgba(255,255,255,.9); border-radius: 50%; width: 46px; height: 46px; display: grid; place-items: center; font-weight: 800; font-size: 11px; box-shadow: 0 2px 10px rgba(0,0,0,.15); }
@media (max-width: 900px) { #fd3d .fd-left { width: 260px; } #fd3d .fd-panel { width: 260px; } #fd3d .fd-compass { display: none; } }
@media (max-width: 640px) { #fd3d .fd-loc { display: none; } #fd3d .fd-panel { left: 12px; width: auto; top: auto; bottom: 80px; max-height: 38%; } #fd3d .fd-left { width: auto; right: 12px; bottom: auto; } }
</style>
<div id="fd3d">
  <div class="fd-canvas"></div>
  <div class="fd-left">
    <div class="fd-status fd-card"></div>
    <div class="fd-loc fd-card">
      <div class="fd-tabs">
        <button data-tab="where" class="on">1 · Where is it?</button>
        <button data-tab="here">2 · What is here?</button>
        <button data-tab="frame">3 · Frame of reference</button>
        <button data-tab="describe">4 · Describe a place</button>
      </div>
      <div class="fd-tabbody"></div>
    </div>
    <div class="fd-dist fd-card"></div>
    <div class="fd-prox fd-card"></div>
  </div>
  <div class="fd-panel fd-card"></div>
  <div class="fd-toasts"></div>
  <div class="fd-compass" title="Manhattan grid north (uptown)">N ↑</div>
  <div class="fd-toolbar fd-card">
    <button data-tool="track">▶ TRACK DELIVERY</button>
    <button data-tool="receiveOrder">RECEIVE ORDER</button>
    <button data-tool="pay">RECEIVE PAYMENT</button>
    <button data-tool="proximity" class="on">PROXIMITY</button>
    <button data-tool="distance">DISTANCE</button>
    <button data-tool="locate">LOCATE</button>
    <button data-tool="assist">ASSISTANCE</button>
    <button data-tool="profile">PROFILE</button>
    <button data-tool="routes" class="on">ROUTES</button>
    <button data-tool="home">OVERVIEW</button>
    <button data-tool="reset">RESET</button>
  </div>
</div>
<script type="importmap">
{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js", "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/" } }
</script>
<script type="module" src="food-delivery-3d.js?v=7"></script>

## What you are looking at

| In the scene | Semantic entity | Where it is |
|---|---|---|
| Rider on a motorbike, a car, a rider on an e-bike | Delivery Partner | Moving on the streets |
| Storefronts with awnings and signs, a food truck | Restaurant | Broadway & Amsterdam Ave storefronts, food truck at Broadway & W 116th |
| Green "Uber Eats" sticker in each partner's window | UberEats (partners with) | A platform — present at its partners |
| Doorways with a person waiting | Customer | W 113th St, W 118th St, Riverside Dr |
| Brown paper bag | Order / parcel | In the kitchen, in a rider's bag, or at the door |

**Location questions** (left panel): 1 · where is a referent (e.g. the parcel)? 2 · what occupies a junction or a clicked spot? 3 · where is an occupant in a chosen frame of reference (street grid, landmark, customer, rider, lat/long)? 4 · turn a description like "the Indian place near the cathedral" into a specific junction.

**Distance** (DISTANCE panel, open by default): a 2D plan of the neighbourhood with three pickups (P1–P3) and three deliveries (D1–D3). Each route follows the streets and avenues and is coloured on a long → short gradient. For each route the metrics give the streets and avenues apart, the road distance against the straight-line distance, the commute mode (switchable: walking, bicycle, bike, car) and the time. **Road closures** (toggle them, or click a street on the plan) force a de-route: the fastest-if-open route is drawn dashed and the extra metres and minutes are shown. Barricades also appear in the 3D streets.

**Proximity** (PROXIMITY panel, open by default): every delivery partner carries boundary rings for extreme, medium and low proximity, sized to its commute type, plus a 30 m sensing range. It perceives the cars, buses, pedestrians, other riders, buildings, traffic lights, street trees and lamps around it, and an intensity bar (low → medium → extreme) floats above it. The rules fire live: it stops when something is inside the extreme zone ahead, slows inside the medium zone, rides with caution inside the low zone, stops at red lights and yields to people crossing. Traffic is part of the simulation, and sliders set how many cars/taxis/buses, scooters & bikes and pedestrians are on the streets (or pick Quiet / Normal / Rush hour): lights cycle, cars keep a following distance and brake for people and riders, and pedestrians wait for the walk signal (a few jaywalk). Vehicles and pedestrians have boundaries too: green clear, amber too close, red danger, blue waiting at a light.

**Time:** each restaurant has a preparation time and each rider a speed for their commute type; routes follow real streets, so the estimated delivery time = preparation + rider to restaurant + ride to customer.

See also the [text version of the semantic model](food-delivery-semantic-model.html).
