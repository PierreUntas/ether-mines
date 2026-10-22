// Ether Mines · your journey (07-interface.js QUESTS, CHAPTERS, progressChapters, renderQuests,
// renderValidators): the objectives grouped into chapters, each one's progress read from your save (the
// same flags the web version keeps: what you ever got, a mob defeated, a night slept, the City reached...)
// and from the server (your unique items, your validators). A chapter done is announced, and its reward
// (Gwei and a title) claimed from the server, which pays only against proofs it checks itself
// (act_claim_chapter). Your validators: their state, attest them (collect their Gwei, pay their upkeep),
// upgrade them. Drawn in the window's Objectives and Validators tabs (Panel.cs).
using System;
using System.Collections.Generic;
using System.Linq;
using EtherMines.Core;
using UnityEngine;

namespace EtherMines.Game
{
    public sealed class Progress : MonoBehaviour
    {
        public Session Session;
        public PlayerController Player;

        sealed class Quest { public string Id, T, H; public Func<Progress, bool> Ok; }
        sealed class Chapter { public string Id, N, Side, Intro, Outro; public int Title, Gwei; public string[] Q; }

        static readonly Quest[] Quests =
        {
            Q("wood", "Harvest wood", "Mine a tree trunk, by hand.", p => p.Got(5)),
            Q("wpick", "Craft a wooden pickaxe", "Crafting (E): 3 planks. A log gives 4 planks.", p => p.Got(102)),
            Q("crystal", "Mine an ether crystal", "The blue ore in the rock. Stone is cut with a pickaxe.", p => p.Got(101)),
            Q("cpick", "Forge the crystal pickaxe", "2 planks + 3 crystals. Unique item, ×5 mining.", p => p.HasNft(201)),
            Q("geode", "Open a geode", $"Below layer {World.DEEP}, in the large caves. Only the crystal pickaxe opens them.", p => p.Got(103)),
            Q("ppick", "Forge the pure ether pickaxe", "4 pure shards + 4 crystals + 2 planks.", p => p.HasNft(202)),
            Q("genesis", "Reach the genesis rock", "Right at the bottom of the world, just above the bedrock. Only the pure ether pickaxe can break it.", p => p.Got(104)),
            Q("heart", "Craft a validator heart", "1 genesis fragment + 2 pure shards + 4 crystals.", p => p.Got(105)),
            Q("relight", "Relight an old validator", "Follow the compass to the ruins, then right-click the dark validator.", p => p.OwnedValidators >= 1),
            Q("mob", "Defeat a hostile mob", "Shadows lurk in caves, guardians watch dark validators. Fight one off.", p => p.Flag("killedMob")),
            Q("weapon", "Forge a weapon", "Craft a Volt Blade or a Pure Ether Blade to fight back.", p => p.Got(106) || p.Got(107)),
            Q("sleep", "Sleep in a bed", "Place a bed, then use it after dusk: it rests you, and it becomes your home.", p => p.Flag("slept")),
            Q("trade", "Trade with another player", "Open Trade, offer something, and have them accept.", p => p.Flag("traded")),
            Q("city", "Reach the City", "Follow the validators path from the Atrium to the great diamond.", p => p.Flag("visitedCity")),
            Q("pet", "Pet an animal", "Right-click a friendly creature.", p => p.Flag("petted")),
            Q("titan", "Earn a Genesis Titan Fang", "Defeat the Genesis Titan in the depths.", p => p.HasNft(205)),
            Q("attest", "Attest a validator", "Validators tab: attest one of your validators to collect its Gwei and keep it active.", p => p.Flag("attested")),
            Q("gateLamp", "Light a lamp through a gate", "Craft an AND, OR or NOT gate (Crafting, Circuits), then wire it with cable so its output powers a lamp.", p => p.Flag("gateLit")),
            Q("twoKey", "Build a two-key door", "Wire two pressure plates into an AND gate, its output into a door: it only opens when both are pressed at once.", p => p.Flag("twoKeyDoor")),
            Q("blinker", "Build a self-oscillating blinker", "Loop a NOT gate's own output back into its own input with cable: no clock needed, it blinks on its own.", p => p.Flag("gateBlinker")),
            Q("latch", "Build a latch that remembers", "Wire an OR gate: one input from a plate, another looped back from its own output, into a lamp. A working example stands in the Circuits Complex.", p => p.Flag("gateLatch")),
            Q("coinFlip", "Build a coin flip", "Feed a self-oscillating NOT loop and a plate into an AND gate, its output into a latch.", p => p.Flag("gateCoinFlip")),
            Q("gatesStand", "Leave your mark: three gates", "Keep an AND, an OR and a NOT gate of your own standing somewhere in the world (on your plot).", p => p.myGates >= 3),
            Q("relit3", "Relight three validators", "One dark validator sleeps in each ruin.", p => p.OwnedValidators >= 3),
            Q("defend", "Defend the Atrium", "Every hour, for its first 10 minutes, corrupted nodes converge on the Atrium. Destroy one.", p => p.Flag("defended")),
            Q("plasma", "Defeat the Plasma Core", "Climb a tower past the wardens on each floor: the Plasma Core waits at the top, next to its treasure.", p => p.HasNft(206)),
            Q("mergeVisit", "Climb to the Merge Sanctum", "A floating arena far from the Atrium. Its Beacon Stair spirals up from the ground.", p => p.Flag("visitedMerge")),
            Q("mergeTwins", "Bring down the twins together", "Proof-of-Work and Proof-of-Stake guard the sanctum. One struck down rises again after 12 s unless the other falls too.", p => p.HasNft(209)),
            Q("mergeWear", "Wear the Merge Aegis", "Open your bag (E), pick the Aegis, and equip it.", p => p.Str("armor") == "209"),
        };
        static Quest Q(string id, string t, string h, Func<Progress, bool> ok) => new Quest { Id = id, T = t, H = h, Ok = ok };
        static readonly Dictionary<string, Quest> QBy = Quests.ToDictionary(q => q.Id);

