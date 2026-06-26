# KaTalk Real Subscription Setup

KaTalk now uses RevenueCat with Apple App Store / Google Play subscriptions. There is no mock payment button in the app.

## Required RevenueCat setup

1. Create a RevenueCat project for KaTalk.
2. Add an iOS app and Android app in RevenueCat.
3. Create one entitlement named `katalk_plus`.
4. Create App Store Connect and Google Play subscription products.
5. Attach those products to the `katalk_plus` entitlement.
6. Create an Offering in RevenueCat and add the subscription packages.

## Required `.env` values

Add these values to `.env`, then rebuild the native app:

```env
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_xxxxxxxxxxxxxxxxx
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_xxxxxxxxxxxxxxxxx
EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID=katalk_plus
```

Optional, only if you configure RevenueCat Web Billing:

```env
EXPO_PUBLIC_REVENUECAT_WEB_API_KEY=web_xxxxxxxxxxxxxxxxx
```

## Important testing notes

- Real mobile purchases must be tested in an Android/iOS build, not the web preview.
- Android needs `com.android.vending.BILLING`; this app already includes it in `app.json`.
- Apple needs In-App Purchase capability enabled for the app in App Store Connect / Xcode signing.
- Use store sandbox/test accounts before public release.
