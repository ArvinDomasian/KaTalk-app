# KaTalk

KaTalk is an introvert-friendly dating app for Android and iOS built with Expo, React Native, Supabase, and Agora.

## Current Build

- Adult-only registration with date-of-birth 18+ check.
- Required Terms, Privacy Policy, and Community Rules consent.
- Real Supabase email verification for registration once Supabase env values are configured.
- Anonymous-first profile setup and safety onboarding.
- Tab 1: one-to-one message matching with a visible 2-minute timer.
- Tab 1 automatically ends the chat when the timer reaches zero.
- Tab 1 has no audio call and no manual change-match button.
- Saved matches are created only when both users save before the timer ends.
- Tab 2: group voice room UI with join, leave, mute, and report controls.
- Tab 3: Supabase-backed real-user video matching with a private Agora channel.
- Video calls include camera off by default, mute, camera reveal, camera flip, speaker, duration, reconnect state, leave, report, and block.
- Tab 3 nearby discovery shows distance and profile preview only.
- Tab 3 has no chat, intro messages, or chat requests.
- Nearby discovery remains a prototype data source until location-backed discovery is connected.

## Setup

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm run start
```

Then open it with Expo Go, an Android emulator, an iOS simulator, or the Expo web target.

Real email verification requires Supabase Auth config. Copy `.env.example` to `.env`, fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and enable Email/Password sign-in in Supabase Authentication. Blank values will not send emails, and Expo must be fully restarted after editing `.env`.

Real video calls require `EXPO_PUBLIC_AGORA_APP_ID`. The browser and Expo Go cannot run the native Agora call engine, so video must be tested in an installed EAS Android/iOS build. Production calls should also set `EXPO_PUBLIC_AGORA_TOKEN_ENDPOINT`; the secure server must return an Agora token for the requested channel and user ID.

## Verification

Run TypeScript checking after dependencies are installed:

```bash
npm run typecheck
```

Manual checks:

- Under-18 date of birth cannot enter the app.
- Registration requires all three consent checkboxes.
- Email registration sends a real Supabase verification email when Supabase is configured.
- Message Match starts a text-only chat and shows `2:00`.
- The message chat ends automatically when the timer reaches zero.
- There is no manual Change Match button.
- Saved match appears only when both sides save before expiry.
- Report/block creates a local safety record.
- Blocked candidates no longer appear in message matching, video matching, or nearby discovery.
- Voice rooms can be joined, muted, left, and reported.
- Video starts with camera off and microphone muted.
- Two installed mobile builds can join the same Agora video channel after Supabase pairs them.
- Camera, microphone, camera flip, speaker, leave, report, block, and reconnect states work during a call.
- Nearby profile actions do not create chats.

## Store Builds

This app is configured for Expo EAS builds with `eas.json`.

Install and log into EAS once:

```bash
npm install -g eas-cli
eas login
eas init
```

Build an Android APK for phone testing:

```bash
npm run build:android:preview
```

Build store files:

```bash
npm run build:android:store
npm run build:ios:store
```

Submit store builds:

```bash
npm run submit:android
npm run submit:ios
```

See `STORE_RELEASE_CHECKLIST.md` for the full Play Store and App Store release checklist.

## Backend Next Steps

- Keep moving matching/timer authority into Supabase RPC or Edge Functions.
- Deploy the Agora token endpoint before production so the App Certificate never ships inside the app.
- Store consent versions and location records in Supabase.
- Harden the admin moderation dashboard before public beta.