        static readonly Chapter[] Chapters =
        {
            new Chapter { Id = "genesis", N = "Genesis", Title = 15, Gwei = 50, Q = new[] { "wood", "wpick", "crystal", "pet", "city", "sleep" },
                Outro = "You found your feet, Pathfinder. But wood won’t cut what lies below. Time to visit the forge." },
            new Chapter { Id = "forge", N = "The Forge", Title = 16, Gwei = 100, Q = new[] { "cpick", "geode", "ppick", "weapon", "mob" },
                Intro = "Crystal answers to crystal. Forge a pickaxe from it, and the geodes deep below will open for you.",
                Outro = "Pure ether in your hands. Few get this far, Smith. The genesis rock waits at the bottom of the world." },
            new Chapter { Id = "awakening", N = "The Awakening", Title = 17, Gwei = 200, Q = new[] { "genesis", "heart", "relight", "attest" },
                Intro = "Under everything lies the genesis rock. Break it, forge a validator heart, and give a dark validator its light back.",
                Outro = "It’s beating again. One more voice in the network. Keep it attested, Awakener, and it will keep paying you." },
            new Chapter { Id = "network", N = "The Network", Title = 18, Gwei = 400, Q = new[] { "relit3", "trade", "defend", "plasma", "titan" },
                Intro = "One validator is a spark. A network is a fire. Relight more, defend the Atrium, and face the guardians of the towers and the depths.",
                Outro = "The network stands, and it stands because of you. Wear it proudly, Network Guardian." },
            new Chapter { Id = "merge", N = "The Merge", Title = 20, Gwei = 600, Q = new[] { "mergeVisit", "mergeTwins", "mergeWear" },
                Intro = "Up in the sky floats a sanctum where work and stake were made one. Its twin guardians never fall alone: strike them down together.",
                Outro = "Work and stake, merged at last. That aegis was forged for you, Merge Keeper." },
            new Chapter { Id = "circuits", N = "Circuits", Side = "genesis", Title = 19, Gwei = 100, Q = new[] { "gateLamp", "twoKey", "blinker", "latch", "coinFlip", "gatesStand" },
                Intro = "When you have a moment: the Circuits Complex, east of here, has a working example of every gate trick. Copy them, then make your own.",
                Outro = "AND, OR, NOT… you think in gates now. Circuit Sage suits you." },
        };
        static readonly Chapter[] Mains = Chapters.Where(c => c.Side == null).ToArray();

