// What's new: the update log the players read (title screen, and the wiki). Newest first. Add an entry
// with each update worth telling: a date (YYYY-MM-DD), a short title, and a few lines written for the
// players (what changes for them, not how it was done). The title screen lights a dot until the newest
// entry has been opened. After a change: node tools/wiki.mjs > wiki.html, and node unity/tools/export-news.mjs
(function (root) {
  root.NEWS = [
    {
      date: '2026-10-24',
      title: 'Creatures of the land',
      items: [
        'The dunes, forests, plains and snowy peaks have their own creatures now.',
        'Gas Scorpion, in the dunes at night: it stings from afar with a bolt of gas.',
        'Phishing Spider, in the forests at night: beware its gold coin, it pounces.',
        'Pump Slime, on the plains at night: it hops toward you.',
        'Cold Wallet Yeti, on the snowy peaks, day and night: slow and tough, its blows throw you far.',
      ],
    },
    {
      date: '2026-10-24',
      title: 'Softer land',
      items: [
        'The edges of steps, cliffs and tree crowns look rounded, like modelling clay: the land reads as one soft mass.',
        'Grass wraps over the rounded edges, and inside corners curve smoothly too.',
        'Players and villagers have softer, rounded shapes.',
        'Your health shows as a life bar instead of a row of hearts: a pale trail shows what a blow just took.',
        'A creature you strike shows its own life bar over its head for a few seconds.',
        'Walking backwards is slower than walking forwards.',
        'Gliding with the Titan’s cape: arms spread like wings, no more running in the air.',
        'Settings → On screen: hide what you don’t need (position, players online, gear, Gwei, objective, aimed block, names over heads).',
      ],
    },
    {
      date: '2026-10-23',
      title: 'The sound of the ground',
      items: [
        'Footsteps, mining and building sound like what they touch again: grass, sand, snow, wood, glass and stone each have their own.',
      ],
    },
    {
      date: '2026-10-22',
      title: 'Fairer fights',
      items: [
        'Mobs stop a step away to strike instead of walking into you: your guard and your parries now catch every blow from in front.',
        '/invite and /kick work again: let a friend build on your plots, or take it back.',
        'Pink foxes roam the forests again: pet one and it picks you a flower, once a day.',
      ],
    },
    {
      date: '2026-10-21',
      title: 'Version 1',
      items: [
        'Your account is your nickname and a password: enter with them on any device to find your game. Got a temporary password? The game asks you to choose your own.',
        'Plots cost Gwei: 500 for the first, twice as much for each next one, 9 at most per world.',
        'A wiki, linked from this screen: controls, chapters, crafting, mobs, validators, plots, the shop.',
        'On a phone: spaced action buttons, a button to ride a hovercraft, and the character stays in view in the shop while you try things on.',
        'On a phone, drag your finger while firing the pistol to turn and aim.',
        'This update log, right here.',
      ],
    },
    {
      date: '2026-10-20',
      title: 'Animations and models',
      items: [
        'Seen from behind, your blows and your guard match what you see in first person, and the other players see them too.',
        'Mobs flash when struck, wind up before they strike (raise your guard right then), and burst into cubes when they fall.',
        'Jumps, landings, runs, swims and ladder climbs have their own moves.',
        'Every item you hold has its own clay model, doors, fences and plants included.',
        'Holding jump in the water, you float half in it instead of bouncing on the surface.',
        'Faster start, and the game keeps where you stand even when you only walk.',
      ],
    },
    {
      date: '2026-10-19',
      title: 'Shop, towers and validators',
      items: [
        'The shop sells every look, with variants of outfits, hats, capes, wings, backpacks, trails and pickaxe trims.',
        'Bigger towers and Merge Sanctum: more room to fight.',
        'Validators need an attestation once every 8 days, not every day.',
      ],
    },
    {
      date: '2026-10-18',
      title: 'The game server',
      items: [
        'Players, mobs, fights and loot now go through the game server: smoother multiplayer and fair fights.',
        'Front-Runner Boots: worn on your feet, with a dodge (Q, or the lightning button).',
        'Claiming a plot shows it to you first.',
      ],
    },
    {
      date: '2026-10-17',
      title: 'The clay look',
      items: [
        'A new look for the whole world: soft clay shapes, glow, aurora and clouds.',
        'Guard and parry with a blade: raise it just before a blow and the mob reels.',
        'Diamond Gliders: hovercrafts to ride, twice as fast and over water too.',
        'The Mempool: an open-air colosseum and its boss, the Front-Runner.',
      ],
    },
  ];
})(typeof window !== 'undefined' ? window : globalThis);
