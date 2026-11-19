# SHIBUYA: The Anatomy of a Crowd

A playable 3D agent-based simulation of Shibuya Scramble Crossing (Spatial AI, Columbia GSAPP, Fall 2026).
You walk through the crossing as one pedestrian among commuters and tourists, then redesign the intersection in the **Design lab**.

See [SEMANTIC_MODEL.md](SEMANTIC_MODEL.md) for the model and how it meets the brief.

## Run

No build step. Serve the folder and open it in a browser:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. To publish it, enable **GitHub Pages** for this repository (Settings → Pages → deploy from branch, root).

## Controls

WASD to walk, Shift to run, drag to look, mouse wheel to zoom, **V** for the overhead view.
Reach the yellow beacon; crossing on red costs 5 s.

## Files

- `src/data.js`: real-world reference data (dimensions, heights, landmarks, signal, hourly profile)
- `src/env.js`: grid environment, presets, mutation, A*
- `src/sim.js`: agents (scan, memory, planning) and headless evaluation
- `src/view3d.js`: three.js scene
- `src/lab.js`: design lab (side-by-side variants + evolution)
- `src/main.js`: game loop, input, HUD
