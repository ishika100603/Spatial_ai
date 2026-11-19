# Semantic Model — CATAN: The Geography of Competition

**Research question:** How does the spatial arrangement of resources, terrain and connectivity shape agent behavior, competition and settlement patterns?

**Method:** Pick a goal, change the geography, keep the agents the same, and measure the outcome.

## Environment
| Concept | Encoding |
|---|---|
| Type | Abstract game board: a hexagonal island of radius 5 (91 hexes) |
| Terrain | fields (wheat), pasture (sheep), forest (wood), hills (brick), mountains (ore), desert, water |
| Obstacle | **Water**: cannot be crossed |
| Hindrances | **Mountains** (cost 3) and **desert** (cost 4, produces nothing): an agent waits `cost − 1` extra ticks after entering |
| Affordance | **Roads**: a hex crossed 5 or more times becomes a road, and crossing it costs half as much |
| Resources | Each productive hex has a dice number from 2 to 12. Its yield is the dice probability in "pips": `6 − |7 − n|` |
| Dynamic | Two dice are rolled every tick. On a 7 the **robber** blocks the leader's best hex |
| Non‑deterministic | Dice, starting positions and island generation all use a seeded random number generator |
| Partial observability | An agent only sees hexes within its vision radius |
| Multi‑agent | Two agents can't stand on the same hex, and settlements need a gap of at least 2 hexes, as in Catan |

**Generation parameters:** water %, desert %, resource richness (how often a hex gets a high‑yield number such as 5, 6, 8 or 9), terrain clustering (how likely a hex is to copy a neighbour's terrain), and robber on/off.

## Location (two frames of reference)
1. **Global grid:** axial hex coordinates `(q, r)` on the island.
2. **Agent‑relative:** offset `(Δq, Δr)` from the agent's starting hex, its personal origin.

The hover tooltip shows both.

## Distance (three metrics)
1. **Hex steps:** `(|Δq| + |Δr| + |Δq + Δr|) / 2`
2. **Straight line:** Euclidean distance between hex centres, measured in hex‑widths
3. **Travel cost:** weighted shortest path (Dijkstra) over terrain costs, where water can't be crossed and roads are cheaper

## Agents
| Type | Vision | Strategy |
|---|---|---|
| ▲ Explorer | 2 | Keeps scouting the frontier. Commits only to sites worth 13 or more |
| ● Planner | 1 | Plans ahead: walks to the best remembered site *before* it can afford to build, then waits there |
| ■ Rusher | 1 | Settles at the first site worth 3 or more |

All agents:
- **Scan** their vision radius every tick and add what they see to a mental map (`known`).
- Keep **spatial memory, or landmarks**: candidate sites scored using only what they know. A site's score depends on the goal (see below).
- **Plan paths** with Dijkstra over the mental map. Unknown hexes are assumed passable at cost 2, so an agent replans when it discovers water or finds another agent in the way.
- **Re‑plan** when a remembered site turns out to be taken. This is outdated knowledge caused by partial observability.
- Lose patience: while searching, their acceptance threshold slowly drops.
- Trade 4:1 with the bank toward what they are missing.

## Goals and performance (chosen by the user)
| Goal | Site preference | Performance | Win condition |
|---|---|---|---|
| Race to VP | Total pips plus resource variety | Victory points (settlement = 1, city = +1) | VP ≥ target |
| Claim territory | Unclaimed hexes nearby | Number of hexes owned | Hexes ≥ target × 3 |
| Balanced economy | Resources the agent lacks | Amount of its scarcest resource | Every resource ≥ target |

Each run ends when the goal is reached or after 400 ticks.

**Run metrics:**
- Ticks to finish
- Winner and winner type
- **Fairness**: weakest agent's progress divided by the strongest's
- Share of land explored
- Average progress for each agent type

## Designer tools (primary function)
- **Manual:** Worlds A and B run side by side with the same agents and the same random seed, so only the geography differs. *Keep A* or *Keep B* creates two new variations of the chosen world (6 random hex changes each).
- **Hypothesis test:** vary one condition between two values over N random islands and compare the averaged metrics. The tool then writes a one‑sentence conclusion.
- **Auto‑evolve:** for each epoch, the tool mutates the best world so far, evaluates it over 3 simulations against a design objective, and keeps the change if the score is at least as good. The objectives are: fair, fast, hard, or favouring a given agent type.

Not implemented: the secondary function (real‑world data).
