# KaTalk Real Subscription Setup

KaTalk uses RevenueCat with Apple App Store and Google Play subscriptions. There is no mock payment button in the app.

## Required RevenueCat Setup

1. Create a RevenueCat project for KaTalk.
2. Add an iOS app and Android app in RevenueCat.
3. Create one paid entitlement named `katalk_plus`.
4. Create real App Store Connect and Google Play products.
5. Attach all paid subscription products to the `katalk_plus` entitlement.
6. Create a RevenueCat Offering and add the subscription packages.

Keep the entitlement as `katalk_plus` for now so existing app code and store setup stay compatible. The app detects the user-facing tier from the product ID.

## Recommended Subscription Products

Use product IDs that contain these tier names so KaTalk can label the active membership correctly:

| Tier | Example product ID | Suggested price |
| --- | --- | --- |
| Premium | `katalk_premium_monthly` | `$9.99/month` |
| Premium Plus | `katalk_premium_plus_monthly` | `$19.99/month` |
| VIP | `katalk_vip_monthly` | `$29.99/month` |

Optional yearly products can use IDs like `katalk_premium_yearly`, `katalk_premium_plus_yearly`, and `katalk_vip_yearly`.

## Optional One-Time Purchases

Create these later as real non-subscription products in Apple and Google, then expose them through RevenueCat before adding purchase buttons:

| Item | Example product ID |
| --- | --- |
| 1 Boost | `katalk_boost_1` |
| 5 Boosts | `katalk_boost_5` |
| 10 Super Likes | `katalk_super_likes_10` |
| Profile Spotlight | `katalk_profile_spotlight` |
| Fast Verification | `katalk_fast_verification` |
| 100 Coins | `katalk_coins_100` |
| 500 Coins | `katalk_coins_500` |
| 1000 Coins | `katalk_coins_1000` |

## Required `.env` Values

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

## Important Testing Notes

- Real mobile purchases must be tested in an Android/iOS build, not the web preview.
- Android needs `com.android.vending.BILLING`; this app already includes it in `app.json`.
- Apple needs In-App Purchase capability enabled for the app in App Store Connect / Xcode signing.
- Use store sandbox/test accounts before public release.
- The app will only show real purchasable plans after RevenueCat returns live Offering packages.
