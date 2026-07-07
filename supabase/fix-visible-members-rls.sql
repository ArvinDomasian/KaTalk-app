-- KaTalk visible member discovery repair.
-- Run this if Rooms/Video/Message says registered members could not load.

grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.public_profiles to authenticated;
grant select, insert, update, delete on public.blocks to authenticated;
grant select on public.voice_rooms to authenticated;

alter table public.profiles enable row level security;
alter table public.public_profiles enable row level security;
alter table public.blocks enable row level security;
alter table public.voice_rooms enable row level security;

drop policy if exists "Signed in users read public profiles" on public.public_profiles;
drop policy if exists "Users write own public profile" on public.public_profiles;
drop policy if exists "Users update own public profile" on public.public_profiles;
drop policy if exists "Authenticated users read public profiles" on public.public_profiles;
drop policy if exists "Authenticated users write own public profile" on public.public_profiles;
drop policy if exists "Authenticated users update own public profile" on public.public_profiles;

create policy "Authenticated users read public profiles" on public.public_profiles
  for select to authenticated
  using (public.is_not_banned());

create policy "Authenticated users write own public profile" on public.public_profiles
  for insert to authenticated
  with check (id = auth.uid() and public.is_not_banned());

create policy "Authenticated users update own public profile" on public.public_profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists "Users read own blocks" on public.blocks;
drop policy if exists "Users create own blocks" on public.blocks;
drop policy if exists "Authenticated users read own blocks" on public.blocks;
drop policy if exists "Authenticated users create own blocks" on public.blocks;

create policy "Authenticated users read own blocks" on public.blocks
  for select to authenticated
  using (blocker_id = auth.uid() or blocked_id = auth.uid() or public.is_admin());

create policy "Authenticated users create own blocks" on public.blocks
  for insert to authenticated
  with check (blocker_id = auth.uid() and public.is_not_banned());

drop policy if exists "Signed in users read voice rooms" on public.voice_rooms;
drop policy if exists "Users manage own voice rooms" on public.voice_rooms;
drop policy if exists "Authenticated users read voice rooms" on public.voice_rooms;
drop policy if exists "Authenticated users manage own voice rooms" on public.voice_rooms;

create policy "Authenticated users read voice rooms" on public.voice_rooms
  for select to authenticated
  using (public.is_not_banned() and is_active = true);

create policy "Authenticated users manage own voice rooms" on public.voice_rooms
  for all to authenticated
  using (host_id = auth.uid() or public.is_admin())
  with check (host_id = auth.uid() or public.is_admin());
