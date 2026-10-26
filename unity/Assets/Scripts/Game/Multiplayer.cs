// Ether Mines · playing together (11-multiplayer.js, 14-startup.js Net.on...): the game server for who is
// here and where they move, the database's feed for the blocks the others change and the chat. Your own
// moves go out as you walk; the others' blocks are laid into the world and drawn again at once. The
// server also runs the mobs and keeps your hearts: Mobs draws them, Combat fights them.
using System;
using System.Collections.Generic;
using EtherMines.Core;
using World_ = EtherMines.Core.World;
using UnityEngine;

namespace EtherMines.Game
{
    public sealed class Multiplayer : MonoBehaviour
    {
        public Session Session;
        public WorldView World;
        public PlayerController Player;
        public Interaction Act;

        GameLink link;
        bool wasReady;
        Presence presence; // the web's presence and region channels: who is here, and their moves, without the game server
        Realtime feed;
        Avatars avatars;
        Chat chat;
        Mobs mobs;
        Combat combat;
        Items items;
        Progress progress;
        Signs signs;
        Claims claims;
        Hover hover;
        Emotes emotes;
        readonly List<string> names = new List<string>();
        List<GameLink.Peer> lastPeers = new List<GameLink.Peer>();
        bool restoring;
        bool Offline => Session.Net.Offline; // a game on this device only: no sockets, no one else

        public string Line
        {
            get
            {
                if (link == null) return "";
                if (Offline) return "offline · saved on this device";
                string who = names.Count == 0 ? "" : " · " + string.Join(", ", names.Count > 3 ? names.GetRange(0, 3) : names) + (names.Count > 3 ? " +" + (names.Count - 3) : "");
                string gs = link.Ready ? $"{names.Count + 1} online ⚡{who}" : presence != null && presence.Joined ? $"{names.Count + 1} online{who}" : link.Status;
                return gs + (feed.Joined ? "" : "   " + feed.Status);
            }
        }