        // what the server knows
        public readonly List<int> Cosmetics = new List<int>();
        bool cosmeticsLoaded;
        public List<Dictionary<string, object>> Validators = new List<Dictionary<string, object>>();
        bool validatorsLoaded;
        int myGates;
        float tickT, valT, gatesT, rewardsT = 5;
        readonly Dictionary<string, float> claimFailed = new Dictionary<string, float>();
        readonly HashSet<string> claiming = new HashSet<string>();
        bool busy;

        // ---------- your save's flags ----------
        Dictionary<string, object> Obj(string k)
        {
            if (!Session.State.TryGetValue(k, out var o) || !(o is Dictionary<string, object> d)) Session.State[k] = d = new Dictionary<string, object>();
            return d;
        }
        bool Got(int id) => Obj("got").ContainsKey(id.ToString());
        bool Flag(string k) => Session.State.TryGetValue(k, out var v) && MiniJson.Truthy(v);
        string Str(string k) => Session.State.TryGetValue(k, out var v) && v != null ? (v is double d ? ((int)d).ToString() : v.ToString()) : null;
        bool HasNft(int id) => Session.Inv.Uniques.Any(u => u.Id == id);
        int OwnedValidators => validatorsLoaded ? Validators.Count : MiniJson.ToInt(Session.State.TryGetValue("relit", out var r) ? r : null);
        public void SetFlag(string k) { if (!Flag(k)) { Session.State[k] = 1.0; Session.Dirty = true; } }
        void MarkGot(int id) { var g = Obj("got"); if (!g.ContainsKey(id.ToString())) { g[id.ToString()] = 1.0; Session.Dirty = true; } }

        void Start()
        {
            // whatever you have, you got (06-actions.js on load); and from now on whatever comes in
            Session.Inv.Gained += (id, more, total) => MarkGot(id);
            Load();
        }

        async void Load()
        {
            try
            {
                var rows = await Session.Net.Select($"cosmetics_owned?select=cosmetic_id&world=eq.{Supabase.Q(Session.World)}&user_id=eq.{Session.Net.UserId}");
                Cosmetics.Clear();
                foreach (Dictionary<string, object> r in rows) Cosmetics.Add(MiniJson.ToInt(r["cosmetic_id"]));
                cosmeticsLoaded = true;
            }
            catch (Exception e) { Debug.LogWarning(e); }
            await LoadValidators();
        }

        public async System.Threading.Tasks.Task LoadValidators()
        {
            valT = 60;
            try
            {
                var rows = await Session.Net.Select($"validators?select=*&world=eq.{Supabase.Q(Session.World)}&owner=eq.{Session.Net.UserId}&order=id");
                Validators = rows.OfType<Dictionary<string, object>>().ToList();
                validatorsLoaded = true;
            }
            catch (Exception e) { Debug.LogWarning(e); }
        }

        async void LoadGates()
        {
            gatesT = 30;
            try
            {
                var rows = await Session.Net.Select($"blocks?select=id&world=eq.{Supabase.Q(Session.World)}&placed_by=eq.{Session.Net.UserId}&id=gte.112&id=lte.123");
                myGates = rows.OfType<Dictionary<string, object>>().Select(r => (MiniJson.ToInt(r["id"]) - 112) / 4).Distinct().Count();
            }
            catch (Exception e) { Debug.LogWarning(e); }
        }

        bool Done(Chapter c) => c.Q.All(id => QBy[id].Ok(this));
        bool Open(Chapter c) => c.Side != null ? Done(Chapters.First(o => o.Id == c.Side)) : Mains.TakeWhile(m => m != c).All(Done);
        Chapter Current => Mains.FirstOrDefault(c => !Done(c));

