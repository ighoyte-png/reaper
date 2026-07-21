-- Realtime for bulletin board so dashboard + nav badge update live.
-- REPLICA IDENTITY FULL so filtered DELETE events include organization_id.

alter table public.bulletins replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.bulletins;
exception
  when duplicate_object then null;
end $$;
