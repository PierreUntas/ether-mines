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
  over `Socket.cs`; the others' figures in `Avatars.cs`; `Chat.cs`), the mobs (`Mobs.cs`, models from
  `Resources/mobs.json`) and fighting them (`Combat.cs`), what you hold (`Hand.cs` in first person,
  `HeldModels.cs`: the items' clay models from `Resources/held.json`, blocks meshed by `Mesher`), the
  touch controls (`TouchPad.cs`).
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
  `cd unity/CoreTests && node golden.mjs && node golden-mesh.mjs && node golden-circuits.mjs && dotnet build -c Release && dotnet bin/Release/net8.0/CoreTests.dll`
  (every chunk must match the JavaScript byte for byte, every mesh vertex for vertex).
- The circuits (`src/game/12-circuits.js`) changed → port the change to `Core/Circuits.cs` and run the
  parity checks above (`golden-circuits.mjs` runs the web's own file on test circuits).
- Textures changed (`src/game/01-textures.js`) → `node unity/tools/export-art.mjs`.
- A mob's model (`buildMob` in `src/game/16-mobs.js`) or stats (`MK` in `src/mobs-core.js`) changed →
  `node unity/tools/export-mobs.mjs` (a test checks it).
- A held item's model (`clayModel` in `src/game/04-render.js`) changed, or an item added →
  `node unity/tools/export-held.mjs` (opens the game in a headless browser: Playwright, as for
  `tests/navigateur.mjs`).
- The animals or villagers (`src/game/09-animals.js`) changed → `node unity/tools/export-animals.mjs` (a test checks it).
- A look (`src/game/17-looks.js`) changed, or a cosmetic added → `node unity/tools/export-looks.mjs` (the same way).
- Type-check the Unity scripts without the editor: `cd unity/CompileCheck && dotnet build -c Release`
  (and `-p:Legacy=1` for the old Input Manager branch). `UnityStubs.cs` holds the API they use.

## Multiplayer
- The game server (`server/`) is reached as the web page is, with the site's origin (`ALLOWED_ORIGINS`)
  and `PROTOCOL` 2 (`GameLink.Protocol`: change it with `server.js` and `net.js`).
- The mobs run on the game server: the client draws what it says (`ms`), sends its blows (`mob`, `hit`,
  `shot`, `guard`) and shows what the server settled (`mob`, `hurt`, `hp`, `loot`, `mshot`). Without the
  game server there are no mobs in the Unity client (the web version then runs them on each screen).
- The blocks the others change and the chat come from Supabase Realtime (Phoenix protocol, topic
  `world:<world>:unity`, the `blocks`, `chat` and `world_restores` tables), as `net.js` hears them.
- Test without the real servers: `cd server && PORT=8799 AUTH_MODE=test MOB_SIM=0 node src/server.js`,
  and point `GameLink.Url` at `ws://127.0.0.1:8799` (tokens `test:<id>:<name>`).

## Status
1. Explore the world: terrain from the seed, the server's frozen chunks and changed blocks, the clay
   look, the day and night, walking with the web version's physics.
2. Your account (nickname and password, the same as on the web), your save, mining, placing, your bar.
3. Playing together: the others walking and mining, their names, their blocks live, the chat.
4. Mobs and combat: the web version's models, striking, the guard and the parry, the Plasma Pistol,
   fighting other players, your hearts, falling in combat, the loot.
5. The rest of the game, in parts. Done: the window (E: your bag, crafting, a chest), chests, consumables,
   beds and meals, relighting a validator, wearing a plating or the boots, the boots' dodge; the chapters
   and their rewards (O, `Progress.cs`: the same save flags as the web version), your validators (attest,
   upgrade); the shop (buy, wear) and the looks on every figure (`Looks.cs`, `Resources/looks.json`:
   outfits, headwear, back pieces, companions, trails; titles under the names); their small animations
   and the trims' glow come with 6.
   Plots (`Claims.cs`: their borders, /claim to choose and take one, /unclaim, /invite, /kick, /claims;
   building refused in someone else's), signs (`Signs.cs`: their text on the boards, write on yours, read
   and report the others'), the chat's commands (/join, /sanctuary, /ignore, /listen, /report).
   Animals and villagers (`Animals.cs`, `Resources/animals.json` from `tools/export-animals.mjs`: placed
   from the seed and moved by the clock like on the web, pet them, talk to the villagers, fight an animal for
   a heart back). The Diamond Gliders: right-click with one in hand to board or step off, twice as fast,
   gliding over water and one-block steps, drifting in hard turns; other riders seen seated on theirs.
6. Phones and tablets: the touch controls (`TouchPad.cs`, as on the web: the stick under the left thumb,
   drag to look, tap to place or use, hold to mine, the buttons on the right and on top, tap the bar),
   the interface scaled to the screen and clear of the notch, the system keyboard for the chat and the
   signs; the store builds (`Assets/Editor/Build.cs`, below).
Then the circuits (`Core/Circuits.cs`, checked tick for tick against 12-circuits.js; `CircuitsView.cs`:
lamps, doors, plates, gates and the clock live around you, the objectives' shapes, the lanterns' light).
Trades (`Trade.cs`, the window's Trade tab: offers received and sent, accept, decline, cancel, a new offer
of resources, unique pickaxes and plots; the database's feed tells when one changes).
The Twin Diamond's back seat (right-click a friend driving one: you ride behind them, jump to get off;
your `on` in the game server's pos message, their passenger seen in your back seat).
The looks' small animations (`LookAnim.cs`: halos turning, flags and capes in the wind, wings, companions
bobbing and spinning, measured from the game by `export-looks.mjs`) and your trims' glow (a pickaxe trim on
what you hold, a plating trim on your plating).

## Builds for the stores
The **Ether Mines** menu in the editor (or `Unity -batchmode -quit -projectPath unity -executeMethod
EtherMines.Builds.Build.<IPhone|Android|AndroidApk|Mac|Windows>`) sets the player settings (name, the id
`org.ethermines.game`, version, landscape, IL2CPP, the icon from `Assets/Icon/icon.png`, the fog and the
HUD shader kept), creates `Assets/Scenes/Main.unity` and builds into `Builds/` (not committed).
- **iPhone**: an Xcode project in `Builds/iOS`. Open it on the Mac, choose your team under Signing, then
  Product → Archive → Distribute to App Store Connect (an Apple Developer account, 99 $/year).
- **Android**: `Builds/Android/EtherMines.aab` for Google Play (a Play Console account). The upload key stays
  out of the repo: create it once (Unity's Keystore Manager or `keytool`), keep it safe, and give its path
  and passwords in `ETHERMINES_KEYSTORE`, `ETHERMINES_KEYSTORE_PASS`, `ETHERMINES_KEY_ALIAS`,
  `ETHERMINES_KEY_PASS`. Without it the build is signed with a debug key (fine on your own phone, refused by
  Google Play). The `.apk` menu item makes one to install directly on a phone.
- **Mac / Windows**: an app in `Builds/Mac` or `Builds/Windows`.
- Try the touch controls without a phone: Window → General → **Device Simulator**, pick a phone, press Play.