        void Start()
        {
            var net = Session.Net;
            avatars = gameObject.AddComponent<Avatars>();
            avatars.Player = Player;
            avatars.Act = Act;
            avatars.MyName = Session.Login ?? "";
            avatars.MyId = net.UserId;
            avatars.MyColor = Session.Color;
            progress = GetComponent<Progress>();
            avatars.MyLook = () => progress != null ? Looks.Mine(Session, progress.Cosmetics) : new Dictionary<string, int>();
            avatars.MyTitle = () => progress != null ? Looks.BestTitle(progress.Cosmetics) : "";
            var myHand = GetComponent<Hand>();
            if (myHand != null) myHand.Look = avatars.MyLook;
            chat = gameObject.AddComponent<Chat>();
            chat.Session = Session;
            chat.MyName = Session.Login ?? "";
            chat.MyColor = Session.Color;

            link = new GameLink(Session.World, net.Token);
            if (net.Offline)
            {
                // offline: the game server's mobs and hearts on this device, on the world as this screen has it
                var sim = new MobSim(new StoreTerrain(World.Store), DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()) { PaysLoot = true };
                sim.Loot += l => sim.SendLoot(l.PlayerId, l.Type, net.Local.LootMob(Session.World, l.Type));
                sim.UseItem = (p, item) => net.Local.UseTonic(Session.World);
                link.Local = sim;
            }
            mobs = GetComponent<Mobs>() ?? gameObject.AddComponent<Mobs>();
            mobs.Player = Player;
            combat = gameObject.AddComponent<Combat>();
            combat.Session = Session;
            combat.Player = Player;
            combat.Act = Act;
            combat.Mobs = mobs;
            combat.Avatars = avatars;
            combat.Link = link;
            Act.Combat = combat;
            hover = GetComponent<Hover>();
            var circuits = GetComponent<CircuitsView>();
            if (circuits != null) circuits.Avatars = avatars; // their feet press the plates too
            if (hover != null) { combat.Hover = hover; avatars.MyRide = () => hover.Riding; avatars.MyOn = () => hover.Boarded; avatars.Hover = hover; hover.Avatars = avatars; }
            var animals = GetComponent<Animals>();
            if (animals != null) { animals.Link = link; animals.Combat = combat; combat.Animals = animals; }
            avatars.MyArmor = () => combat.Armor;
            avatars.MyBoots = () => combat.Boots;
            avatars.MyGuard = () => combat.Guarding;
            avatars.MyParryAt = () => combat.ParryAt;
            avatars.World = World;
            avatars.MyCape = () => Session.Inv.Uniques.Exists(u => u.Id == 205);
            avatars.MyGear = () => new[] { combat.Gear("helm"), combat.Gear("gloves"), combat.Gear("legs"), combat.Gear("amulet") }; // 24-gear.js
            // the gestures (21-emotes.js): the row, G, /wave...; yours drawn on your figure, sent with your position
            emotes = gameObject.AddComponent<Emotes>();
            emotes.Player = Player; emotes.Act = Act; emotes.Combat = combat; emotes.Hover = hover; emotes.Chat = chat;
            emotes.Owns = id => progress != null && progress.Cosmetics.Contains(id);
            emotes.Panel = GetComponent<Panel>();
            // the everyday gestures (22-gestures.js): doors, levers, lids, blocks, beds, chairs
            gameObject.AddComponent<CombatFx>().Player = Player; // the combo, the shakes, the numbers
            var gest = gameObject.AddComponent<Gestures>();
            gest.World = World; gest.Player = Player; gest.Panel = GetComponent<Panel>(); gest.Emotes = emotes;
            avatars.MyEmote = () => emotes.Mine;
            var hand = GetComponent<Hand>();
            if (hand != null) hand.Combat = combat;
            var panel = GetComponent<Panel>();
            if (panel != null) panel.Avatars = avatars;
            items = GetComponent<Items>();
            if (items != null) { items.Link = link; items.Combat = combat; }
            // your hearts as this screen knows them, your plating and boots: the server keeps them from then on
            link.HelloExtra = () => new Dictionary<string, object> { ["hp"] = combat.Hp, ["ar"] = combat.Armor, ["bt"] = combat.Boots ? 1 : 0, ["hm"] = combat.Gear("helm"), ["gl"] = combat.Gear("gloves"), ["lg"] = combat.Gear("legs"), ["am"] = combat.Gear("amulet") };
            link.Peers += list =>
            {
                lastPeers = list;
                avatars.SetPeers(list, link.SelfId);
                names.Clear();
                foreach (var p in list) if (p.Id != link.SelfId) names.Add(p.Name);
            };
            // without the game server (down, or being updated): Supabase's presence and region channels, as the web falls back to
            presence = new Presence(Session.World, net.Token, net.UserId) { Name = Session.Login ?? "", Color = Session.Color };
            presence.Peers += list =>
            {
                if (link.Ready) return; // the game server keeps the list of players
                lastPeers = list;
                avatars.SetPeers(list, net.UserId);
                names.Clear();
                foreach (var p in list) if (p.Id != net.UserId) names.Add(p.Name);
            };
            presence.Pos += m => { if (!link.Ready && m.Id != net.UserId) avatars.Heard(m.Id, m.Name, m.Color, m.X, m.Y, m.Z, m.Yaw, m.Pitch, m.Mining, true, m.Held, m.Armor, m.Boots, m.Ride, m.On, m.Guard, m.Fx, m.Fq, m.Em, m.Eq, m.Hm, m.Gl, m.Lg, m.Am); };
            link.Pos += m => { if (m.Id != link.SelfId) avatars.Heard(m.Id, m.Name, m.Color, m.X, m.Y, m.Z, m.Yaw, m.Pitch, m.Mining, true, m.Held, m.Armor, m.Boots, m.Ride, m.On, m.Guard, m.Fx, m.Fq, m.Em, m.Eq, m.Hm, m.Gl, m.Lg, m.Am); };

            signs = gameObject.AddComponent<Signs>();
            signs.Session = Session;
            signs.World = World;
            signs.Player = Player;
            World.SignRead += signs.Set;
            claims = gameObject.AddComponent<Claims>();
            claims.Session = Session;
            claims.Player = Player;
            claims.Chat = chat;
            chat.Command = Command;
            chat.EnterTaken = () => { if (!claims.Picking) return false; claims.ConfirmPick(); return true; };
            if (items != null) items.Signs = signs;

            feed = new Realtime(Session.World, net.Token);
            feed.Sign += signs.Set;
            feed.Claim += claims.Changed;
            // trades: the Trade tab of the window
            var trade = gameObject.AddComponent<Trade>();
            trade.Session = Session;
            trade.Avatars = avatars;
            feed.Offer += trade.Changed;
            if (panel != null) panel.Trade = trade;
            tradeRef = trade; panelRef = panel;
            feed.Block += OnBlock;
            feed.Chat += (uid, name, color, text) => { if (uid != net.UserId) chat.Add(name, color, text); };
            feed.Restored += () =>
            {
                if (restoring) return;
                restoring = true;
                Hud.Feed("burn", "The map was restored", "everything outside the claimed plots is back as it was");
                World.ReloadAll();
                restoring = false;
            };
        }

        Trade tradeRef; Panel panelRef;

