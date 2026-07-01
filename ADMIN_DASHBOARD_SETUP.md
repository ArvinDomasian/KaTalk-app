# Admin Dashboard Setup

KaTalk now has an admin-only dashboard for reports, bans, manual verification, and basic user stats.

## Create the first admin

Firestore rules do not let a normal user promote themselves. Create the first admin manually in Firebase Console:

1. Open Firebase Console.
2. Go to Firestore Database.
3. Create a collection named `admins`.
4. Create a document whose document ID is the Firebase Auth `uid` of your admin account.
5. Add these fields:

```json
{
  "role": "owner",
  "disabled": false
}
```

After that account signs in, the Profile screen shows `Admin dashboard`.

## Dashboard data

- Reports are stored in `reports`.
- User profiles are stored in `userProfiles`.
- Admin access is stored in `admins`.

Admins can:

- View reported users.
- Ban users.
- Unban users.
- Manually verify users.
- View basic stats.

## Deploy Firestore rules

If Firebase CLI is installed and logged in:

```bash
firebase deploy --only firestore:rules
```

The checked-in `firebase.json` points to `firestore.rules`.
