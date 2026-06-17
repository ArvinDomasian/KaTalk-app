# KaTalk

KaTalk is an introvert-friendly dating app prototype for Android and iOS. The current build is an Expo + React Native scaffold with local mock services that mirror the planned Firebase and Agora backend.

## Current Build

- Adult-only registration with date-of-birth 18+ check.
- Required Terms, Privacy Policy, and Community Rules consent.
- Real Firebase email verification for Apple/Google email registration once Firebase env values are configured.
- Anonymous-first profile setup and safety onboarding.
- Tab 1: one-to-one message matching with a visible 2-minute timer.
- Tab 1 automatically ends the chat when the timer reaches zero.
- Tab 1 has no audio call and no manual change-match button.
- Saved matches are created only when both users save before the timer ends.
- Tab 2: group voice room UI with join, leave, mute, and report controls.
- Tab 3: optional video match UI with camera off by default, muted microphone, leave, report, and block.
- Tab 3 nearby discovery shows distance and profile preview only.
- Tab 3 has no chat, intro messages, or chat requests.
- Local service layer for future Firebase, Firestore, Cloud Functions, Agora, and moderation integration.

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

Real email verification requires Firebase Auth config. Copy `.env.example` to `.env`, fill in the `EXPO_PUBLIC_FIREBASE_*` values from your Firebase project, and enable Email/Password sign-in in Firebase Authentication. Blank values will not send emails, and Expo must be fully restarted after editing `.env`.

## Verification

Run TypeScript checking after dependencies are installed:

```bash
npm run typecheck
```

Manual checks:

- Under-18 date of birth cannot enter the app.
- Registration requires all three consent checkboxes.
- Apple/Google email registration sends a real Firebase verification email when Firebase is configured.
- Message Match starts a text-only chat and shows `2:00`.
- The message chat ends automatically when the timer reaches zero.
- There is no manual Change Match button.
- Saved match appears only when both sides save before expiry.
- Report/block creates a local safety record.
- Blocked candidates no longer appear in message matching, video matching, or nearby discovery.
- Voice rooms can be joined, muted, left, and reported.
- Video starts with camera off and microphone muted.
- Nearby profile actions do not create chats.

## Backend Next Steps

- Replace `src/services/localAppServices.ts` with Firebase-backed implementations.
- Move the message-match timer to Cloud Functions so it is server-authoritative.
- Generate Agora channel tokens from the backend for voice rooms and video.
- Store reports, blocks, saved matches, consent versions, and location records in Firestore.
- Add an admin moderation dashboard before public beta.
