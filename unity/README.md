# Ether Mines · Unity client

The game rebuilt in Unity (iPhone, Android, Mac, PC), playing in the **same worlds, with the same
accounts** as the web version: same Supabase project, same `act_*` functions, same game server.

## Open it
1. Unity Hub → **Add** → **Add project from disk** → this `unity/` folder. Unity 6 (6000.0 LTS) recommended.
2. Open any scene (the empty default is fine) and press **Play**. Everything is built from code
   (`Assets/Scripts/Game/Game.cs`): no scene to set up.
3. If Unity asks to enable the new Input System backends, say **Yes** (both input systems are supported).

## Layout
- `Assets/Scripts/Core/` — pure C# (no UnityEngine): the world generator (`WorldGen*.cs`), rules
  (`Rules.cs` + `Resources/rules.json`), chunk meshing (`Mesher.cs`), the loaded world (`ChunkStore.cs`),
  walking physics (`PlayerPhysics.cs`). Ported from the web version and **checked against it**.
- `Assets/Scripts/Game/` — the Unity side: streaming and drawing chunks (`WorldView.cs`), you
  (`PlayerController.cs`), the sky (`Sky.cs`), Supabase (`Supabase.cs`), the servers (`Config.cs`).
- `Assets/Resources/Shaders/` — the clay look (blocks, glass, water, plants, sky), built-in render pipeline.
- `Assets/Resources/Art/` — the web version's own textures, exported by `tools/export-art.mjs`.

## Coordinates
The game logic keeps the web version's coordinates (right-handed, north is -z). Only the view flips z
(Unity is left-handed): `WorldView` mirrors positions and normals and turns triangles around, and the
camera's yaw/pitch are converted in `PlayerController.PlaceCamera`.

## Keeping it in step with the web version
- `rules.js` changed → `node unity/tools/export-rules.mjs` (a test in `tests/unity.test.mjs` checks it).
- `world.js` (the generator, `GEN`) or `src/mesh.js` changed → port the change to `WorldGen*.cs` /
  `Mesher.cs`, then run the parity checks:
  `cd unity/CoreTests && node golden.mjs && node golden-mesh.mjs && dotnet build -c Release && dotnet bin/Release/net8.0/CoreTests.dll`
  (every chunk must match the JavaScript byte for byte, every mesh vertex for vertex).
- Textures changed (`src/game/01-textures.js`) → `node unity/tools/export-art.mjs`.
- Type-check the Unity scripts without the editor: `cd unity/CompileCheck && dotnet build -c Release`
  (and `-p:Legacy=1` for the old Input Manager branch). `UnityStubs.cs` holds the API they use.

## Status
Step 1: explore the world — terrain from the seed, the server's frozen chunks and changed blocks
(read-only), the clay look, the day and night, walking with the web version's physics.
Next: accounts and building (step 2), multiplayer (3), mobs and combat (4), the rest of the game (5),
touch controls and store builds (6).
