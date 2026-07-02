const { AndroidConfig } = require('expo/config-plugins');

/**
 * Config plugin RevenueCat (react-native-purchases).
 *
 * Le SDK n'expédie pas de config plugin officiel (l'autolinking suffit pour
 * le natif) — ce plugin local rend explicite la permission Google Play
 * Billing dans l'AndroidManifest du build EAS/prebuild. Côté iOS, la
 * capability « In-App Purchase » est implicite au provisioning App Store.
 *
 * Les clés publiques SDK sont lues au runtime :
 * EXPO_PUBLIC_REVENUECAT_IOS_KEY / EXPO_PUBLIC_REVENUECAT_ANDROID_KEY
 * (cf. lib/purchases.ts — sans clé, l'achat est désactivé, pas de crash).
 */
const withRevenueCat = (config) =>
  AndroidConfig.Permissions.withPermissions(config, ['com.android.vending.BILLING']);

module.exports = withRevenueCat;
