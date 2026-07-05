create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  legacy_firebase_uid text unique,
  nickname text not null default 'KaTalk member',
  avatar_url text,
  date_of_birth date not null default '2000-01-01',
  gender text not null default 'Prefer not to say',
  preference text not null default 'Everyone',
  age_range text not null default '21-35',
  interests jsonb not null default '[]'::jsonb,
  comfort text not null default 'balanced',
  auth_method text,
  auth_contact text,
  accepted_terms boolean not null default false,
  accepted_privacy boolean not null default false,
  accepted_rules boolean not null default false,
  subscription jsonb,
  economy jsonb,
  verification jsonb not null default '{"status":"not_started","badgeVisible":false}'::jsonb,
  moderation jsonb not null default '{"isBanned":false}'::jsonb,
  updated_at_ms bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.public_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  legacy_firebase_uid text unique,
  nickname text not null default 'KaTalk member',
  photo_url text,
  date_of_birth date not null default '2000-01-01',
  gender text not null default 'Prefer not to say',
  preference text not null default 'Everyone',
  age_range text not null default '21-35',
  interests jsonb not null default '[]'::jsonb,
  comfort text not null default 'balanced',
  prompt text not null default 'Registered KaTalk member.',
  updated_at_ms bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.public_stories (
  id text primary key,
  profile_id uuid not null references auth.users(id) on delete cascade,
  author_nickname text not null default 'KaTalk member',
  photo_url text,
  body text not null default '',
  created_at_ms bigint not null,
  expires_at_ms bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profile_posts (
  id text primary key,
  profile_id uuid not null references auth.users(id) on delete cascade,
  author_nickname text not null default 'KaTalk member',
  body text not null default '',
  photo_url text,
  emoji text,
  voice_url text,
  music_url text,
  music_title text,
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  created_at_ms bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.blocks (
  id text primary key,
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  match_id text,
  source text,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  action text not null default 'report',
  reporter_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid,
  target_user_id uuid,
  target_id text,
  target_nickname text,
  match_id text,
  reason text not null default 'User report',
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at_ms bigint not null default (extract(epoch from now()) * 1000)::bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admins (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin',
  disabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.message_match_queue (
  user_id uuid primary key references auth.users(id) on delete cascade,
  public_profile jsonb not null,
  status text not null default 'waiting' check (status in ('waiting', 'matched', 'cancelled')),
  match_id uuid,
  created_at_ms bigint not null default (extract(epoch from now()) * 1000)::bigint,
  expires_at_ms bigint,
  updated_at timestamptz not null default now()
);

create table if not exists public.message_matches (
  id uuid primary key default gen_random_uuid(),
  participant_ids uuid[] not null,
  participants jsonb not null,
  status text not null default 'active' check (status in ('active', 'expired', 'saved', 'blocked')),
  opening_prompt text,
  starts_at_ms bigint not null,
  ends_at_ms bigint not null,
  saved_by uuid[] not null default '{}',
  reported_by uuid[] not null default '{}',
  blocked_by uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.message_matches(id) on delete cascade,
  sender_id text not null,
  body text not null,
  sent_at_ms bigint not null,
  sent_at timestamptz not null default now()
);

create table if not exists public.video_match_queue (
  user_id uuid primary key references auth.users(id) on delete cascade,
  public_profile jsonb not null,
  status text not null default 'waiting' check (status in ('waiting', 'matched', 'cancelled')),
  match_id uuid,
  created_at_ms bigint not null default (extract(epoch from now()) * 1000)::bigint,
  expires_at_ms bigint,
  updated_at timestamptz not null default now()
);

create table if not exists public.video_matches (
  id uuid primary key default gen_random_uuid(),
  participant_ids uuid[] not null,
  participants jsonb not null,
  agora_channel_name text not null,
  status text not null default 'active' check (status in ('active', 'ended', 'blocked')),
  reported_by uuid[] not null default '{}',
  blocked_by uuid[] not null default '{}',
  ended_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.voice_rooms (
  id text primary key,
  host_id uuid references auth.users(id) on delete cascade,
  title text not null,
  mood text not null default 'Member',
  topic text not null default 'Registered KaTalk member.',
  participants integer not null default 1,
  speakers jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key references auth.users(id) on delete cascade,
  access jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.legacy_id_map (
  legacy_firebase_uid text primary key,
  supabase_user_id uuid references auth.users(id) on delete cascade,
  email text,
  migrated_at timestamptz not null default now()
);

create index if not exists profile_posts_created_at_idx on public.profile_posts (created_at_ms desc);
create index if not exists public_stories_active_idx on public.public_stories (expires_at_ms desc, created_at_ms desc);
create index if not exists reports_created_at_idx on public.reports (created_at_ms desc);
create index if not exists message_queue_status_idx on public.message_match_queue (status, created_at_ms);
create index if not exists video_queue_status_idx on public.video_match_queue (status, created_at_ms);
create index if not exists blocks_blocker_idx on public.blocks (blocker_id);
create index if not exists blocks_blocked_idx on public.blocks (blocked_id);

alter table public.profiles enable row level security;
alter table public.public_profiles enable row level security;
alter table public.public_stories enable row level security;
alter table public.profile_posts enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.admins enable row level security;
alter table public.message_match_queue enable row level security;
alter table public.message_matches enable row level security;
alter table public.messages enable row level security;
alter table public.video_match_queue enable row level security;
alter table public.video_matches enable row level security;
alter table public.voice_rooms enable row level security;
alter table public.subscriptions enable row level security;
alter table public.legacy_id_map enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where id = auth.uid()
      and disabled = false
  );
$$;

create or replace function public.is_not_banned()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles
    where id = auth.uid()
      and coalesce((moderation->>'isBanned')::boolean, false) = true
  );
$$;

create policy "Users read own profile or admins read all profiles" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "Users write own profile" on public.profiles
  for insert with check (id = auth.uid() and public.is_not_banned());
create policy "Users update own profile" on public.profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

create policy "Signed in users read public profiles" on public.public_profiles
  for select using (auth.uid() is not null);
create policy "Users write own public profile" on public.public_profiles
  for insert with check (id = auth.uid() and public.is_not_banned());
create policy "Users update own public profile" on public.public_profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

create policy "Authenticated users read active public stories" on public.public_stories
  for select using (
    auth.uid() is not null
    and public.is_not_banned()
    and expires_at_ms > (extract(epoch from now()) * 1000)::bigint
  );
create policy "Users create own public stories" on public.public_stories
  for insert with check (
    profile_id = auth.uid()
    and public.is_not_banned()
    and expires_at_ms > created_at_ms
    and expires_at_ms <= created_at_ms + 86400000
  );
create policy "Users update own public stories" on public.public_stories
  for update using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());
create policy "Users delete own public stories" on public.public_stories
  for delete using (profile_id = auth.uid() or public.is_admin());

create policy "Signed in users read visible posts" on public.profile_posts
  for select using (auth.uid() is not null and (visibility = 'public' or profile_id = auth.uid() or public.is_admin()));
create policy "Users create own posts" on public.profile_posts
  for insert with check (profile_id = auth.uid() and public.is_not_banned());
create policy "Users update own posts" on public.profile_posts
  for update using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());
create policy "Users delete own posts" on public.profile_posts
  for delete using (profile_id = auth.uid() or public.is_admin());

create policy "Users read own blocks" on public.blocks
  for select using (blocker_id = auth.uid() or blocked_id = auth.uid() or public.is_admin());
create policy "Users create own blocks" on public.blocks
  for insert with check (blocker_id = auth.uid() and public.is_not_banned());

create policy "Users create own reports" on public.reports
  for insert with check (reporter_id = auth.uid() and public.is_not_banned());
create policy "Admins manage reports" on public.reports
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Admins read admins" on public.admins
  for select using (id = auth.uid() or public.is_admin());
create policy "Admins manage admins" on public.admins
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Signed in users read message queue" on public.message_match_queue
  for select using (auth.uid() is not null and public.is_not_banned());
create policy "Users manage own message queue" on public.message_match_queue
  for all using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_not_banned());

create policy "Message participants read matches" on public.message_matches
  for select using (auth.uid() = any(participant_ids) or public.is_admin());
create policy "Message participants update matches" on public.message_matches
  for update using (auth.uid() = any(participant_ids) or public.is_admin())
  with check (auth.uid() = any(participant_ids) or public.is_admin());
create policy "Signed in users create message matches through rpc" on public.message_matches
  for insert with check (auth.uid() = any(participant_ids) and public.is_not_banned());

create policy "Message participants read messages" on public.messages
  for select using (
    exists (
      select 1 from public.message_matches
      where id = match_id and auth.uid() = any(participant_ids)
    )
  );
create policy "Message participants send messages" on public.messages
  for insert with check (
    exists (
      select 1 from public.message_matches
      where id = match_id and auth.uid() = any(participant_ids) and status = 'active'
    )
  );

create policy "Signed in users read video queue" on public.video_match_queue
  for select using (auth.uid() is not null and public.is_not_banned());
create policy "Users manage own video queue" on public.video_match_queue
  for all using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_not_banned());

