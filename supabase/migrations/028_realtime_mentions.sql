-- Realtime for @mention tags so dashboard Tagged Comments + nav badge update live.
-- REPLICA IDENTITY FULL so filtered DELETE events include organization_id.

alter table public.task_comments replica identity full;
alter table public.task_comment_mentions replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.task_comments;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.task_comment_mentions;
exception
  when duplicate_object then null;
end $$;
