// Ether Mines · playing together (11-multiplayer.js, 14-startup.js Net.on...): the game server for who is
// here and where they move, the database's feed for the blocks the others change and the chat. Your own
// moves go out as you walk; the others' blocks are laid into the world and drawn again at once. The
// server also runs the mobs and keeps your hearts: Mobs draws them, Combat fights them.
using System.Collections.Generic;
using EtherMines.Core;
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
        readonly List<string> names = new List<string>();
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
            chat = gameObject.AddComponent<Chat>();
            chat.Session = Session;
            chat.MyName = Session.Login ?? "";
            chat.MyColor = Session.Color;

            link = new GameLink(Session.World, net.Token);
            mobs = gameObject.AddComponent<Mobs>();
            mobs.Player = Player;
            combat = gameObject.AddComponent<Combat>();
            combat.Session = Session;
            combat.Player = Player;
            combat.Act = Act;
            combat.Mobs = mobs;
            combat.Avatars = avatars;
            combat.Link = link;
            Act.Combat = combat;
            var hand = GetComponent<Hand>();
            if (hand != null) hand.Combat = combat;
            items = GetComponent<Items>();
            if (items != null) { items.Link = link; items.Combat = combat; }
            // your hearts as this screen knows them, your plating and boots: the server keeps them from then on
            link.HelloExtra = () => new Dictionary<string, object> { ["hp"] = combat.Hp, ["ar"] = combat.Armor, ["bt"] = combat.Boots ? 1 : 0 };
            link.Peers += list =>
            {
                avatars.SetPeers(list, link.SelfId);
                names.Clear();
                foreach (var p in list) if (p.Id != link.SelfId) names.Add(p.Name);
            };
            link.Pos += m => { if (m.Id != link.SelfId) avatars.Heard(m.Id, m.Name, m.Color, m.X, m.Y, m.Z, m.Yaw, m.Pitch, m.Mining, true, m.Held); };

            feed = new Realtime(Session.World, net.Token);
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
            int held = Act.Inv.HeldId;
            if (held <= 0 || Rules.Block(held) != null) held = 0; // what's drawn in their hand: a tool or a weapon
            link.SendPos(b.X, b.Y, b.Z, Player.Yaw, Player.Pitch, Act.Swing > 0, held, Time.time, combat.Guarding, combat.Armor, combat.Boots, combat.Fx, combat.Fq, items != null && items.Warded);
        }

        void OnDestroy()
        {
            link?.Close();
            feed?.Close();
        }
    }
}
