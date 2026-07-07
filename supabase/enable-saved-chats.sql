-- KaTalk saved chats.
-- Run this after supabase/schema.sql and supabase/fix-live-matching-rls.sql.

grant select, insert on public.messages to authenticated;
grant select, update on public.message_matches to authenticated;

drop policy if exists "Message participants send messages" on public.messages;
drop policy if exists "Authenticated message participants send messages" on public.messages;

create policy "Authenticated message participants send messages" on public.messages
  for insert to authenticated
  with check (
    exists (
      select 1 from public.message_matches
      where id = match_id
        and auth.uid() = any(participant_ids)
        and status in ('active', 'saved')
    )
  );
