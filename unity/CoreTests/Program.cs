// CoreTests: the C# core against the web version's JavaScript. Each check prints PASS or FAIL and the
// process exits 1 on any failure. Golden data comes from golden/*.bin, written by `node golden.mjs`.
using System;
using System.Collections.Generic;

namespace EtherMines.CoreTests
{
    public static class Program
    {
        static readonly List<string> failures = new List<string>();
        public static void Check(bool ok, string what)
        {
            Console.WriteLine((ok ? "PASS " : "FAIL ") + what);
            if (!ok) failures.Add(what);
        }

        public static int Main(string[] args)
        {
            var only = args.Length > 0 ? args[0] : null;
            if (only == null || only == "world") WorldParity.Run();
            if (only == null || only == "mesh") MeshParity.Run();
            if (only == null || only == "physics") PhysicsCheck.Run();
            Console.WriteLine(failures.Count == 0 ? "ALL PASS" : failures.Count + " FAILED");
            return failures.Count == 0 ? 0 : 1;
        }
    }
}
