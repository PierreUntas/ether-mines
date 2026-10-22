// The circuits (Core/Circuits.cs) against 12-circuits.js: golden/circuits.json (node golden-circuits.mjs)
// holds hand-built circuits (each objective's shape) and random ones, tick after tick, with what the web
// computed each tick: the powered cells, the active gates, the objective flags.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using EtherMines.Core;

namespace EtherMines.CoreTests
{
    public static class CircuitParity
    {
        static string Key(long k) { Circuits.D(k, out var x, out var y, out var z); return x + "," + y + "," + z; }

        public static void Run()
        {
            var dir = MeshParity.Dir();
            Rules.Load(File.ReadAllText(Path.Combine(dir, "..", "Assets", "Resources", "rules.json")));
            var cases = (List<object>)MiniJson.Parse(File.ReadAllText(Path.Combine(dir, "golden", "circuits.json")));
            int ticks = 0, bad = 0;
            string first = null;
            foreach (Dictionary<string, object> c in cases)
            {
                var nodes = new Dictionary<long, int>();
                foreach (List<object> n in (List<object>)c["nodes"]) nodes[Circuits.K(MiniJson.ToInt(n[0]), MiniJson.ToInt(n[1]), MiniJson.ToInt(n[2]))] = MiniJson.ToInt(n[3]);
                var cir = new Circuits();
                int t = 0;
                foreach (Dictionary<string, object> tk in (List<object>)c["ticks"])
                {
                    var feet = ((List<object>)tk["feet"]).Select(f => ((List<object>)f).Select(v => MiniJson.ToDouble(v)).ToArray()).ToList();
                    cir.Step(nodes, feet, MiniJson.Truthy(tk["clock"]));
                    var pw = string.Join(" ", cir.Powered.Select(Key).OrderBy(s => s, StringComparer.Ordinal));
                    var on = string.Join(" ", cir.GateOn.Select(Key).OrderBy(s => s, StringComparer.Ordinal));
                    var fl = new List<string>();
                    if (cir.GateLit) fl.Add("gateLit"); if (cir.TwoKeyDoor) fl.Add("twoKeyDoor"); if (cir.Blinker) fl.Add("gateBlinker"); if (cir.Latch) fl.Add("gateLatch"); if (cir.CoinFlip) fl.Add("gateCoinFlip");
                    var wpw = string.Join(" ", ((List<object>)tk["pw"]).Cast<string>().OrderBy(s => s, StringComparer.Ordinal));
                    var won = string.Join(" ", ((List<object>)tk["on"]).Cast<string>().OrderBy(s => s, StringComparer.Ordinal));
                    var wfl = string.Join(" ", ((List<object>)tk["flags"]).Cast<string>());
                    ticks++;
                    if (pw != wpw || on != won || string.Join(" ", fl) != wfl)
                    {
                        bad++;
                        first ??= $"{c["name"]} tick {t}: powered [{pw}] vs [{wpw}], gates [{on}] vs [{won}], flags [{string.Join(" ", fl)}] vs [{wfl}]";
                    }
                    t++;
                }
            }
            Program.Check(bad == 0, $"circuits: {cases.Count} circuits, {ticks} ticks as the web computes them" + (first != null ? " — first difference: " + first : ""));
        }
    }
}