create policy "Video participants read matches" on public.video_matches
  for select using (auth.uid() = any(participant_ids) or public.is_admin());
create policy "Video participants update matches" on public.video_matches
  for update using (auth.uid() = any(participant_ids) or public.is_admin())
  with check (auth.uid() = any(participant_ids) or public.is_admin());
create policy "Signed in users create video matches through rpc" on public.video_matches
  for insert with check (auth.uid() = any(participant_ids) and public.is_not_banned());

create policy "Signed in users read voice rooms" on public.voice_rooms
  for select using (auth.uid() is not null and is_active = true);
create policy "Users manage own voice rooms" on public.voice_rooms
  for all using (host_id = auth.uid() or public.is_admin()) with check (host_id = auth.uid() or public.is_admin());

create policy "Users read own subscriptions" on public.subscriptions
  for select using (id = auth.uid() or public.is_admin());
create policy "Users update own subscriptions" on public.subscriptions
  for all using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

create policy "Admins read legacy map" on public.legacy_id_map
  for select using (public.is_admin());

insert into storage.buckets (id, name, public)
values
  ('profile-avatars', 'profile-avatars', true),
  ('profile-posts', 'profile-posts', true),
  ('profile-voice-posts', 'profile-voice-posts', true)
on conflict (id) do nothing;

