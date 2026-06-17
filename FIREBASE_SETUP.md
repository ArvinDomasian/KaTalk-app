# Firebase Setup For Real Email Verification

KaTalk cannot send real Gmail/email verification until it is connected to your Firebase project.

## 1. Create or open Firebase project

Go to Firebase Console, create/open your project, then open:

`Project settings` -> `General` -> `Your apps`

Add a Web app if there is no app yet.

## 2. Copy Firebase config

Firebase will show something like this:

```js
const firebaseConfig = {
  apiKey: "abc123",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

## 3. Paste into `.env`

Open `.env` and paste each value like this:

```env
EXPO_PUBLIC_FIREBASE_API_KEY=abc123
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
EXPO_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef
```

## 4. Enable email login

In Firebase Console:

`Authentication` -> `Sign-in method` -> `Email/Password` -> enable

## 5. Restart Expo

Stop the current Expo server completely, then start it again. Expo reads `.env` only when it starts.
