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
        readonly List<string> names = new List<string>();
        List<GameLink.Peer> lastPeers = new List<GameLink.Peer>();
        bool restoring;

        public string Line
        {
            get
            {
                if (link == null) return "";
                string who = names.Count == 0 ? "" : " · " + string.Join(", ", names.Count > 3 ? names.GetRange(0, 3) : names) + (names.Count > 3 ? " +" + (names.Count - 3) : "");
                string gs = link.Ready ? $"{names.Count + 1} online ⚡{who}" : link.Status;
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
            avatars.MyColor = Session.Color;
            progress = GetComponent<Progress>();
            avatars.MyLook = () => progress != null ? Looks.Mine(Session, progress.Cosmetics) : new Dictionary<string, int>();
            avatars.MyTitle = () => progress != null ? Looks.BestTitle(progress.Cosmetics) : "";
            chat = gameObject.AddComponent<Chat>();
            chat.Session = Session;
            chat.MyName = Session.Login ?? "";
            chat.MyColor = Session.Color;

            link = new GameLink(Session.World, net.Token);
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
            if (hover != null) { combat.Hover = hover; avatars.MyRide = () => hover.Riding; }
            var animals = GetComponent<Animals>();
            if (animals != null) { animals.Link = link; animals.Combat = combat; combat.Animals = animals; }
            avatars.MyArmor = () => combat.Armor;
            avatars.MyBoots = () => combat.Boots;
            avatars.MyCape = () => Session.Inv.Uniques.Exists(u => u.Id == 205);
            var hand = GetComponent<Hand>();
            if (hand != null) hand.Combat = combat;
            var panel = GetComponent<Panel>();
            if (panel != null) panel.Avatars = avatars;
            items = GetComponent<Items>();
            if (items != null) { items.Link = link; items.Combat = combat; }
            // your hearts as this screen knows them, your plating and boots: the server keeps them from then on
            link.HelloExtra = () => new Dictionary<string, object> { ["hp"] = combat.Hp, ["ar"] = combat.Armor, ["bt"] = combat.Boots ? 1 : 0 };
            link.Peers += list =>
            {
                lastPeers = list;
                avatars.SetPeers(list, link.SelfId);
                names.Clear();
                foreach (var p in list) if (p.Id != link.SelfId) names.Add(p.Name);
            };
            link.Pos += m => { if (m.Id != link.SelfId) avatars.Heard(m.Id, m.Name, m.Color, m.X, m.Y, m.Z, m.Yaw, m.Pitch, m.Mining, true, m.Held, m.Armor, m.Boots, m.Ride); };

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

        // the chat's commands (14-startup.js command)
        void Command(string line)
        {
            var parts = line.Substring(1).Split(new[] { ' ' }, 2);
            string c = parts[0].ToLowerInvariant(), rest = parts.Length > 1 ? parts[1].Trim() : "", arg = rest.ToLowerInvariant();
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
                case "report":
                    if (arg.Length == 0) { Say("Type /report followed by a nickname."); return; }
                    Report(arg);
                    return;
            }
            Say("Commands: /join nickname · /sanctuary · /claim · /unclaim · /invite nickname · /kick nickname · /claims · /ignore nickname · /listen nickname · /report nickname");
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
            link.Tick(dt);
            feed.Tick(dt);
            var b = Player.Body;
            if (b == null) return;
            avatars.MyColor = Session.Color;
            link.SetLook(avatars.MyTitle(), Looks.Code(avatars.MyLook()));
            int held = Act.Inv.HeldId;
            if (held <= 0 || Rules.Block(held) != null) held = 0; // what's drawn in their hand: a tool or a weapon
            link.SendPos(b.X, b.Y, b.Z, Player.Yaw, Player.Pitch, Act.Swing > 0, held, Time.time, combat.Guarding, combat.Armor, combat.Boots, combat.Fx, combat.Fq, items != null && items.Warded, hover != null ? hover.Riding : 0);
        }

        void OnDestroy()
        {
            link?.Close();
            feed?.Close();
        }
    }
}
