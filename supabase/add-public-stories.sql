-- KaTalk public stories.
-- Stories are visible to signed-in KaTalk members and expire after 24 hours.

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

create index if not exists public_stories_active_idx
  on public.public_stories (expires_at_ms desc, created_at_ms desc);

alter table public.public_stories enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.public_stories to authenticated;

drop policy if exists "Authenticated users read active public stories" on public.public_stories;
drop policy if exists "Users create own public stories" on public.public_stories;
drop policy if exists "Users update own public stories" on public.public_stories;
drop policy if exists "Users delete own public stories" on public.public_stories;

create policy "Authenticated users read active public stories" on public.public_stories
  for select to authenticated
  using (
    public.is_not_banned()
    and expires_at_ms > (extract(epoch from now()) * 1000)::bigint
  );

create policy "Users create own public stories" on public.public_stories
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and public.is_not_banned()
    and expires_at_ms > created_at_ms
    and expires_at_ms <= created_at_ms + 86400000
  );

create policy "Users update own public stories" on public.public_stories
  for update to authenticated
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

create policy "Users delete own public stories" on public.public_stories
  for delete to authenticated
  using (profile_id = auth.uid() or public.is_admin());

do $$
begin
  begin
    alter publication supabase_realtime add table public.public_stories;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
