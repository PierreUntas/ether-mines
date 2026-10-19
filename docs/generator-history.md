# Generator history (`GEN` in `supabase/functions/_shared/world.js`)

Bump `GEN` on every terrain change. Already-frozen chunks never move: only chunks no player has touched get the new terrain.

- **2**: mushrooms...
- **3**: palms, amethysts
- **4**: atrium, temples, gardens
- **5**: the City
- **6**: the City in halls
- **8**: the shelter, room to eat and sleep
- **9**: bigger shelter with the 2-block bed
- **10**: fixed shelter clipped by the City radius, real door
- **11**: the workshop, a working OR-gate latch example
- **12**: new seed; the Circuits Complex, its own standalone landmark with 5 separate rooms, replaces the in-City workshop
- **13**: towers, guarded by mobs with a boss at the top
- **14**: towers were far too sparse (8.5% of eligible regions, nearest ~264m from spawn) — loosened the height ceiling, flatness tolerance, and dropped the dunes exclusion, purely additive
- **15**: towers enlarged (7x7/4-tall -> 9x9/5-tall, too cramped to fight in)
- **16**: towers enlarged again (9x9/5-tall -> 13x13/6-tall), more wardens per floor
- **17**: towers re-skinned futuristic — polished granite + cyan-neon trim, holo-screen windows, neon floor grid
- **18**: towers' entrance gap replaced with a real closed door
- **19**: a treasure chest on the boss's platform
- **20**: the validators' path graded flat (several iterations)
- **21**: the Atrium/City/Circuits plateaus fall off into the natural terrain over a much wider band, so the edge of their flat ground doesn't land on a steep bit of the mountain noise
- **22**: towers re-skinned again — marble-column corners and granite/marble banding like the City's own facades, crowned with a faceted Ether Diamond spire instead of a flat roof, so they read as Ethereum landmarks instead of generic sci-fi bunkers
- **23**: towers rebuilt as an octagonal validator beacon, the Ether diamond on each face, an open loggia around the boss, the door on the north side
- **24**: the Merge Sanctum — a floating arena split between a proof-of-work forge and a proof-of-stake crystal half, a two-tone diamond above its center, reached by the Beacon Stair (one per 192x192 region, `mergeAt()`)
- **25**: the Circuits Complex's coin-flip room: its circuit moved two rows back, so its lamp no longer blocks the cell just inside the door
- **26**: the Mempool — an open-air colosseum (one per 224x224 region, `arenaAt()`): a wide flat fighting floor, six tiers of stands in the four quarters' colors, an arcaded facade, four gates whose approaches step down or up to the ground, pending transactions floating overhead; the Front-Runner boss waits at its center
- **27**: more room to fight: towers grow to 21x21 (same octagon, floors and height, a foundation down to the ground on slopes, the ladder and the treasure chest moved out to the new corners) and the Merge Sanctum's disc to a radius of 18 (twelve columns, a second accent ring, the twins 9 blocks from the center); a few towers too close to a ruin, gardens too close to a tower and sanctums whose stair would land on a tower are gone
