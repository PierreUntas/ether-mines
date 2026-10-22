// Ether Mines · notifications on a phone (com.unity.mobile.notifications): when you leave the game, it
// leaves a word for later: the shop's new pieces when its week turns, and, if you petted the pink foxes or
// the sky jellyfish today, that they have a new gift for you tomorrow (never in the middle of the night).
// They are cleared when you come back. The phone's own settings can turn them off.
using System;
using System.Collections.Generic;
using EtherMines.Core;
using UnityEngine;
#if UNITY_ANDROID && !UNITY_EDITOR
using Unity.Notifications.Android;
#elif UNITY_IOS && !UNITY_EDITOR
using Unity.Notifications.iOS;
#endif

namespace EtherMines.Game
{
    public sealed class Notify : MonoBehaviour
    {
        public Session Session;
        const string Channel = "ether-mines";

        void Start()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            AndroidNotificationCenter.RegisterNotificationChannel(new AndroidNotificationChannel(Channel, "Ether Mines", "The shop's new week, your animals' gifts", Importance.Default));
            if (AndroidNotificationCenter.UserPermissionToPost == PermissionStatus.NotRequested) new PermissionRequest(); // asks once (Android 13+)
#elif UNITY_IOS && !UNITY_EDITOR
            new AuthorizationRequest(AuthorizationOption.Alert | AuthorizationOption.Sound, false);
#endif
            Clear();
        }

        void OnApplicationPause(bool paused) { if (paused) Schedule(); else Clear(); }
        void OnApplicationQuit() => Schedule();

        // what to say, and in how many seconds
        public List<(string title, string text, double inS)> Plan(DateTime nowUtc)
        {
            var l = new List<(string, string, double)>();
            double now = (nowUtc - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalSeconds;
            double next = Rules.ShopEpoch + (Rules.ShopWeek(now) + 1) * Rules.ShopWeekSeconds;
            l.Add(("The shop has changed", "New pieces are on sale this week. Come and see what's in Ether Mines.", Daytime(nowUtc, next - now)));
            // a gift taken today (act_gift, once a day per animal, by the UTC date): a new one from midnight
            string today = nowUtc.ToString("yyyy-MM-dd");
            bool petted = false;
            if (Session != null && Session.State.TryGetValue("pets", out var po) && po is Dictionary<string, object> pets)
                foreach (var v in pets.Values) if (v as string == today) { petted = true; break; }
            if (petted) l.Add(("New gifts are waiting", "The pink foxes and the sky jellyfish have something for you again today.", Daytime(nowUtc, (nowUtc.Date.AddDays(1) - nowUtc).TotalSeconds)));
            return l;
        }

        // never between 9 pm and 9 am where the phone is: then at 10 am
        static double Daytime(DateTime nowUtc, double inS)
        {
            var at = nowUtc.AddSeconds(inS).ToLocalTime();
            if (at.Hour >= 21) at = at.Date.AddDays(1).AddHours(10);
            else if (at.Hour < 9) at = at.Date.AddHours(10);
            return Math.Max(60, (at.ToUniversalTime() - nowUtc).TotalSeconds);
        }

        void Schedule()
        {
            Clear();
            foreach (var (title, text, inS) in Plan(DateTime.UtcNow))
            {
#if UNITY_ANDROID && !UNITY_EDITOR
                AndroidNotificationCenter.SendNotification(new AndroidNotification { Title = title, Text = text, FireTime = DateTime.Now.AddSeconds(inS) }, Channel);
#elif UNITY_IOS && !UNITY_EDITOR
                iOSNotificationCenter.ScheduleNotification(new iOSNotification
                {
                    Identifier = "em-" + title.GetHashCode().ToString("x"),
                    Title = title, Body = text, ShowInForeground = false,
                    Trigger = new iOSNotificationTimeIntervalTrigger { TimeInterval = TimeSpan.FromSeconds(inS), Repeats = false },
                });
#else
                Debug.Log($"Ether Mines: would notify \"{title}\" in {inS / 3600:0.0} h");
#endif
            }
        }

        static void Clear()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            AndroidNotificationCenter.CancelAllScheduledNotifications();
            AndroidNotificationCenter.CancelAllDisplayedNotifications();
#elif UNITY_IOS && !UNITY_EDITOR
            iOSNotificationCenter.RemoveAllScheduledNotifications();
            iOSNotificationCenter.RemoveAllDeliveredNotifications();
            iOSNotificationCenter.ApplicationBadge = 0;
#endif
        }
    }
}
