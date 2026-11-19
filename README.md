# CATAN: The Geography of Competition

A spatial simulation built around goals: choose what the agents compete for, change the island, and test how geography decides who wins.

Open `index.html` in a browser. It is a single file with no build step and no dependencies.

## How to use it
1. **Pick a goal:** race to victory points, claim territory, or balanced economy.
2. **Set the conditions:** water, desert, resource richness, clustering, the robber, and how many agents of each type.
3. **Generate two worlds**, then press **Run**. Both worlds use the same agents and the same random seed, so only the geography differs.
   - Hover over a hex to see its locations and distances.
   - Use **View as** to see one agent's memory: its fog of war, landmarks (★) and planned path.
   - Click **Keep A** or **Keep B** to make two variations of the world you prefer.
4. **Test a hypothesis:** vary one condition (for example water 10% → 50%) over N islands and get a comparison table plus a one‑line conclusion.
5. **Auto‑evolve:** choose a design objective (fair, fast, hard, or *Explorers dominate*) and a number of epochs. The tool evolves the island toward that objective.

The model is described in [SEMANTIC_MODEL.md](SEMANTIC_MODEL.md).