create policy "Users upload own profile avatars" on storage.objects
  for insert with check (bucket_id = 'profile-avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Signed in users read profile avatars" on storage.objects
  for select using (bucket_id = 'profile-avatars' and auth.uid() is not null);
create policy "Users upload own profile posts media" on storage.objects
  for insert with check (bucket_id in ('profile-posts', 'profile-voice-posts') and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Signed in users read profile post media" on storage.objects
  for select using (bucket_id in ('profile-posts', 'profile-voice-posts') and auth.uid() is not null);

create or replace function public.create_message_match(
  p_other_uid uuid,
  p_current_profile jsonb,
  p_opening_prompt text,
  p_starts_at_ms bigint,
  p_ends_at_ms bigint
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_uid uuid := auth.uid();
  v_other_queue public.message_match_queue%rowtype;
  v_match_id uuid := gen_random_uuid();
begin
  if v_current_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_other_queue
  from public.message_match_queue
  where user_id = p_other_uid and status = 'waiting'
  for update;

  if not found then
    return null;
  end if;

  if exists (
    select 1 from public.blocks
    where (blocker_id = v_current_uid and blocked_id = p_other_uid)
       or (blocker_id = p_other_uid and blocked_id = v_current_uid)
  ) then
    return null;
  end if;

  insert into public.message_matches (
    id,
    participant_ids,
    participants,
    status,
    opening_prompt,
    starts_at_ms,
    ends_at_ms
  )
  values (
    v_match_id,
    array[v_current_uid, p_other_uid],
    jsonb_build_object(v_current_uid::text, p_current_profile, p_other_uid::text, v_other_queue.public_profile),
    'active',
    p_opening_prompt,
    p_starts_at_ms,
    p_ends_at_ms
  );

  insert into public.messages (match_id, sender_id, body, sent_at_ms)
  values (v_match_id, 'system', 'Prompt: ' || p_opening_prompt, p_starts_at_ms);

  insert into public.message_match_queue (user_id, public_profile, status, match_id, created_at_ms, updated_at)
  values (v_current_uid, p_current_profile, 'matched', v_match_id, p_starts_at_ms, now())
  on conflict (user_id) do update set
    public_profile = excluded.public_profile,
    status = 'matched',
    match_id = v_match_id,
    updated_at = now();

  update public.message_match_queue
  set status = 'matched', match_id = v_match_id, updated_at = now()
  where user_id = p_other_uid;

  return v_match_id;
end;
$$;

create or replace function public.create_video_match(
  p_other_uid uuid,
  p_current_profile jsonb,
  p_agora_channel_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_uid uuid := auth.uid();
  v_other_queue public.video_match_queue%rowtype;
  v_match_id uuid := gen_random_uuid();
begin
  if v_current_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_other_queue
  from public.video_match_queue
  where user_id = p_other_uid and status = 'waiting'
  for update;

  if not found then
    return null;
  end if;

  if exists (
    select 1 from public.blocks
    where (blocker_id = v_current_uid and blocked_id = p_other_uid)
       or (blocker_id = p_other_uid and blocked_id = v_current_uid)
  ) then
    return null;
  end if;

  insert into public.video_matches (
    id,
    participant_ids,
    participants,
    agora_channel_name,
    status
  )
  values (
    v_match_id,
    array[v_current_uid, p_other_uid],
    jsonb_build_object(v_current_uid::text, p_current_profile, p_other_uid::text, v_other_queue.public_profile),
    p_agora_channel_name,
    'active'
  );

  insert into public.video_match_queue (user_id, public_profile, status, match_id, created_at_ms, updated_at)
  values (v_current_uid, p_current_profile, 'matched', v_match_id, (extract(epoch from now()) * 1000)::bigint, now())
  on conflict (user_id) do update set
    public_profile = excluded.public_profile,
    status = 'matched',
    match_id = v_match_id,
    updated_at = now();

  update public.video_match_queue
  set status = 'matched', match_id = v_match_id, updated_at = now()
  where user_id = p_other_uid;

  return v_match_id;
end;
$$;
