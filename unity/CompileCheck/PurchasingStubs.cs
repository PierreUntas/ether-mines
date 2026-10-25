// Stand-ins for Unity IAP (com.unity.purchasing 4.x, the version in Packages/manifest.json): only the
// signatures Iap.cs uses, so CompileCheck type-checks it without the package.
using System;
namespace UnityEngine.Purchasing
{
    public enum ProductType { Consumable, NonConsumable, Subscription }
    public static class MiniJson { } // the package has one too: a script using both must say which (Iap.cs)
    public enum InitializationFailureReason { PurchasingUnavailable, NoProductsAvailable, AppNotKnown }
    public enum PurchaseProcessingResult { Complete, Pending }
    public enum PurchaseFailureReason { PurchasingUnavailable, ExistingPurchasePending, ProductUnavailable, SignatureInvalid, UserCancelled, PaymentDeclined, DuplicateTransaction, Unknown }
    public interface IPurchasingModule { }
    public class StandardPurchasingModule : IPurchasingModule { public static StandardPurchasingModule Instance() => null; }
    public class ConfigurationBuilder
    {
        public static ConfigurationBuilder Instance(IPurchasingModule first, params IPurchasingModule[] rest) => null;
        public ConfigurationBuilder AddProduct(string id, ProductType type) => this;
    }
    public class ProductDefinition { public string id; }
    public class ProductMetadata { public string localizedPriceString; }
    public class Product { public ProductDefinition definition; public ProductMetadata metadata; public bool availableToPurchase; public string transactionID, receipt; }
    public class ProductCollection { public Product WithID(string id) => null; }
    public interface IStoreController { ProductCollection products { get; } void InitiatePurchase(Product p); void ConfirmPendingPurchase(Product p); }
    public interface IStoreExtension { }
    public interface IExtensionProvider { T GetExtension<T>() where T : IStoreExtension; }
    public interface IAppleExtensions : IStoreExtension { void RestoreTransactions(Action<bool, string> callback); }
    public interface IGooglePlayStoreExtensions : IStoreExtension { void RestoreTransactions(Action<bool, string> callback); }
    public class PurchaseEventArgs { public Product purchasedProduct; }
    public interface IStoreListener
    {
        void OnInitialized(IStoreController controller, IExtensionProvider extensions);
        void OnInitializeFailed(InitializationFailureReason error);
        void OnInitializeFailed(InitializationFailureReason error, string message);
        PurchaseProcessingResult ProcessPurchase(PurchaseEventArgs e);
        void OnPurchaseFailed(Product p, PurchaseFailureReason reason);
    }
    public interface IDetailedStoreListener : IStoreListener { void OnPurchaseFailed(Product p, Extension.PurchaseFailureDescription d); }
    public static class UnityPurchasing { public static void Initialize(IStoreListener listener, ConfigurationBuilder builder) { } }
}
namespace UnityEngine.Purchasing.Extension
{
    public class PurchaseFailureDescription { public PurchaseFailureReason reason; public string message; }
}
