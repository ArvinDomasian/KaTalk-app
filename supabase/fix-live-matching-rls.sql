-- KaTalk live matching permission repair.
-- Run supabase/schema.sql first, then run this file once in the Supabase SQL Editor.

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.public_profiles to authenticated;
grant select, insert, update, delete on public.profile_posts to authenticated;
grant select, insert, update, delete on public.blocks to authenticated;
grant select, insert, update, delete on public.reports to authenticated;
grant select, insert, update, delete on public.admins to authenticated;
grant select, insert, update, delete on public.message_match_queue to authenticated;
grant select, insert, update, delete on public.message_matches to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update, delete on public.video_match_queue to authenticated;
grant select, insert, update, delete on public.video_matches to authenticated;
grant select, insert, update, delete on public.voice_rooms to authenticated;
grant select, insert, update, delete on public.subscriptions to authenticated;
grant select on public.legacy_id_map to authenticated;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_not_banned() to authenticated;
grant execute on function public.create_message_match(uuid, jsonb, text, bigint, bigint) to authenticated;
grant execute on function public.create_video_match(uuid, jsonb, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.public_profiles enable row level security;
alter table public.message_match_queue enable row level security;
alter table public.message_matches enable row level security;
alter table public.messages enable row level security;
alter table public.video_match_queue enable row level security;
alter table public.video_matches enable row level security;

drop policy if exists "Users read own profile or admins read all profiles" on public.profiles;
drop policy if exists "Users write own profile" on public.profiles;
drop policy if exists "Users update own profile" on public.profiles;
drop policy if exists "Authenticated users read own profile or admins read all profiles" on public.profiles;
drop policy if exists "Authenticated users write own profile" on public.profiles;
drop policy if exists "Authenticated users update own profile" on public.profiles;

create policy "Authenticated users read own profile or admins read all profiles" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "Authenticated users write own profile" on public.profiles
  for insert to authenticated
  with check (id = auth.uid() and public.is_not_banned());

create policy "Authenticated users update own profile" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

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

drop policy if exists "Signed in users read message queue" on public.message_match_queue;
drop policy if exists "Users manage own message queue" on public.message_match_queue;
drop policy if exists "Authenticated users read message queue" on public.message_match_queue;
drop policy if exists "Authenticated users insert own message queue" on public.message_match_queue;
drop policy if exists "Authenticated users update own message queue" on public.message_match_queue;
drop policy if exists "Authenticated users delete own message queue" on public.message_match_queue;

create policy "Authenticated users read message queue" on public.message_match_queue
  for select to authenticated
  using (public.is_not_banned());

create policy "Authenticated users insert own message queue" on public.message_match_queue
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_not_banned());

create policy "Authenticated users update own message queue" on public.message_match_queue
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_not_banned());

create policy "Authenticated users delete own message queue" on public.message_match_queue
  for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Message participants read matches" on public.message_matches;
drop policy if exists "Message participants update matches" on public.message_matches;
drop policy if exists "Signed in users create message matches through rpc" on public.message_matches;
drop policy if exists "Authenticated message participants read matches" on public.message_matches;
drop policy if exists "Authenticated message participants update matches" on public.message_matches;
drop policy if exists "Authenticated users create message matches through rpc" on public.message_matches;

create policy "Authenticated message participants read matches" on public.message_matches
  for select to authenticated
  using (auth.uid() = any(participant_ids) or public.is_admin());

create policy "Authenticated message participants update matches" on public.message_matches
  for update to authenticated
  using (auth.uid() = any(participant_ids) or public.is_admin())
  with check (auth.uid() = any(participant_ids) or public.is_admin());

create policy "Authenticated users create message matches through rpc" on public.message_matches
  for insert to authenticated
  with check (auth.uid() = any(participant_ids) and public.is_not_banned());

drop policy if exists "Message participants read messages" on public.messages;
drop policy if exists "Message participants send messages" on public.messages;
drop policy if exists "Authenticated message participants read messages" on public.messages;
drop policy if exists "Authenticated message participants send messages" on public.messages;

create policy "Authenticated message participants read messages" on public.messages
  for select to authenticated
  using (
    exists (
      select 1 from public.message_matches
      where id = match_id and auth.uid() = any(participant_ids)
    )
  );

create policy "Authenticated message participants send messages" on public.messages
  for insert to authenticated
  with check (
    exists (
      select 1 from public.message_matches
      where id = match_id and auth.uid() = any(participant_ids) and status in ('active', 'saved')
    )
  );

drop policy if exists "Signed in users read video queue" on public.video_match_queue;
drop policy if exists "Users manage own video queue" on public.video_match_queue;
drop policy if exists "Authenticated users read video queue" on public.video_match_queue;
drop policy if exists "Authenticated users insert own video queue" on public.video_match_queue;
drop policy if exists "Authenticated users update own video queue" on public.video_match_queue;
drop policy if exists "Authenticated users delete own video queue" on public.video_match_queue;

create policy "Authenticated users read video queue" on public.video_match_queue
  for select to authenticated
  using (public.is_not_banned());

create policy "Authenticated users insert own video queue" on public.video_match_queue
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_not_banned());

create policy "Authenticated users update own video queue" on public.video_match_queue
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_not_banned());

create policy "Authenticated users delete own video queue" on public.video_match_queue
  for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Video participants read matches" on public.video_matches;
drop policy if exists "Video participants update matches" on public.video_matches;
drop policy if exists "Signed in users create video matches through rpc" on public.video_matches;
drop policy if exists "Authenticated video participants read matches" on public.video_matches;
drop policy if exists "Authenticated video participants update matches" on public.video_matches;
drop policy if exists "Authenticated users create video matches through rpc" on public.video_matches;

create policy "Authenticated video participants read matches" on public.video_matches
  for select to authenticated
  using (auth.uid() = any(participant_ids) or public.is_admin());

create policy "Authenticated video participants update matches" on public.video_matches
  for update to authenticated
  using (auth.uid() = any(participant_ids) or public.is_admin())
  with check (auth.uid() = any(participant_ids) or public.is_admin());

create policy "Authenticated users create video matches through rpc" on public.video_matches
  for insert to authenticated
  with check (auth.uid() = any(participant_ids) and public.is_not_banned());

do $$
begin
  begin
    alter publication supabase_realtime add table public.message_match_queue;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.message_matches;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.messages;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.video_match_queue;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.video_matches;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