        void Update()
        {
            if (Player.Body == null) return;
            valT -= Time.deltaTime;
            gatesT -= Time.deltaTime;
            if (valT <= 0) _ = LoadValidators();
            if ((rewardsT -= Time.deltaTime) <= 0) { rewardsT = 60; Rewards(); }
            if (gatesT <= 0 && Open(Chapters.First(c => c.Id == "circuits"))) LoadGates();
            if ((tickT -= Time.deltaTime) > 0) return;
            tickT = 1;
            // places reached (07-interface.js updatePlace)
            var b = Player.Body;
            if (World.InCity(b.X, b.Z)) SetFlag("visitedCity");
            var mg = World.MergeAt((int)Math.Floor(b.X / World.MERGE), (int)Math.Floor(b.Z / World.MERGE));
            if (mg != null && World.Hypot(mg.X - b.X, mg.Z - b.Z) < World.MERGE_R + 1 && b.Y > mg.Y && b.Y < mg.Y + 12) SetFlag("visitedMerge");
            Tick();
        }

        // objectives and chapters reached since the last tick: announced once, rewards claimed (progressChapters)
        void Tick()
        {
            // what you have, you got (the objectives read it)
            foreach (var kv in Session.Inv.Counts) if (kv.Value > 0) MarkGot(kv.Key);
            foreach (var u in Session.Inv.Uniques) MarkGot(u.Id);
            var qd = Session.State.ContainsKey("qd") ? Obj("qd") : null;
            if (qd == null)
            {
                // the first time on this save: what's already done is taken as seen, silently
                qd = Obj("qd");
                var seen0 = Obj("chSeen");
                foreach (var q in Quests) if (q.Ok(this)) qd[q.Id] = 1.0;
                foreach (var c in Chapters) { if (Open(c)) seen0[c.Id + ":in"] = 1.0; if (Done(c)) seen0[c.Id] = 1.0; }
                Session.Dirty = true;
            }
            var seen = Obj("chSeen");
            foreach (var c in Chapters)
            {
                bool open = Open(c);
                foreach (var id in c.Q)
                {
                    var q = QBy[id];
                    if (qd.ContainsKey(id) || !q.Ok(this)) continue;
                    qd[id] = 1.0;
                    Session.Dirty = true;
                    if (!open) continue;
                    int left = c.Q.Count(o => !QBy[o].Ok(this));
                    Hud.Feed("nft", "Objective reached: " + q.T, left > 0 ? $"{c.N}: {left} left" : c.N + " complete");
                }
                if (open && !seen.ContainsKey(c.Id + ":in"))
                {
                    seen[c.Id + ":in"] = 1.0;
                    Session.Dirty = true;
                    if (c.Intro != null) Hud.Feed("nft", "Thea", c.Intro);
                    Hud.Feed("nft", "New chapter: " + c.N, $"{c.Q.Length} objectives · reward {c.Gwei} Gwei and a title");
                }
                if (open && Done(c) && !seen.ContainsKey(c.Id))
                {
                    seen[c.Id] = 1.0;
                    Session.Dirty = true;
                    if (c.Outro != null) Hud.Feed("nft", "Thea", c.Outro);
                }
                if (cosmeticsLoaded && Done(c) && !Cosmetics.Contains(c.Title) && !claiming.Contains(c.Id) &&
                    (!claimFailed.TryGetValue(c.Id, out var t) || Time.time - t > 600))
                    Claim(c);
            }
        }

        // what your validators produced meanwhile (act_rewards, every minute)
        async void Rewards()
        {
            try
            {
                var r = await Session.Act("rewards", new Dictionary<string, object>(), 0, 0, 0);
                if (r == null || r.ContainsKey("refused")) return;
                if (r.TryGetValue("gwei", out var g)) Session.Gwei = MiniJson.ToDouble(g);
                int gained = MiniJson.ToInt(r.TryGetValue("gained", out var ga) ? ga : null);
                if (gained > 0) Hud.Feed("mint", gained + " Gwei", "collected from your validators");
            }
            catch (Exception e) { Debug.LogWarning(e); }
        }

