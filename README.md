# Spatial_ai — Neighborhood

A single-page web app (vanilla JavaScript + three.js) that visualises the **Food Delivery semantic model** as a living 3D neighborhood.

## Run

No build step. Serve the folder with any static server and open it in a browser:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

(three.js is loaded from the jsDelivr CDN through an import map, so the page needs internet access.)

## What you see

| Model element | In the scene |
|---|---|
| **UberEats** (service charge, route, delivery time, membership) | Black HQ tower in the centre of the grid |
| **Restaurant** (cuisine type, store type) | Buildings in the inner ring; shape follows store type (food truck, fine dining, fast food, café, ghost kitchen), colour follows cuisine |
| **Delivery Partner** (rating, commute type, tips) | Cars and bikes driving the streets |
| Customers | Houses in the outer ring (gold roof = Uber One) |
| **Partner with** (UberEats → Restaurant) | Green arcs from the HQ to every restaurant |
| **Drives to** (Delivery Partner → Restaurant) | Orange dashed arcs while a partner heads to a pickup |
| Route (Restaurant → Customer) | Glowing green path on the road while an order is on the way |

Small labelled "packets" fly between entities to show which information is sent where.

## Toolbar

- **Actions:** 👤 Create account · 🧾 Receive order · 💳 Receive payment · 💬 Assistant (chatbot)
- **Model:** 🏪 Partner restaurant (adds a *Partner with* relationship) · 🛵 Add partner
- **View:** relationships, labels, auto demo, pause, reset camera

Click any building, vehicle or order to inspect it and edit its attributes (cuisine type, store type, commute type, membership, service charge).

## Rules

1. **Confidentiality of customer details.** A "View as" role switch (Customer / UberEats / Restaurant / Delivery Partner) filters every customer field. Delivery partners get the address, instructions and order number, but not payment details or account history. Card numbers are never stored; only the last 4 digits and a token are kept.
2. **Delivery time.** Every order gets an ETA when it is created. The ETA is recalculated every frame from prep time, the partner's position and the remaining route. A live check in the Rules panel confirms that every active order has an ETA.

## Files

- `index.html`: layout, toolbar and import map
- `styles.css`: UI styling
- `js/model.js`: entity vocabularies and the Rule 1 privacy matrix
- `js/world.js`: three.js scene, meshes, relationship visuals, road routing
- `js/main.js`: state, simulation, actions, panels and chatbot
