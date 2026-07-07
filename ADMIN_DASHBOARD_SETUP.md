# Admin Dashboard Setup

KaTalk uses Supabase for the admin dashboard, reports, bans, manual verification, and basic user stats.

## Create the first admin

Create the first admin manually in Supabase:

1. Open Supabase.
2. Go to Authentication and copy your admin user's `id`.
3. Open Table Editor or SQL Editor.
4. Insert a row into `admins` with that user id.

```sql
insert into public.admins (id, role, disabled)
values ('YOUR_SUPABASE_AUTH_USER_ID', 'owner', false)
on conflict (id) do update
set role = excluded.role,
    disabled = excluded.disabled;
```

After that account signs in, the Profile screen shows `Admin dashboard`.

## Dashboard data

- Reports are stored in `reports`.
- User profiles are stored in `profiles`.
- Admin access is stored in `admins`.

Admins can view reports, ban or unban users, manually verify users, and view basic stats.

## Security

Run `supabase/schema.sql` and the Supabase repair SQL files in the Supabase SQL Editor. Admin-only access is controlled by Row Level Security and the `admins` table.
