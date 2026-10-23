// Ether Mines · talking to Supabase from Unity, as the web version's src/net.js does through supabase-js:
// a guest session (anonymous sign-in, kept between launches), REST reads of the tables (paged), and the
// act_* functions. Plain HTTPS (UnityWebRequest), JSON parsed by the core's MiniJson.
using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using EtherMines.Core;
using UnityEngine;
using UnityEngine.Networking;

namespace EtherMines.Game
{
    public sealed class Supabase
    {
        const string SessionKey = "ether-mines:session"; // PlayerPrefs: the guest session's refresh token
        public string UserId { get; private set; }
        // playing with no network: every read and every action is answered on the device (LocalServer.cs)
        public readonly LocalServer Local;
        public Supabase(LocalServer local = null) { Local = local; if (local != null) UserId = local.UserId; }
        public bool Offline => Local != null;
        public string AccessToken { get; private set; }
        string refreshToken;
        double expiresAt;

        static double Now => (DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalSeconds;

        static Task<UnityWebRequest> Send(UnityWebRequest r)
        {
            var tcs = new TaskCompletionSource<UnityWebRequest>();
            r.SendWebRequest().completed += _ => tcs.TrySetResult(r);
            return tcs.Task;
        }

        static UnityWebRequest Json(string method, string url, string body)
        {
            var r = new UnityWebRequest(url, method);
            r.downloadHandler = new DownloadHandlerBuffer();
            if (body != null)
            {
                r.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body));
                r.SetRequestHeader("Content-Type", "application/json");
            }
            r.SetRequestHeader("apikey", Config.SupabaseAnonKey);
            return r;
        }

        void KeepSession(Dictionary<string, object> d)
        {
            AccessToken = d["access_token"] as string;
            refreshToken = d["refresh_token"] as string;
            expiresAt = Now + MiniJson.ToDouble(d.TryGetValue("expires_in", out var e) ? e : null, 3600);
            if (d.TryGetValue("user", out var u) && u is Dictionary<string, object> user) UserId = user["id"] as string;
            PlayerPrefs.SetString(SessionKey, refreshToken);
            PlayerPrefs.Save();
        }

        // the guest session: the one kept from last time if it still works, a new one otherwise
        public async Task SignIn()
        {
            if (Local != null) return;
            var kept = PlayerPrefs.GetString(SessionKey, "");
            if (kept.Length > 0 && await Refresh(kept)) return;
            using (var r = Json("POST", Config.SupabaseUrl + "/auth/v1/signup", "{\"data\":{}}"))
            {
                await Send(r);
                if (r.result != UnityWebRequest.Result.Success)
                    throw new Exception("guest sign-in: " + r.responseCode + " " + r.downloadHandler.text);
                KeepSession((Dictionary<string, object>)MiniJson.Parse(r.downloadHandler.text));
            }
        }

        async Task<bool> Refresh(string token)
        {
            using (var r = Json("POST", Config.SupabaseUrl + "/auth/v1/token?grant_type=refresh_token", "{\"refresh_token\":\"" + token + "\"}"))
            {
                await Send(r);
                if (r.result != UnityWebRequest.Result.Success) return false;
                KeepSession((Dictionary<string, object>)MiniJson.Parse(r.downloadHandler.text));
                return true;
            }
        }

        async Task Fresh()
        {
            if (AccessToken == null) await SignIn();
            else if (Now > expiresAt - 60 && !await Refresh(refreshToken)) await SignIn();
        }

        // the session token, renewed when it's about to run out (for the real-time connections)
        public async Task<string> Token()
        {
            if (Local != null) return "offline";
            await Fresh();
            return AccessToken;
        }

        // every row of a REST query, 1000 at a time (readAll in net.js). query: "chunks?select=...&world=eq.x"
        public async Task<List<object>> Select(string query)
        {
            if (Local != null) return Local.Select(query);
            await Fresh();
            var rows = new List<object>();
            for (int from = 0; ; from += 1000)
            {
                using (var r = Json("GET", Config.SupabaseUrl + "/rest/v1/" + query + "&limit=1000&offset=" + from, null))
                {
                    r.SetRequestHeader("Authorization", "Bearer " + AccessToken);
                    await Send(r);
                    if (r.result != UnityWebRequest.Result.Success)
                        throw new Exception(query.Split('?')[0] + ": " + r.responseCode + " " + r.downloadHandler.text);
                    var page = (List<object>)MiniJson.Parse(r.downloadHandler.text);
                    rows.AddRange(page);
                    if (page.Count < 1000) return rows;
                }
            }
        }

