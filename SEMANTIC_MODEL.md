# Semantic Model: SHIBUYA, The Anatomy of a Crowd

**Question.** How does the physical layout of an urban intersection shape how a crowd moves through it?

You play one pedestrian crossing a stylised, real-scale model of Shibuya Scramble Crossing. Around you, AI pedestrians with limited perception and memory move toward their own goals. You can also act as the **environment designer**: change the crossing, then compare or evolve layouts and play the result.

## Entities

| Entity | Description |
|---|---|
| **World** | 100 m × 100 m plan on a 2 m grid (50 × 50 cells). x = east, z = south, y = height. |
| **Cell types** | `SIDEWALK`, `ROAD` (never walkable), `CROSS` (zebras + scramble; walkable only on green), `BUILDING` (obstacle), `BARRIER` (guard rail obstacle) |
| **Modifiers** | hindrance zones (speed ×0.5, e.g. Hachiko meeting crowd); affordance zones (speed ×1.35, cleared walkway) |
| **Signal** | all-way pedestrian phase: `green` s walk / `red` s wait (plaza = always open) |
| **Landmarks** | Hachiko statue, Station entrance, 109 corner, QFRONT screen, Scramble Square, Scramble centre |
| **Exits** | 8 sidewalk edges + station entrance |

## Agents

| Agent | Behaviour | Goal | Performance |
|---|---|---|---|
| **Commuter** (blue) | fast (~1.45 m/s), direct routes, strongly avoids remembered crowds | reach a far exit, often making a return trip | trip time (s); first trip vs. return trip |
| **Tourist** (orange) | slow (~0.95 m/s), explores, stops 2–5 s at landmarks | discover and visit landmarks (max 3), then leave | landmarks visited |
| **Player** (red, you) | WASD, may cross on red (penalty) | reach the yellow beacon | round time (+5 s per red-light crossing), bumps |

## Requirement mapping

| Requirement | Implementation (file) |
|---|---|
| Two notions of **location** | grid/world coordinates `(x, z)` and cell id; **relative to the nearest landmark** ("12 m NE of Hachiko statue"); plus lat/lon (`main.js` HUD) |
| Two notions of **distance** | **Euclidean** straight line vs. **walking-path** distance (A* over walkable cells, weighted by hindrance/affordance) shown live for the player |
| **Limited knowledge / scanning** | agents scan every 0.5 s within a 10 m radius (`Sim.scan`). They only learn about barriers, hindrances, crowds and landmarks they have seen. The player sees through 25–75 m of fog. |
| **Spatial memory** | per-agent congestion map (fades over ~120 s) and an obstacle map; tourists keep a set of discovered landmarks and use it to choose later goals. Commuters keep their memory on the return trip, so you can compare first and return trip times. |
| **Goals + performance** | see the agent table above; aggregated in `Sim.summary()` |
| **Planning ahead** | A* over the agent's *known* map (`Sim.plan`). Agents replan when a scan shows an obstacle or a crowd of 4+ on the next 10 cells of their route, or after being stuck. |
| **Obstacles** | buildings and guard rails (yellow), which agents only learn about once they see them |
| **Hindrances / affordances** | orange / green ground zones changing speed and planning cost; crowd density also slows movement |
| **Environment** | physical; partially observable; multi-agent (agents take up space and push apart); **dynamic** (signal, crowd levels by time of day); **non-deterministic** (seeded randomness in speeds, goals and spawns) |
| **Primary function: designer** | `Design lab`: **manual**: two mutated variants side by side, each simulated for 150 s with the same seed, with heatmaps and scores; pick one to spawn two more. **Automated**: evolve for N epochs, keeping a mutation only if the score improves. "Play this design" loads it into 3D. |
| **Secondary function: real place** | real-scale plan in metres, approximate building heights (y), lat/lon anchoring, signal timing and hourly crowd profile (t), "Tokyo now" button uses the live Tokyo clock (`data.js`) |

## Design variables (what the lab mutates)

`cross[N,E,S,W]` zebra depth (2–12 m) · `green` walk time (15–80 s) · `barriers[]` guard rails inside the scramble · `hindrances[]` · `affordances[]` · `plaza` (no vehicles)

**Score** (lower is better) = average commuter trip time − 6 × average landmarks per tourist. Unfinished trips count their elapsed time.

## Preset scenarios

1. **Original Shibuya**: baseline
2. **Wider crossing**: 10 m zebras
3. **Restricted movement**: guard rails split the scramble into lanes
4. **Pedestrian plaza**: no vehicles, the roads become walkable
5. **Asymmetric**: uneven zebras, shorter green, a central obstacle

In a sample run (seed 7, 150 s, 90 people), the plaza scored best (50 s commute) and restricted movement worst (61 s). Return trips were 3–10 s faster than first trips across all presets.

## Data notes

The geometry is **stylised**: footprints, building heights and signal timings are approximations. Verify them before quoting. Crowd volumes are scaled about 1:10 from the JNTO estimate of 1,000–2,500 people per peak crossing. The hourly profile is illustrative.
