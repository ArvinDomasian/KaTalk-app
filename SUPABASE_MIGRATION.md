# KaTalk Supabase Migration

## 1. Create Supabase

1. Create a Supabase project.
2. Open SQL Editor.
3. Run `supabase/schema.sql`.
4. Enable email confirmations in Authentication settings.

## 2. Configure The App

Add these to `.env`:

```env
EXPO_PUBLIC_BACKEND_PROVIDER=supabase
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Then fully restart Expo and rebuild the installed APK.

## 3. Existing Firebase Data

Firebase passwords cannot be migrated. Export Firestore collections as JSON files into one folder:

- `userProfiles.json`
- `liveProfiles.json`
- `profilePosts.json`
- `reports.json`
- `admins.json`

Then run:

```powershell
$env:SUPABASE_URL="https://your-project.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
node scripts/migrate-firebase-export-to-supabase.js .\firebase-export
```

Use the service-role key only on your computer. Never put it inside the app.

## 4. Agora Edge Function

Deploy `supabase/functions/agora-token/index.ts` and set:

- `AGORA_APP_ID`
- `AGORA_APP_CERTIFICATE`

Then set `EXPO_PUBLIC_AGORA_TOKEN_ENDPOINT` to the deployed function URL.
