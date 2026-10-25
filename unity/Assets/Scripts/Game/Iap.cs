// Ether Mines · in-app purchases (Unity IAP, com.unity.purchasing): the premium pieces and sets, sold by the
// App Store on an iPhone and Google Play on Android, as the web sells them through Stripe (07-interface.js
// buyPremium). The products are rules.js's (STORE_PREFIX + "piece.107", STORE_PREFIX + "set.pow"); a set is
// sold whole, to whoever owns none of it yet (a store product has one price). Nothing is granted here: each
// purchase goes to the "iap-verify" Edge Function, which checks it with Apple's or Google's own server and
// records it (052_store_purchases.sql); only then is the purchase finished with the store and the pieces
// worn. Restoring (Apple asks for the button) sends every past purchase again: the server knows them already.
using System;
using System.Collections.Generic;
using EtherMines.Core;
using UnityEngine;
using UnityEngine.Purchasing;
using UnityEngine.Purchasing.Extension;

namespace EtherMines.Game
{
    public sealed class Iap : IDetailedStoreListener
    {
        public static Iap Instance { get; private set; }
        public Session Session;
        public Progress Progress;
        public event Action Changed; // the store came up, a purchase landed or failed: redraw the shop

        IStoreController store;
        IExtensionProvider ext;
        bool starting;
        public bool Ready => store != null;
        public string Busy { get; private set; } // the product being bought, while it is
        public string Status { get; private set; } = ""; // why the store isn't up, for the shop to say

        // the apps only: the editor and computers have no store (Steam comes later)
        public static bool Supported => Application.platform == RuntimePlatform.IPhonePlayer || Application.platform == RuntimePlatform.Android;
        static string StoreName => Application.platform == RuntimePlatform.IPhonePlayer ? "apple" : "google";

        public static string PieceId(int cosmetic) => Rules.StorePrefix + "piece." + cosmetic;
        public static string SetId(string set) => Rules.StorePrefix + "set." + set;

        public static Iap Start(Session session, Progress progress)
        {
            if (Instance == null) Instance = new Iap();
            Instance.Session = session;
            Instance.Progress = progress;
            Instance.Init();
            return Instance;
        }

        void Init()
        {
            if (store != null || starting || !Supported || Session == null || Session.Net.Offline) return;
            starting = true;
            Status = "Connecting to the store…";
            var builder = ConfigurationBuilder.Instance(StandardPurchasingModule.Instance());
            foreach (var id in Rules.CosmeticIds)
                if (Rules.Cosmetics[id].Premium && Rules.Cosmetics[id].Eur > 0) builder.AddProduct(PieceId(id), ProductType.NonConsumable);
            foreach (var set in Rules.SetEur.Keys) builder.AddProduct(SetId(set), ProductType.NonConsumable);
            UnityPurchasing.Initialize(this, builder);
        }

        // the store's own price, in the player's currency ("4,99 €", "$4.99"), or null before it answers
        public string Price(string productId)
        {
            var p = store?.products.WithID(productId);
            return p != null && p.availableToPurchase ? p.metadata.localizedPriceString : null;
        }

        public void Buy(string productId)
        {
            if (store == null || Busy != null) return;
            var p = store.products.WithID(productId);
            if (p == null || !p.availableToPurchase) { Hud.Feed("burn", "Store", "this piece isn't on sale here yet"); return; }
            Busy = productId;
            Changed?.Invoke();
            store.InitiatePurchase(p);
        }

        // "Restore purchases": every past purchase of this Apple / Google account comes back through ProcessPurchase
        public void Restore()
        {
            if (ext == null) return;
            Action<bool, string> done = (ok, err) => Hud.Feed(ok ? "nft" : "burn", "Purchases", ok ? "restored" : "couldn't restore: " + err);
            if (Application.platform == RuntimePlatform.IPhonePlayer) ext.GetExtension<IAppleExtensions>().RestoreTransactions(done);
            else ext.GetExtension<IGooglePlayStoreExtensions>().RestoreTransactions(done);
        }

