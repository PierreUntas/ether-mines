// Ether Mines · the iPhone's Taptic Engine for Haptics.cs: a light, medium or heavy tap, or a success or
// warning pattern (UIFeedbackGenerator). Called from C# with [DllImport("__Internal")].
#import <UIKit/UIKit.h>

extern "C" void EtherHaptic(int kind)
{
    if (kind <= 2)
    {
        UIImpactFeedbackStyle style = kind == 0 ? UIImpactFeedbackStyleLight : kind == 1 ? UIImpactFeedbackStyleMedium : UIImpactFeedbackStyleHeavy;
        UIImpactFeedbackGenerator *g = [[UIImpactFeedbackGenerator alloc] initWithStyle:style];
        [g prepare];
        [g impactOccurred];
    }
    else
    {
        UINotificationFeedbackGenerator *g = [[UINotificationFeedbackGenerator alloc] init];
        [g prepare];
        [g notificationOccurred:kind == 3 ? UINotificationFeedbackTypeSuccess : UINotificationFeedbackTypeWarning];
    }
}