        async void Claim(Chapter c)
        {
            claiming.Add(c.Id);
            try
            {
                var r = await Session.Act("claim_chapter", new Dictionary<string, object> { ["chapter"] = c.Id }, 0, 0, 0, "chapter reward");
                if (r == null || r.ContainsKey("refused")) { claimFailed[c.Id] = Time.time; return; }
                int cos = MiniJson.ToInt(r.TryGetValue("cosmetic", out var co) ? co : null, c.Title);
                if (!Cosmetics.Contains(cos)) Cosmetics.Add(cos);
                if (r.TryGetValue("total_gwei", out var tg)) Session.Gwei = MiniJson.ToDouble(tg);
                Hud.Feed("mint", c.N + " complete", $"+{MiniJson.ToInt(r.TryGetValue("gwei", out var g) ? g : null)} Gwei and the title “{TitleName(cos)}”");
            }
            finally { claiming.Remove(c.Id); }
        }

        static string TitleName(int id) => Rules.Cosmetics.TryGetValue(id, out var c) ? c.N : "#" + id;

        // ---------- the Objectives tab ----------
        Vector2 scroll;
        public void DrawObjectives(Rect body)
        {
            float h = 0;
            foreach (var c in Chapters) h += 90 + (Open(c) && !Done(c) ? c.Q.Length * 44 : 0);
            var view = new Rect(0, 0, body.width - 20, h + 60);
            scroll = GUI.BeginScrollView(body, scroll, view);
            GUI.Label(new Rect(0, 0, view.width, 40), "The old validators of this world have gone dark. Grow strong enough to reach the genesis rock, forge a validator heart, and relight them, one by one.", Ui.Small);
            float y = 46;
            var cur = Current;
            foreach (var c in Chapters)
            {
                bool open = Open(c);
                int done = c.Q.Count(id => QBy[id].Ok(this));
                bool claimed = Cosmetics.Contains(c.Title);
                string status = !open ? "Unlocks after " + (c.Side != null ? Chapters.First(o => o.Id == c.Side).N : Mains[Array.IndexOf(Mains, c) - 1].N)
                    : claimed ? $"Complete · title “{TitleName(c.Title)}” earned"
                    : done == c.Q.Length ? "Complete · claiming the reward…"
                    : $"Reward: {c.Gwei} Gwei and the title “{TitleName(c.Title)}”";
                Ui.Fill(new Rect(0, y, view.width, 80), new Color(1, 1, 1, c == cur ? 0.1f : 0.05f));
                if (c == cur) Ui.Fill(new Rect(0, y, 4, 80), Ui.Gold);
                string head = (c.Side != null ? "Side chapter" : "Chapter " + (Array.IndexOf(Mains, c) + 1)) + " · " + c.N;
                GUI.Label(new Rect(12, y + 6, view.width - 100, 26), open ? head : "<color=#9a92c8>" + head + "</color>", Ui.Title);
                GUI.Label(new Rect(view.width - 70, y + 8, 60, 24), $"{done}/{c.Q.Length}", Ui.Label);
                Ui.Fill(new Rect(12, y + 38, view.width - 24, 8), new Color(1, 1, 1, 0.1f));
                Ui.Fill(new Rect(12, y + 38, (view.width - 24) * done / c.Q.Length, 8), Ui.Mint);
                GUI.Label(new Rect(12, y + 52, view.width - 24, 22), status, Ui.Small);
                y += 88;
                if (open && done < c.Q.Length)
                {
                    bool first = true;
                    foreach (var id in c.Q)
                    {
                        var q = QBy[id];
                        bool ok = q.Ok(this), now = !ok && first;
                        if (now) first = false;
                        string mark = ok ? "<color=#9fe3c4>✓</color>" : now ? "<color=#ffd95e>▸</color>" : "·";
                        GUI.Label(new Rect(24, y, view.width - 40, 22), $"{mark} <b>{(ok ? "<color=#9fe3c4>" + q.T + "</color>" : q.T)}</b>", Ui.Label);
                        GUI.Label(new Rect(44, y + 20, view.width - 60, 22), q.H, Ui.Small);
                        y += 44;
                    }
                }
                y += 6;
            }
            GUI.EndScrollView();
        }

        // ---------- the Validators tab ----------
        Vector2 vscroll;
        public void DrawValidators(Rect body)
        {
            GUI.Label(new Rect(body.x, body.y, body.width, 44), "Each validator earns Gwei every cycle (5 minutes), whether you’re watching or not: attest it anytime, from anywhere, to collect it. It also needs a check-in at least every 8 days, or it’s corrupted (a Validator Heart repairs it).", Ui.Small);
            var r = new Rect(body.x, body.y + 50, body.width, body.height - 50);
            if (!validatorsLoaded) { GUI.Label(r, "Loading your validators…", Ui.Label); return; }
            if (Validators.Count == 0) { GUI.Label(r, "No validator yet. Relight a dark one in the ruins.", Ui.Label); return; }
            var view = new Rect(0, 0, r.width - 20, Validators.Count * 104);
            vscroll = GUI.BeginScrollView(r, vscroll, view);
            float y = 0;
            foreach (var v in Validators)
            {
                string rarity = v.TryGetValue("rarity", out var ra) && ra is string rs && rs.Length > 0 ? char.ToUpper(rs[0]) + rs.Substring(1) : "Common";
                int level = MiniJson.ToInt(v["level"], 1);
                string state = v.TryGetValue("state", out var st) ? st as string : "active";
                double prod = MiniJson.ToDouble(v.TryGetValue("gwei_per_cycle", out var gp) ? gp : null), cost = MiniJson.ToDouble(v.TryGetValue("maintenance_cost", out var mc) ? mc : null);
                int missed = MiniJson.ToInt(v.TryGetValue("missed_cycles", out var mi) ? mi : null);
                Ui.Fill(new Rect(0, y, view.width, 96), new Color(1, 1, 1, 0.06f));
                GUI.Label(new Rect(12, y + 6, view.width - 24, 26), $"{rarity} validator · level {level}", Ui.Title);
                GUI.Label(new Rect(12, y + 34, view.width - 24, 22), $"{MiniJson.ToInt(v["x"])}, {MiniJson.ToInt(v["y"])}, {MiniJson.ToInt(v["z"])} · <b>{state}</b> · {Math.Max(prod - cost, 0)} Gwei net per cycle ({prod} produced − {cost} upkeep){(missed > 0 ? $" · {missed} cycle{(missed > 1 ? "s" : "")} missed" : "")}", Ui.Small);
                GUI.enabled = !busy;
                if (GUI.Button(new Rect(12, y + 58, 260, 30), state == "corrupted" ? "Repair and attest (1 validator heart)" : "Attest", Ui.Primary)) Validator(v, "maintain_validator");
                if (state != "corrupted" && level < 10 && GUI.Button(new Rect(282, y + 58, 200, 30), $"Upgrade ({50 * level} Gwei)", Ui.Button)) Validator(v, "upgrade_validator");
                GUI.enabled = true;
                y += 104;
            }
            GUI.EndScrollView();
        }

        async void Validator(Dictionary<string, object> v, string act)
        {
            busy = true;
            try
            {
                var r = await Session.Act(act, new Dictionary<string, object> { ["validator_id"] = (long)MiniJson.ToDouble(v["id"]) }, 0, 0, 0, act == "maintain_validator" ? "validator attested" : "validator upgraded");
                if (r != null && !r.ContainsKey("refused"))
                {
                    if (r.TryGetValue("gwei", out var g)) Session.Gwei = MiniJson.ToDouble(g);
                    var nv = r.TryGetValue("validator", out var vv) ? vv as Dictionary<string, object> : null;
                    if (act == "maintain_validator")
                    {
                        SetFlag("attested");
                        Hud.Feed("mint", "Validator attested", nv != null && (nv["state"] as string) == "active" ? "Gwei collected, upkeep paid" : "");
                    }
                    else Hud.Feed("mint", "Validator upgraded", nv != null ? "level " + MiniJson.ToInt(nv["level"]) : "");
                }
                await LoadValidators();
            }
            finally { busy = false; }
        }
    }
}
