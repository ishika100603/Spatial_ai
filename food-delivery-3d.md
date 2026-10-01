---
title: Food Delivery — 3D Semantic Model
---

# Food Delivery — 3D Semantic Model

An interactive 3D view of the semantic model: **Delivery Partner → drives to → Restaurant ← partners with ← UberEats**.
Drag to orbit, right-drag to pan, scroll to zoom, and click any object to inspect it.

<style>
#fd3d { position: relative; width: 96vw; margin-left: calc(50% - 48vw); height: 82vh; min-height: 560px; border-radius: 14px; overflow: hidden; border: 1px solid #ddd; font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #222; }
#fd3d .fd-canvas { position: absolute; inset: 0; }
#fd3d .fd-canvas canvas { display: block; }
#fd3d .fd-toolbar { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); display: flex; flex-wrap: wrap; gap: 6px; padding: 8px; background: rgba(255,255,255,.95); border-radius: 12px; box-shadow: 0 4px 18px rgba(0,0,0,.12); z-index: 2; }
#fd3d button { font: 600 12px system-ui, sans-serif; letter-spacing: .03em; border: 1px solid #ccc; background: #fff; color: #222; border-radius: 8px; padding: 7px 10px; cursor: pointer; margin: 2px; }
#fd3d button:hover { background: #f1f1f1; }
#fd3d .fd-toolbar button.on { background: #222; color: #fff; border-color: #222; }
#fd3d .fd-panel { position: absolute; right: 14px; top: 14px; width: 300px; max-height: calc(100% - 100px); overflow: auto; background: rgba(255,255,255,.96); border-radius: 12px; padding: 14px; box-shadow: 0 4px 18px rgba(0,0,0,.12); z-index: 2; }
#fd3d .fd-status { position: absolute; left: 14px; top: 14px; width: 210px; background: rgba(255,255,255,.96); border-radius: 12px; padding: 12px 14px; box-shadow: 0 4px 18px rgba(0,0,0,.12); z-index: 2; }
#fd3d h3 { margin: 6px 0 8px; font-size: 17px; border: 0; padding: 0; }
#fd3d h4 { margin: 12px 0 4px; font-size: 11px; letter-spacing: .08em; color: #777; border: 0; padding: 0; }
#fd3d .fd-type { display: inline-block; color: #fff; font: 700 10px system-ui; letter-spacing: .1em; padding: 3px 8px; border-radius: 5px; }
#fd3d .fd-row { display: flex; justify-content: space-between; gap: 10px; padding: 3px 0; border-bottom: 1px dashed #eee; }
#fd3d .fd-row span { color: #666; }
#fd3d .fd-rel { padding: 2px 0; }
#fd3d .fd-rel a { cursor: pointer; color: #2f80ed; }
#fd3d .fd-ok { color: #138a4b; padding: 2px 0; }
#fd3d .fd-locked { color: #b3261e; padding: 2px 0; }
#fd3d .fd-note { color: #666; font-size: 12px; margin: 4px 0; }
#fd3d .fd-eta { margin-top: 8px; background: #111; color: #fff; border-radius: 8px; padding: 8px 10px; display: flex; justify-content: space-between; align-items: baseline; }
#fd3d .fd-eta b { font-size: 20px; }
#fd3d .fd-chat { max-height: 160px; overflow: auto; font-size: 12px; }
#fd3d .fd-q { background: #eef4ff; border-radius: 8px; padding: 5px 8px; margin: 4px 0 2px 30px; }
#fd3d .fd-a { background: #eafaf1; border-radius: 8px; padding: 5px 8px; margin: 2px 30px 4px 0; }
#fd3d .fd-chips button { font-weight: 500; padding: 4px 8px; }
#fd3d .fd-toasts { position: absolute; left: 14px; bottom: 80px; display: flex; flex-direction: column; gap: 6px; z-index: 3; }
#fd3d .fd-toast { background: #222; color: #fff; padding: 8px 12px; border-radius: 8px; font-size: 13px; max-width: 340px; box-shadow: 0 4px 14px rgba(0,0,0,.2); }
#fd3d .fd-toast.warn { background: #b3261e; }
#fd3d .fd-toast.ok { background: #06a35a; }
@media (max-width: 760px) { #fd3d .fd-status { display: none; } #fd3d .fd-panel { width: auto; left: 14px; max-height: 40%; } }
</style>
<div id="fd3d">
  <div class="fd-canvas"></div>
  <div class="fd-status"></div>
  <div class="fd-panel"></div>
  <div class="fd-toasts"></div>
  <div class="fd-toolbar">
    <button data-tool="track">▶ TRACK DELIVERY</button>
    <button data-tool="receiveOrder">RECEIVE ORDER</button>
    <button data-tool="pay">RECEIVE PAYMENT</button>
    <button data-tool="assist">ASSISTANCE</button>
    <button data-tool="profile">PROFILE</button>
    <button data-tool="rels" class="on">SHOW RELATIONSHIPS</button>
    <button data-tool="reset">RESET</button>
  </div>
</div>
<script type="importmap">
{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js", "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/" } }
</script>
<script type="module" src="food-delivery-3d.js"></script>

## What you are looking at

| Object in the scene         | Semantic entity  | Attributes shown on click                          |
|-----------------------------|------------------|----------------------------------------------------|
| Blue riders (left)          | Delivery Partner | Rating, commute type, vehicle, tips                |
| Orange shops (centre)       | Restaurant       | Cuisine type, store type                           |
| Green hub (right)           | UberEats         | Service charge, route, delivery time, membership   |
| Purple house (bottom)       | Customer         | Private profile vs. shareable delivery info        |
| Brown package               | Order O01        | Status, items, payment, estimated delivery time    |

**Surroundings (decorative):** a realistic sky with sun and drifting clouds, rolling grassy hills, a forest of pine, oak, birch and autumn trees, a lake with ripples, lily pads, reeds, a jetty, ducks and jumping fish, plus animals — cows, sheep and horses in a fenced meadow, deer by the woods, dogs and a cat on walks, hopping rabbits, flying birds and butterflies.

**Relationships:** blue arrows are *drives to*, green arrows are *partners with*, the dashed purple line is the delivery *route*.

**Rules:**

- *Confidentiality*: click a delivery partner to see which customer details it can see (✓) and which stay hidden (🔒). The assistant also refuses to share protected details.
- *Delivery time*: the estimated delivery time in the status box counts down as the order progresses.

**Actions:** use the toolbar to receive payment, receive orders, ask the assistant, create a profile, and track the delivery from start to finish.

See also the [text version of the semantic model](food-delivery-semantic-model.html).