        public void OnInitialized(IStoreController controller, IExtensionProvider extensions)
        {
            store = controller;
            ext = extensions;
            starting = false;
            Status = "";
            Changed?.Invoke();
        }
        public void OnInitializeFailed(InitializationFailureReason error) => OnInitializeFailed(error, null);
        public void OnInitializeFailed(InitializationFailureReason error, string message)
        {
            starting = false;
            Status = error == InitializationFailureReason.PurchasingUnavailable ? "In-app purchases are turned off on this device" : "The store isn't available right now";
            Debug.LogWarning("IAP: " + error + " " + message);
            Changed?.Invoke();
        }

        // a purchase the store says is paid (just now, or left unfinished last time, or restored): checked by the
        // server before anything else; the store is only told it's done once the server has it
        public PurchaseProcessingResult ProcessPurchase(PurchaseEventArgs e)
        {
            Verify(e.purchasedProduct);
            return PurchaseProcessingResult.Pending;
        }

        async void Verify(Product p)
        {
            var body = new Dictionary<string, object> { ["store"] = StoreName, ["world"] = Session.World, ["productId"] = p.definition.id };
            if (StoreName == "apple") body["transactionId"] = p.transactionID;
            else body["purchaseToken"] = GoogleToken(p.receipt) ?? p.transactionID;
            Dictionary<string, object> r = null;
            try { r = await Session.Net.Function("iap-verify", body); }
            catch (Exception ex) { Debug.LogWarning(ex); }
            if (Busy == p.definition.id) Busy = null;
            if (r != null && r.TryGetValue("ok", out var ok) && MiniJson.Truthy(ok))
            {
                bool fresh = false;
                if (r.TryGetValue("pieces", out var pcs) && pcs is List<object> list)
                    foreach (var x in list) { int id = MiniJson.ToInt(x); if (!Progress.Cosmetics.Contains(id)) { Progress.Cosmetics.Add(id); fresh = true; } }
                store.ConfirmPendingPurchase(p);
                if (fresh) { Hud.Feed("nft", "Thank you!", Name(p.definition.id) + ": yours, in every world"); Sounds.Click(); }
            }
            else
            {
                string why = r != null && r.TryGetValue("error", out var er) ? er as string : "no answer from the server";
                // a purchase that will never count (another account's, refunded, not ours): finish it with the store,
                // or it comes back at every launch. Anything else (no network...) stays pending, to try again later.
                if (why == "bought by another account" || why == "refunded" || why == "unknown product" || why == "another app") store.ConfirmPendingPurchase(p);
                Hud.Feed("burn", Name(p.definition.id), why == "bought by another account" ? "already bought by another game account" : "not added yet: " + why);
            }
            Changed?.Invoke();
        }

        // Google's purchase token, inside Unity's receipt: {"Payload": "{\"json\": \"{...purchaseToken...}\"}"}
        static string GoogleToken(string receipt)
        {
            try
            {
                var r = MiniJson.Parse(receipt) as Dictionary<string, object>;
                var payload = MiniJson.Parse(r["Payload"] as string) as Dictionary<string, object>;
                var json = MiniJson.Parse(payload["json"] as string) as Dictionary<string, object>;
                return json["purchaseToken"] as string;
            }
            catch { return null; }
        }

        static string Name(string productId)
        {
            var rest = productId.StartsWith(Rules.StorePrefix) ? productId.Substring(Rules.StorePrefix.Length) : productId;
            if (rest.StartsWith("piece.") && int.TryParse(rest.Substring(6), out var id) && Rules.Cosmetics.TryGetValue(id, out var c)) return c.N;
            if (rest.StartsWith("set."))
                foreach (var s in Rules.Sets) if (s[0] == rest.Substring(4)) return s[1] + " set";
            return productId;
        }

        public void OnPurchaseFailed(Product p, PurchaseFailureDescription d) => Failed(p, d.reason, d.message);
        public void OnPurchaseFailed(Product p, PurchaseFailureReason reason) => Failed(p, reason, null);
        void Failed(Product p, PurchaseFailureReason reason, string message)
        {
            if (Busy == p?.definition.id) Busy = null;
            if (reason != PurchaseFailureReason.UserCancelled) Hud.Feed("burn", "Store", "the purchase didn't go through" + (string.IsNullOrEmpty(message) ? "" : ": " + message));
            Changed?.Invoke();
        }
    }
}
