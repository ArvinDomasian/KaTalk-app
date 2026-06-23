# KaTalk Store Release Checklist

This project is now prepared for Expo EAS builds:

- Android test installer: APK
- Android Play Store upload: AAB
- iOS TestFlight/App Store upload: IPA

## One-time Setup

1. Create or log into an Expo account.
2. Install EAS CLI:

```bash
npm install -g eas-cli
```

3. Log in to Expo:

```bash
eas login
```

4. Connect this local app to an Expo EAS project:

```bash
eas init
```

5. Let EAS manage signing credentials when it asks. This is usually the easiest path.

## Build Installers

Build an Android APK for phone testing:

```bash
npm run build:android:preview
```

Build the Android App Bundle for Google Play:

```bash
npm run build:android:store
```

Build the iOS app for TestFlight/App Store:

```bash
npm run build:ios:store
```

Build both store versions:

```bash
npm run build:all:store
```

## Store Accounts Needed

- Google Play Console account for Android.
- Apple Developer account for iOS.
- App Store Connect app record for iOS.
- Google Play app listing for Android.

## Submit Builds

Android:

```bash
npm run submit:android
```

iOS:

```bash
npm run submit:ios
```

Google Play usually needs the first app upload done manually in Play Console before command-line submissions work.

iOS submissions go to App Store Connect/TestFlight first. To release publicly, finish the App Store listing and submit the build for Apple review.

## Before Public Launch

- Add final app icon and splash screen.
- Add privacy policy URL.
- Add Terms and Community Rules pages.
- Add account deletion flow.
- Prepare App Store and Play Store screenshots.
- Prepare store description, keywords, category, and age rating.
- Complete privacy/data safety forms for location, camera, microphone, account info, user content, and moderation.
- Make sure Firebase production rules are locked down.
- Make sure reporting, blocking, moderation, and adult-only controls are ready.