        // a server function (act_*, is_username_taken...): its JSON result, parsed
        public async Task<object> Rpc(string name, string jsonArgs)
        {
            if (Local != null) return Local.Rpc(name, MiniJson.Parse(jsonArgs) as Dictionary<string, object>);
            await Fresh();
            using (var r = Json("POST", Config.SupabaseUrl + "/rest/v1/rpc/" + name, jsonArgs))
            {
                r.SetRequestHeader("Authorization", "Bearer " + AccessToken);
                await Send(r);
                if (r.result != UnityWebRequest.Result.Success)
                    throw new Exception(name + ": " + r.responseCode + " " + r.downloadHandler.text);
                var t = r.downloadHandler.text;
                return string.IsNullOrEmpty(t) ? null : MiniJson.Parse(t);
            }
        }

        // a new guest session, forgetting the kept one (net.js freshSession): when this device holds
        // another game than the one you're entering, the server asks for one so that game isn't overwritten
        public async Task FreshSession()
        {
            if (Local != null) { Local.LogOut(); return; }
            PlayerPrefs.DeleteKey(SessionKey);
            AccessToken = null;
            UserId = null;
            using (var r = Json("POST", Config.SupabaseUrl + "/auth/v1/signup", "{\"data\":{}}"))
            {
                await Send(r);
                if (r.result != UnityWebRequest.Result.Success)
                    throw new Exception("guest sign-in: " + r.responseCode + " " + r.downloadHandler.text);
                KeepSession((Dictionary<string, object>)MiniJson.Parse(r.downloadHandler.text));
            }
        }

        // a game action arbitrated by the server (net.js act): act_<name>(w, ...args). A chunk nobody froze
        // yet is frozen first (the freeze Edge Function), then the action is tried again.
        public async Task<Dictionary<string, object>> Act(string world, string name, Dictionary<string, object> args)
        {
            var a = new Dictionary<string, object> { ["w"] = world };
            foreach (var kv in args) a[kv.Key] = kv.Value;
            for (int attempt = 0; ; attempt++)
            {
                try { return await Rpc("act_" + name, MiniJson.Write(a)) as Dictionary<string, object>; }
                catch (Exception e)
                {
                    var m = System.Text.RegularExpressions.Regex.Match(e.Message, @"freeze:(-?\d+),(-?\d+)");
                    if (!m.Success || attempt > 0) throw;
                    await Freeze(world, int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value));
                }
            }
        }

        public async Task<Dictionary<string, object>> Freeze(string world, int cx, int cz)
        {
            await Fresh();
            using (var r = Json("POST", Config.SupabaseUrl + "/functions/v1/freeze", MiniJson.Write(new Dictionary<string, object> { ["world"] = world, ["cx"] = cx, ["cz"] = cz })))
            {
                r.SetRequestHeader("Authorization", "Bearer " + AccessToken);
                await Send(r);
                if (r.result != UnityWebRequest.Result.Success) throw new Exception("freeze: " + r.responseCode + " " + r.downloadHandler.text);
                return MiniJson.Parse(r.downloadHandler.text) as Dictionary<string, object>;
            }
        }

        // insert or update a row (supabase-js upsert): players, keyed by (user_id, world)
        public async Task Upsert(string table, string onConflict, Dictionary<string, object> row)
        {
            if (Local != null) { Local.Upsert(table, row); return; }
            await Fresh();
            using (var r = Json("POST", Config.SupabaseUrl + "/rest/v1/" + table + "?on_conflict=" + onConflict, MiniJson.Write(new List<object> { row })))
            {
                r.SetRequestHeader("Authorization", "Bearer " + AccessToken);
                r.SetRequestHeader("Prefer", "resolution=merge-duplicates,return=minimal");
                await Send(r);
                if (r.result != UnityWebRequest.Result.Success) throw new Exception(table + ": " + r.responseCode + " " + r.downloadHandler.text);
            }
        }

        public static string Q(string s) => Uri.EscapeDataString(s);
    }
}
