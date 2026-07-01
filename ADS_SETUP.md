# KaTalk Rewarded Ads Setup

KaTalk uses `react-native-google-mobile-ads` for rewarded ads in Android and iOS builds.

## Current Development Mode

The app currently uses Google official test AdMob IDs by default:

| Platform | Rewarded ad unit |
| --- | --- |
| Android | `ca-app-pub-3940256099942544/5224354917` |
| iOS | `ca-app-pub-3940256099942544/1712485313` |

These test IDs are safe during development and should be replaced before release.

## Reward Behavior

Free users can tap `Reward ad` in the Profile tab.

- The app loads a real rewarded ad through Google Mobile Ads.
- The user receives `+5` free likes only after the SDK fires the earned-reward event.
- If the user closes the ad early, no reward is added.
- Paid members do not see ad rewards because memberships remove ads.

## Production `.env` Values

Create real Android and iOS apps in AdMob, then add these values to `.env` before building:

```env
EXPO_PUBLIC_ADMOB_ANDROID_APP_ID=ca-app-pub-xxxxxxxxxxxxxxxx~xxxxxxxxxx
EXPO_PUBLIC_ADMOB_IOS_APP_ID=ca-app-pub-xxxxxxxxxxxxxxxx~xxxxxxxxxx
EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_AD_UNIT_ID=ca-app-pub-xxxxxxxxxxxxxxxx/xxxxxxxxxx
EXPO_PUBLIC_ADMOB_IOS_REWARDED_AD_UNIT_ID=ca-app-pub-xxxxxxxxxxxxxxxx/xxxxxxxxxx
```

After changing AdMob IDs, rebuild the Android/iOS app. AdMob is native code and will not work in the browser preview.

## Store Checklist

- In Google Play Console, mark that the app contains ads.
- Keep test ads enabled during testing.
- Replace all Google test IDs before public release.
- Add consent/privacy handling before serving personalized ads in regions that require it.
