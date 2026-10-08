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
#fd3d.fd-hide-loc .fd-loc { display: none; }
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
  </div>
  <div class="fd-panel fd-card"></div>
  <div class="fd-toasts"></div>
  <div class="fd-compass" title="Manhattan grid north (uptown)">N ↑</div>
  <div class="fd-toolbar fd-card">
    <button data-tool="track">▶ TRACK DELIVERY</button>
    <button data-tool="receiveOrder">RECEIVE ORDER</button>
    <button data-tool="pay">RECEIVE PAYMENT</button>
    <button data-tool="locate" class="on">LOCATE</button>
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
<script type="module" src="food-delivery-3d.js?v=5"></script>

## What you are looking at

| In the scene | Semantic entity | Where it is |
|---|---|---|
| Rider on a motorbike, a car, a rider on an e-bike | Delivery Partner | Moving on the streets |
| Storefronts with awnings and signs, a food truck | Restaurant | Broadway & Amsterdam Ave storefronts, food truck at Broadway & W 116th |
| Green "Uber Eats" sticker in each partner's window | UberEats (partners with) | A platform — present at its partners |
| Doorways with a person waiting | Customer | W 113th St, W 118th St, Riverside Dr |
| Brown paper bag | Order / parcel | In the kitchen, in a rider's bag, or at the door |

**Location questions** (left panel): 1 · where is a referent (e.g. the parcel)? 2 · what occupies a junction or a clicked spot? 3 · where is an occupant in a chosen frame of reference (street grid, landmark, customer, rider, lat/long)? 4 · turn a description like "the Indian place near the cathedral" into a specific junction.

**Time:** each restaurant has a preparation time and each rider a speed for their commute type; routes follow real streets, so the estimated delivery time = preparation + rider to restaurant + ride to customer.

See also the [text version of the semantic model](food-delivery-semantic-model.html).