        // the chat's commands (14-startup.js command)
        void Command(string line)
        {
            var parts = line.Substring(1).Split(new[] { ' ' }, 2);
            string c = parts[0].ToLowerInvariant(), rest = parts.Length > 1 ? parts[1].Trim() : "", arg = rest.ToLowerInvariant();
            if (Rules.Emote(c) != null && !Rules.Emote(c).Hidden) { emotes.Play(c); return; } // /wave, /dance...
            void Say(string t) => chat.Add("World", "#7fe8ff", t);
            var b = Player.Body;
            switch (c)
            {
                case "sanctuary":
                    b.X = World_.SPAWN.X + 0.5; b.Y = World_.SPAWN.Y + 0.1; b.Z = World_.SPAWN.Z + 2.5; b.Vy = 0;
                    Say("Back to the sanctuary.");
                    return;
                case "join":
                {
                    var p = lastPeers.Find(o => o.Name.ToLowerInvariant() == arg) ?? lastPeers.Find(o => arg.Length > 0 && o.Name.ToLowerInvariant().StartsWith(arg));
                    if (p == null || p.Id == link.SelfId) { Say(arg.Length > 0 ? $"No one here is called \"{arg}\"." : "Type /join followed by a nickname."); return; }
                    if (!p.HasPos) { Say($"{p.Name} is online but not in the game right now: ask them to move a little, then try again."); return; }
                    b.X = p.X + 1; b.Y = p.Y + 0.5; b.Z = p.Z + 1; b.Vy = 0;
                    Say($"You join {p.Name}.");
                    return;
                }
                case "claim": case "unclaim": case "invite": case "kick": case "claims":
                    claims.Command(c, rest);
                    return;
                case "ignore": case "listen":
                    if (arg.Length == 0) { Say($"Type /{c} followed by a nickname."); return; }
                    if (c == "ignore") chat.Ignores.Add(arg); else chat.Ignores.Remove(arg);
                    chat.SaveIgnores();
                    Say(c == "ignore" ? $"You will no longer see messages from {arg}." : $"You see messages from {arg} again.");
                    return;
                case "trade":
                    // the Trade tab, its recipient filled in (the nickname as typed)
                    if (tradeRef != null) tradeRef.Prefill(rest);
                    panelRef?.Show("trade");
                    return;
                case "report":
                    if (arg.Length == 0) { Say("Type /report followed by a nickname."); return; }
                    Report(arg);
                    return;
            }
            Say("Commands: /join nickname · /sanctuary · /claim · /unclaim · /invite nickname · /kick nickname · /claims · /trade nickname · /ignore nickname · /listen nickname · /report nickname · /wave, /cheer… (G: gestures, K: your gestures' menu)");
        }

        async void Report(string who)
        {
            void Say(string t) => chat.Add("World", "#7fe8ff", t);
            try
            {
                var r = await Session.Net.Rpc("act_report", MiniJson.Write(new Dictionary<string, object> { ["w"] = Session.World, ["username"] = who })) as Dictionary<string, object>;
                if (r == null) { Say("try again later"); return; }
                if (MiniJson.Truthy(r.TryGetValue("ok", out var ok) ? ok : null))
                {
                    Say(MiniJson.Truthy(r.TryGetValue("muted", out var mu) ? mu : null) ? $"{who} has been muted for a while." : $"Report recorded. Three reports mute {who}.");
                    chat.Ignores.Add(who);
                    chat.SaveIgnores();
                    return;
                }
                var err = r.TryGetValue("err", out var e) ? e as string : "";
                Say(err == "unknown player" ? $"No one here is called \"{who}\"." : err == "must have played a little" ? "Play a little before you can report someone." : err == "too many actions" ? "One report at a time, slow down a bit." : err);
            }
            catch (Exception e) { Say("Report not sent: " + e.Message); }
        }

        // a block someone changed (yours too: it lands where it already is)
        void OnBlock(BlockEdit e)
        {
            int cx = e.X >> 4, cz = e.Z >> 4;
            bool unfrozen = World.Store.Has(cx, cz) && !World.Store.IsFrozen(cx, cz);
            // someone else's block, heard from where it is (yours already sounded when you did it)
            int before = World.Get(e.X, e.Y, e.Z);
            var me = Player.Body;
            if (before != e.Id && me != null && new Vector2((float)(e.X - me.X), (float)(e.Z - me.Z)).magnitude < 24)
            {
                var at = new Vector3(e.X + 0.5f, e.Y + 0.5f, e.Z + 0.5f);
                if (e.Id == 0) { Sounds.Brk(Sounds.MatOf(before), at); Effects.Break(e.X, e.Y, e.Z, before); }
                else Sounds.Place(Sounds.MatOf(e.Id), at);
            }
            // what someone else did moves here too (Gestures): a door swings, a lever flips, a block grows in
            var gs = Gestures.I;
            if (gs != null && before != e.Id && me != null && new Vector2((float)(e.X - me.X), (float)(e.Z - me.Z)).magnitude < 40)
            {
                bool pw = World.Powered.Contains(Circuits.K(e.X, e.Y, e.Z));
                gs.DoorChanged(e.X, e.Y, e.Z, before, e.Id, pw, pw);
                if (Rules.Block(before)?.Shape == "lever" && Rules.Block(e.Id)?.Shape == "lever") gs.FlipLever(e.X, e.Y, e.Z, Rules.Block(e.Id).On);
                if ((before == 0 || before == 11 || Mesher.IsCross(before)) && e.Id != 0 && new Vector2((float)(e.X - me.X), (float)(e.Z - me.Z)).magnitude < 24) gs.Grow(e.X, e.Y, e.Z, e.Id);
            }
            World.Store.Edit(e);
            World.Rebuild(e.X, e.Z);
            if (unfrozen) World.Refetch(cx, cz);
            link.Edit(e.X, e.Y, e.Z, e.Id);
            // a block placed where you stand lifts you out of it (applyBlock)
            var b = Player.Body;
            if (b != null && Mesher.IsSolid(e.Id) && b.Collides(b.X, b.Y, b.Z))
                for (int q = 0; q < 4 && b.Collides(b.X, b.Y, b.Z); q++) b.Y += 1;
        }

