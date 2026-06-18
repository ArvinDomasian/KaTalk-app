# Firestore Setup For Real Message Matching

KaTalk Message Match now uses Firestore so two real signed-in users can match and chat.

Live matching uses these collections:

- `liveProfiles`
- `liveMessageMatchQueue`
- `liveMessageMatches`
- `liveMessageMatches/{matchId}/messages`
- `liveBlocks`

## Enable Firestore

In Firebase Console:

`Build` -> `Firestore Database` -> `Create database`

Choose a region near your users. For early local testing, you can start with development rules.

## Temporary development rules

Use these only while testing with trusted users:

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

These rules require Firebase sign-in, but they are still too open for a public launch. Before public beta, replace them with locked rules for `liveProfiles`, `liveMessageMatchQueue`, `liveMessageMatches`, and message subcollections.

`liveBlocks` stores block records so two blocked users do not get paired again.

## Enable Storage for photo posts

Profile photo posts use Firebase Storage on web.

In Firebase Console:

`Build` -> `Storage` -> `Get started`

For early local testing with verified users, use temporary Storage rules like this:

```js
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    match /profile-posts/{userId}/{fileName} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

These rules let anyone view profile post images, but only the signed-in owner can upload to their own folder.

## Test Real Matching

1. Start the app on two devices or two browsers.
2. Register and verify two different emails.
3. Log in to both accounts. The app can now enter the main screen even if the dating profile is still a starter profile.
4. Tap `Find Chat` on the first account.
5. Tap `Find Chat` on the second account.
6. Both should enter the same anonymous 2-minute chat.
7. Send messages from both accounts.
8. Wait for the timer to end. Both accounts should automatically return to the matching screen.
