-- Realtime for task status/assignee changes so boards update live for others.
-- REPLICA IDENTITY FULL so filtered DELETE events include organization_id.

alter table public.tasks replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.tasks;
exception
  when duplicate_object then null;
end $$;