        void Update()
        {
            float dt = Time.deltaTime;
            link.NoMobs = !Reg.MobsOn;
            link.Hm = combat.Gear("helm"); link.Gl = combat.Gear("gloves"); link.Lg = combat.Gear("legs"); link.Am = combat.Gear("amulet"); // what you wear, told with your position // Settings → Hostile mobs (always on in the main world)
            var b = Player.Body;
            link.Tick(dt);
            if (b == null) return;
            if (Offline)
            {
                // the game server's part runs on this device (MobSim): the mobs, your hearts, their loot
                link.Owned(Act.Inv);
                link.SendPos(b.X, b.Y, b.Z, Player.Yaw, Player.Pitch, Act.Swing > 0, Act.Inv.HeldId > 0 && Rules.Block(Act.Inv.HeldId) == null ? Act.Inv.HeldId : 0, Time.time, combat.Guarding, combat.Armor, combat.Boots, combat.Fx, combat.Fq, items != null && items.Warded, hover != null ? hover.Riding : 0, hover?.Boarded, emotes.Out.K, emotes.Out.Q);
                return;
            }
            feed.Tick(dt);
            if (wasReady && !link.Ready) presence.Resync();
            wasReady = link.Ready;
            presence.Fallback = !link.Ready;
            presence.Name = Session.Login ?? ""; presence.Color = Session.Color;
            presence.Title = avatars.MyTitle(); presence.Look = Looks.Code(avatars.MyLook());
            presence.Tick(dt, b.X, b.Z);
            avatars.MyColor = Session.Color;
            link.SetLook(avatars.MyTitle(), Looks.Code(avatars.MyLook()));
            int held = Act.Inv.HeldId;
            if (held <= 0 || Rules.Block(held) != null) held = 0; // what's drawn in their hand: a tool or a weapon
            link.SendPos(b.X, b.Y, b.Z, Player.Yaw, Player.Pitch, Act.Swing > 0, held, Time.time, combat.Guarding, combat.Armor, combat.Boots, combat.Fx, combat.Fq, items != null && items.Warded, hover != null ? hover.Riding : 0, hover?.Boarded, emotes.Out.K, emotes.Out.Q);
            if (!link.Ready)
                presence.SendPos(new Dictionary<string, object>
                {
                    ["id"] = Session.Net.UserId, ["name"] = Session.Login ?? "", ["color"] = Session.Color,
                    ["x"] = Math.Round(b.X, 2), ["y"] = Math.Round(b.Y, 2), ["z"] = Math.Round(b.Z, 2), ["yaw"] = Math.Round(Player.Yaw, 2), ["pitch"] = Math.Round(Player.Pitch, 2),
                    ["m"] = Act.Swing > 0, ["h"] = held, ["gd"] = combat.Guarding ? 1 : 0, ["rd"] = hover != null ? hover.Riding : 0, ["on"] = hover?.Boarded ?? (object)0,
                    ["wd"] = items != null && items.Warded ? 1 : 0, ["ld"] = 0, ["ar"] = combat.Armor, ["bt"] = combat.Boots ? 1 : 0, ["nm"] = link.NoMobs ? 1 : 0,
                    ["hm"] = link.Hm, ["gl"] = link.Gl, ["lg"] = link.Lg, ["am"] = link.Am,
                    ["fx"] = combat.Fx ?? (object)0, ["fq"] = combat.Fq, ["em"] = emotes.Out.K ?? (object)0, ["eq"] = emotes.Out.Q,
                }, Time.time);
        }

        void OnDestroy()
        {
            link?.Close();
            feed?.Close();
            presence?.Close();
        }
    }
}
