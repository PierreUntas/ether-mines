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
  (`PlayerController.cs`), the sky (`Sky.cs`), Supabase (`Supabase.cs`), the servers (`Config.cs`),
  your account and save (`Session.cs`), mining and placing (`Interaction.cs`), the HUD (`Hud.cs`), playing
  together (`Multiplayer.cs`: the game server in `GameLink.cs`, the database's feed in `Realtime.cs`, both
  over `Socket.cs`; the others' figures in `Avatars.cs`; `Chat.cs`).
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

## Multiplayer
- The game server (`server/`) is reached as the web page is, with the site's origin (`ALLOWED_ORIGINS`)
  and `PROTOCOL` 2 (`GameLink.Protocol`: change it with `server.js` and `net.js`). Until mobs and combat
  are ported, the hello and every position say `nm: 1` (hostile mobs off), so the server's mobs leave a
  Unity player alone.
- The blocks the others change and the chat come from Supabase Realtime (Phoenix protocol, topic
  `world:<world>:unity`, the `blocks`, `chat` and `world_restores` tables), as `net.js` hears them.
- Test without the real servers: `cd server && PORT=8799 AUTH_MODE=test MOB_SIM=0 node src/server.js`,
  and point `GameLink.Url` at `ws://127.0.0.1:8799` (tokens `test:<id>:<name>`).

## Status
1. Explore the world: terrain from the seed, the server's frozen chunks and changed blocks, the clay
   look, the day and night, walking with the web version's physics.
2. Your account (nickname and password, the same as on the web), your save, mining, placing, your bar.
3. Playing together: the others walking and mining, their names, their blocks live, the chat.
Next: mobs and combat (4), the rest of the game (5), touch controls and store builds (6).
